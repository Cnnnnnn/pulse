/**
 * src/main/vault/vault-portability.ts
 *
 * 密钥库导入导出 (v2.83)。
 *
 * 导出文件格式 (明文 JSON, 0600, 导出前 renderer 需二次确认):
 *   { schema: "pulse.vault.export.v1", exportedAt, entries: [{ name, category, value, note, expiresAt }] }
 * safeStorage 加密是机器绑定的, 跨机迁移只能明文 — 文件由用户自行保管。
 *
 * 安全约定: 明文只在主进程内存流转。
 *   - import-load 读文件后把明文 entries 缓存在主进程模块内 (importId 关联),
 *     给 renderer 的预览只含掩码 hint, 不含 value;
 *   - import-apply 凭 importId 从主进程缓存合并, renderer 全程不经手密钥。
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

import {
  listIndexEntries,
  readEntryFull,
  setEntry,
  hasEntryNamed,
  maskHint,
} from "./secret-vault";

const EXPORT_SCHEMA = "pulse.vault.export.v1";
const IMPORT_PREVIEW_MAX = 200;

type ImportEntry = {
  name: string;
  category: string;
  value: string;
  note: string;
  expiresAt: number | null;
};

// import-load → import-apply 之间的主进程内存缓存
let _importCache: { importId: string; entries: ImportEntry[] } | null = null;

function resetImportCacheForTest() {
  _importCache = null;
}

function defaultExportPath(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `pulse-vault-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
}

/** 深层 require dialog (测试注入 fake)。 */
function openSaveDialog(dialog: any, opts: any): any {
  return dialog.showSaveDialogSync
    ? dialog.showSaveDialogSync(opts)
    : null;
}

function openOpenDialog(dialog: any, opts: any): any {
  return dialog.showOpenDialogSync
    ? dialog.showOpenDialogSync(opts)
    : null;
}

/**
 * 导出全部条目到用户选择的文件。
 * @returns {ok:true, path, count} | {ok:false, reason:"cancelled"|...}
 */
export function exportVaultToFile(dialog: any): {
  ok: boolean;
  reason?: string;
  path?: string;
  count?: number;
  error?: string;
} {
  if (!dialog || typeof dialog !== "object") {
    return { ok: false, reason: "no_dialog" };
  }
  const target = openSaveDialog(dialog, {
    title: "导出密钥库",
    defaultPath: defaultExportPath(),
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!target) return { ok: false, reason: "cancelled" };

  const entries: any[] = [];
  for (const meta of listIndexEntries()) {
    const full = readEntryFull(meta.id);
    if (!full) continue; // 解密失败条目跳过, 不中断导出
    entries.push({
      name: meta.name,
      category: meta.category,
      value: full.value,
      note: full.note,
      expiresAt: meta.expiresAt,
    });
  }

  const payload = JSON.stringify(
    { schema: EXPORT_SCHEMA, exportedAt: Date.now(), entries },
    null,
    2,
  );
  try {
    fs.writeFileSync(target, payload, { mode: 0o600 });
  } catch (err: any) {
    return { ok: false, reason: "write_failed", error: err && err.message };
  }
  return { ok: true, path: target, count: entries.length };
}

function parseImportPayload(raw: string): {
  ok: boolean;
  reason?: string;
  entries?: ImportEntry[];
} {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (!parsed || parsed.schema !== EXPORT_SCHEMA || !Array.isArray(parsed.entries)) {
    return { ok: false, reason: "invalid_schema" };
  }
  const entries: ImportEntry[] = [];
  for (const e of parsed.entries) {
    if (!e || typeof e.name !== "string" || typeof e.value !== "string") continue;
    if (!e.name.trim() || !e.value.trim()) continue;
    let expiresAt: number | null = null;
    if (typeof e.expiresAt === "number" && Number.isFinite(e.expiresAt) && e.expiresAt > 0) {
      expiresAt = e.expiresAt;
    }
    entries.push({
      name: String(e.name).trim().slice(0, 100),
      category: typeof e.category === "string" ? e.category.trim().slice(0, 50) : "",
      value: String(e.value).trim(),
      note: typeof e.note === "string" ? e.note.trim().slice(0, 500) : "",
      expiresAt,
    });
  }
  return { ok: true, entries };
}

/**
 * 选文件 + 解析, 返回预览 (掩码, 无明文)。明文缓存在主进程, importId 回传。
 */
export function loadVaultImportFile(dialog: any): {
  ok: boolean;
  reason?: string;
  importId?: string;
  fileName?: string;
  total?: number;
  invalidCount?: number;
  error?: string;
  entries?: Array<{
    name: string;
    category: string;
    hint: string;
    note: string;
    expiresAt: number | null;
    conflict: boolean;
  }>;
} {
  if (!dialog || typeof dialog !== "object") {
    return { ok: false, reason: "no_dialog" };
  }
  const picked = openOpenDialog(dialog, {
    title: "导入密钥库",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (!picked || !picked.length) return { ok: false, reason: "cancelled" };
  const file = picked[0];
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err: any) {
    return { ok: false, reason: "read_failed", error: err && err.message };
  }
  const parsed = parseImportPayload(raw);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const entries = parsed.entries!.slice(0, IMPORT_PREVIEW_MAX);
  const invalidCount = parsed.entries!.length - entries.length;
  _importCache = { importId: crypto.randomUUID(), entries };
  return {
    ok: true,
    importId: _importCache.importId,
    fileName: path.basename(file),
    total: entries.length,
    invalidCount,
    entries: entries.map((e) => ({
      name: e.name,
      category: e.category,
      hint: maskHint(e.value),
      note: e.note,
      expiresAt: e.expiresAt,
      conflict: hasEntryNamed(e.name),
    })),
  };
}

/**
 * 按 importId 合并缓存里的条目 (upsert: 同名更新, 新名新建)。
 */
export function applyVaultImport(importId: unknown): {
  ok: boolean;
  reason?: string;
  imported?: number;
  updated?: number;
  failed?: number;
} {
  if (!_importCache || typeof importId !== "string" || importId !== _importCache.importId) {
    return { ok: false, reason: "no_import_session" };
  }
  let imported = 0;
  let updated = 0;
  let failed = 0;
  for (const e of _importCache.entries) {
    const exists = hasEntryNamed(e.name);
    const res = setEntry({
      name: e.name,
      category: e.category,
      value: e.value,
      note: e.note,
      expiresAt: e.expiresAt,
      upsert: true,
    });
    if (res.ok) {
      if (exists) updated += 1;
      else imported += 1;
    } else {
      failed += 1;
    }
  }
  _importCache = null;
  return { ok: true, imported, updated, failed };
}

module.exports = {
  exportVaultToFile,
  loadVaultImportFile,
  applyVaultImport,
  EXPORT_SCHEMA,
  resetImportCacheForTest,
};
