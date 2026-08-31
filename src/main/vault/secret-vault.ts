/**
 * src/main/vault/secret-vault.ts
 *
 * 密钥库（v2.83）：任意 token / API key 的加密存储。
 *
 * 存储模型（镜像 src/ai-sessions/storage.ts 的 safeStorage 模式）:
 *   - 索引  userData/vault/secrets-index.json     明文元数据（id/name/category/hint/时间戳）
 *   - blob  userData/vault/entries/<id>.bin       safeStorage 加密的 JSON { value, note }
 *
 * 安全约定:
 *   - 解密只发生在主进程；renderer 只拿掩码 hint + note，明文仅 reveal/copy 显式动作。
 *   - safeStorage 不可用时拒绝保存（宁可拒绝也不落明文，同 ai-sessions 策略）。
 *   - 日志与错误信息不得带出 value。
 */

import type { VaultEntryMeta, VaultListResponse, VaultMutationResponse, VaultRevealResponse, VaultCopyResponse, VaultDeleteResponse } from "../../shared/ipc-contracts";

import fs from "fs";
import path from "path";
import crypto from "crypto";

// ─── 测试注入 ────────────────────────────────────────

let _safeStorageOverride: any = null;
let _userDataDirOverride: any = null;
let _clipboardOverride: any = null;
let _setTimeoutOverride: ((_fn: () => void, _ms: number) => unknown) | null = null;
let _clearTimeoutOverride: ((_id: unknown) => void) | null = null;

export function __setSafeStorageForTest(safeStorage: any) {
  _safeStorageOverride = safeStorage || null;
}
export function __setUserDataDirForTest(dir: any) {
  _userDataDirOverride = dir || null;
}
export function __setClipboardForTest(clipboard: any) {
  _clipboardOverride = clipboard || null;
}
export function __setTimersForTest(setTimeoutFn: any, clearTimeoutFn: any) {
  _setTimeoutOverride = setTimeoutFn || null;
  _clearTimeoutOverride = clearTimeoutFn || null;
}
export function __resetForTest() {
  _safeStorageOverride = null;
  _userDataDirOverride = null;
  _clipboardOverride = null;
  _setTimeoutOverride = null;
  _clearTimeoutOverride = null;
}

function _tryGetSafeStorage() {
  if (_safeStorageOverride) return _safeStorageOverride;
  try {
    return require("electron").safeStorage;
  } catch {
    return null;
  }
}

function _tryGetUserDataDir() {
  if (_userDataDirOverride) return _userDataDirOverride;
  try {
    const { app } = require("electron");
    return app.getPath("userData");
  } catch {
    return null;
  }
}

function _tryGetClipboard() {
  if (_clipboardOverride) return _clipboardOverride;
  try {
    return require("electron").clipboard;
  } catch {
    return null;
  }
}

function _logWarn(msg: string) {
  try {
    const { mainLog } = require("../log.ts");
    if (mainLog && typeof mainLog.warn === "function") mainLog.warn(msg);
  } catch {
    /* 非 main 环境（单测）忽略 */
  }
}

// ─── 路径与常量 ──────────────────────────────────────

const INDEX_VERSION = 1;
/** 复制后剪贴板里仍是被复制的值时，自动清空的秒数 */
export const CLIPBOARD_CLEAR_AFTER_SEC = 30;
const NAME_MAX_LEN = 100;
const CATEGORY_MAX_LEN = 50;
const NOTE_MAX_LEN = 500;

type IndexEntry = {
  id: string;
  name: string;
  category: string;
  hint: string;
  createdAt: number;
  updatedAt: number;
  /** 过期时间 (ms epoch, 当地当天 0 点)；null = 未设置 */
  expiresAt: number | null;
  /** 上次发过期提醒的时间，24h 去重 */
  lastExpiryRemindAt: number | null;
};

type SecretPayload = { value: string; note: string };

function vaultDir(): string | null {
  const userData = _tryGetUserDataDir();
  if (!userData) return null;
  return path.join(userData, "vault");
}

function indexPath(): string | null {
  const dir = vaultDir();
  return dir ? path.join(dir, "secrets-index.json") : null;
}

function blobPath(id: string): string | null {
  const dir = vaultDir();
  if (!dir) return null;
  if (typeof id !== "string" || !/^[a-f0-9-]{8,64}$/i.test(id)) {
    throw new Error("invalid vault entry id");
  }
  return path.join(dir, "entries", `${id}.bin`);
}

// ─── 掩码 ────────────────────────────────────────────

/**
 * 生成掩码预览：长值显示首 3 + 尾 4 + 长度，短值（≤8）只给 •••• 不泄露首尾。
 * 例: "sk-1234...9f3a" → "sk-…9f3a (43)"
 */
export function maskHint(value: string): string {
  if (typeof value !== "string" || value.length === 0) return "";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 3)}…${value.slice(-4)} (${value.length})`;
}

// ─── 索引读写 ────────────────────────────────────────

function readIndex(): IndexEntry[] {
  const file = indexPath();
  if (!file) return [];
  try {
    if (!fs.existsSync(file)) return [];
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const entries = raw && Array.isArray(raw.entries) ? raw.entries : [];
    return entries
      .filter(
        (e: any) => e && typeof e.id === "string" && typeof e.name === "string",
      )
      .map(normalizeIndexEntry);
  } catch {
    _logWarn("[vault] secrets-index.json 读取失败，按空索引处理");
    return [];
  }
}

function normalizeIndexEntry(e: any): IndexEntry {
  return {
    id: e.id,
    name: e.name,
    category: typeof e.category === "string" ? e.category : "",
    hint: typeof e.hint === "string" ? e.hint : "",
    createdAt: typeof e.createdAt === "number" ? e.createdAt : 0,
    updatedAt: typeof e.updatedAt === "number" ? e.updatedAt : 0,
    expiresAt: typeof e.expiresAt === "number" ? e.expiresAt : null,
    lastExpiryRemindAt:
      typeof e.lastExpiryRemindAt === "number" ? e.lastExpiryRemindAt : null,
  };
}

function writeIndex(entries: IndexEntry[]): boolean {
  const file = indexPath();
  if (!file) return false;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const payload = JSON.stringify(
      { version: INDEX_VERSION, entries },
      null,
      2,
    );
    // 原子写（同 state-store writeAtomic 模式）
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, payload, { mode: 0o600 });
    fs.renameSync(tmp, file);
    return true;
  } catch (err: any) {
    _logWarn(`[vault] 写索引失败: ${err && err.message}`);
    return false;
  }
}

// ─── blob 读写 ───────────────────────────────────────

function encryptionAvailable(): boolean {
  const ss = _tryGetSafeStorage();
  if (!ss) return false;
  if (typeof ss.isEncryptionAvailable === "function") {
    return Boolean(ss.isEncryptionAvailable());
  }
  return true;
}

function writeBlob(id: string, payload: SecretPayload): boolean {
  const ss = _tryGetSafeStorage();
  if (!ss) return false;
  const file = blobPath(id);
  if (!file) return false;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const buf = ss.encryptString(JSON.stringify(payload));
    fs.writeFileSync(file, buf, { mode: 0o600 });
    return true;
  } catch (err: any) {
    _logWarn(`[vault] 写加密 blob 失败: ${err && err.message}`);
    return false;
  }
}

function readBlob(id: string): SecretPayload | null {
  const ss = _tryGetSafeStorage();
  if (!ss) return null;
  let file: string | null = null;
  try {
    file = blobPath(id);
  } catch {
    return null;
  }
  if (!file || !fs.existsSync(file)) return null;
  try {
    const plain = ss.decryptString(fs.readFileSync(file));
    const parsed = JSON.parse(String(plain));
    if (typeof parsed.value !== "string") return null;
    return { value: parsed.value, note: typeof parsed.note === "string" ? parsed.note : "" };
  } catch (err: any) {
    _logWarn(`[vault] 解密 blob 失败: ${err && err.message}`);
    return null;
  }
}

function deleteBlob(id: string): void {
  let file: string | null = null;
  try {
    file = blobPath(id);
  } catch {
    return;
  }
  if (!file) return;
  try {
    fs.unlinkSync(file);
  } catch (err: any) {
    if (err && err.code !== "ENOENT") {
      _logWarn(`[vault] 删 blob 失败: ${err && err.message}`);
    }
  }
}

// ─── 输入校验 ────────────────────────────────────────

function cleanName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim();
  if (name.length === 0 || name.length > NAME_MAX_LEN) return null;
  return name;
}

function cleanOptional(input: unknown, maxLen: number): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, maxLen);
}

/**
 * 归一化过期时间输入:
 *   undefined        → undefined (编辑时 = 不修改)
 *   null / "" / 0    → null (清除)
 *   number (ms)      → number (须为有限正数)
 *   "YYYY-MM-DD"     → 当地当天 0 点的 ms
 * 其余 → invalid。
 */
export function cleanExpiry(
  input: unknown,
): { ok: true; value: number | null | undefined } | { ok: false } {
  if (input === undefined) return { ok: true, value: undefined };
  if (input === null || input === "" || input === 0) return { ok: true, value: null };
  if (typeof input === "number") {
    return Number.isFinite(input) && input > 0
      ? { ok: true, value: input }
      : { ok: false };
  }
  if (typeof input === "string") {
    const m = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return { ok: false };
    const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    return Number.isFinite(ms) && ms > 0
      ? { ok: true, value: ms }
      : { ok: false };
  }
  return { ok: false };
}

// ─── 公开 API ────────────────────────────────────────

export function listEntries(): VaultListResponse {
  if (!encryptionAvailable()) {
    return { ok: false, reason: "no_safe_storage", entries: [], encryptionAvailable: false };
  }
  const entries = readIndex()
    .map((e) => {
      const blob = readBlob(e.id);
      return {
        id: e.id,
        name: e.name,
        category: e.category || "",
        hint: e.hint || "",
        note: blob ? blob.note : "",
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        expiresAt: e.expiresAt ?? null,
      } satisfies VaultEntryMeta;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return { ok: true, entries, encryptionAvailable: true };
}

/**
 * 只读索引元数据 (不解密、不需要 safeStorage) — 过期提醒扫描与导出用。
 * 返回原始 IndexEntry 浅拷贝。
 */
export function listIndexEntries(): Array<{
  id: string;
  name: string;
  category: string;
  expiresAt: number | null;
  lastExpiryRemindAt: number | null;
}> {
  return readIndex().map((e) => ({
    id: e.id,
    name: e.name,
    category: e.category || "",
    expiresAt: e.expiresAt ?? null,
    lastExpiryRemindAt: e.lastExpiryRemindAt ?? null,
  }));
}

/** 记录「已提醒」时间戳 (24h 去重用)。 */
export function markExpiryReminded(id: string, ts: number): boolean {
  const entries = readIndex();
  const target = entries.find((e) => e.id === id);
  if (!target) return false;
  target.lastExpiryRemindAt = ts;
  return writeIndex(entries);
}

/**
 * 新建 / 更新条目。id 缺省为新建；name 全库唯一（大小写不敏感）。
 * 编辑时 value 传空串表示「保持原值」（避免明文往返）。
 * upsert=true 时同名条目存在则改为更新（业务模块按名写 tmdb/github 等）。
 */
export function setEntry(input: {
  id?: string;
  name: unknown;
  category?: unknown;
  value: unknown;
  note?: unknown;
  upsert?: boolean;
  /** "YYYY-MM-DD" | ms | null(清除)；编辑时 undefined = 保持原值 */
  expiresAt?: unknown;
}): VaultMutationResponse {
  if (!encryptionAvailable()) {
    return { ok: false, reason: "no_safe_storage" };
  }
  const name = cleanName(input && input.name);
  if (!name) {
    return { ok: false, reason: "invalid_name" };
  }
  const category = cleanOptional(input && input.category, CATEGORY_MAX_LEN);
  const note = cleanOptional(input && input.note, NOTE_MAX_LEN);
  const expiry = cleanExpiry(input && input.expiresAt);
  if (!expiry.ok) {
    return { ok: false, reason: "invalid_expiry" };
  }

  const entries = readIndex();
  const now = Date.now();
  const editingId =
    input && typeof input.id === "string" && input.id ? input.id : null;
  const existing = editingId
    ? entries.find((e) => e.id === editingId)
    : undefined;
  if (editingId && !existing) {
    return { ok: false, reason: "not_found" };
  }

  const nameConflict = entries.find(
    (e) => e.id !== editingId && e.name.toLowerCase() === name.toLowerCase(),
  );
  const conflictIsUpsert = Boolean(input && input.upsert);
  if (nameConflict && !conflictIsUpsert) {
    return { ok: false, reason: "name_conflict" };
  }

  // blob 载荷：编辑时 value 传空 = 沿用旧值
  let value = typeof (input && input.value) === "string" ? (input.value as string).trim() : "";
  if (!value) {
    const old = existing || (conflictIsUpsert ? nameConflict : undefined);
    const prevBlob = old ? readBlob(old.id) : null;
    if (prevBlob) {
      value = prevBlob.value;
    } else if (existing) {
      return { ok: false, reason: "blob_unreadable" };
    } else {
      return { ok: false, reason: "invalid_value" };
    }
  }

  const target = existing || (conflictIsUpsert ? nameConflict : undefined);
  const nextExpiresAt =
    expiry.value === undefined ? (target ? (target.expiresAt ?? null) : null) : expiry.value;
  const entry: IndexEntry = target
    ? {
        ...target,
        name,
        category,
        hint: maskHint(value),
        updatedAt: now,
        expiresAt: nextExpiresAt,
      }
    : {
        id: crypto.randomUUID(),
        name,
        category,
        hint: maskHint(value),
        createdAt: now,
        updatedAt: now,
        expiresAt: nextExpiresAt,
        lastExpiryRemindAt: null,
      };

  if (!writeBlob(entry.id, { value, note })) {
    return { ok: false, reason: "encrypt_failed" };
  }

  const nextEntries = target
    ? entries.map((e) => (e.id === entry.id ? entry : e))
    : [...entries, entry];
  if (!writeIndex(nextEntries)) {
    // 索引写失败时回滚 blob，避免出现孤儿密文（只回滚本次新建的 blob；
    // upsert 覆盖已有 blob 无法原地恢复，保留新 blob 至少不丢密文）
    if (!target) deleteBlob(entry.id);
    return { ok: false, reason: "index_write_failed" };
  }
  return {
    ok: true,
    entry: {
      id: entry.id,
      name: entry.name,
      category: entry.category,
      hint: entry.hint,
      note,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      expiresAt: entry.expiresAt ?? null,
    },
  };
}

export function deleteEntry(id: unknown): VaultDeleteResponse {
  if (typeof id !== "string" || !id) {
    return { ok: false, reason: "invalid_id" };
  }
  const entries = readIndex();
  const target = entries.find((e) => e.id === id);
  if (!target) return { ok: false, reason: "not_found" };
  if (!writeIndex(entries.filter((e) => e.id !== id))) {
    return { ok: false, reason: "index_write_failed" };
  }
  deleteBlob(id);
  return { ok: true };
}

/** 显式查看明文（单条动作，renderer 只在用户点击「显示」时调用）。 */
export function revealEntry(id: unknown): VaultRevealResponse {
  if (typeof id !== "string" || !id) return { ok: false, reason: "invalid_id" };
  if (!encryptionAvailable()) return { ok: false, reason: "no_safe_storage" };
  if (!readIndex().some((e) => e.id === id)) {
    return { ok: false, reason: "not_found" };
  }
  const blob = readBlob(id);
  if (!blob) return { ok: false, reason: "decrypt_failed" };
  return { ok: true, value: blob.value };
}

/** 按 id 取解密载荷（主进程内部用：导出、AI 设置引用）；不存在/解密失败 → null。 */
export function readEntryFull(
  id: unknown,
): { value: string; note: string } | null {
  if (typeof id !== "string" || !id) return null;
  if (!encryptionAvailable()) return null;
  if (!readIndex().some((e) => e.id === id)) return null;
  return readBlob(id);
}

// ─── 剪贴板 ──────────────────────────────────────────

let _pendingClearTimer: unknown = null;

function _scheduleClipboardClear(value: string) {
  const setFn = _setTimeoutOverride || ((_fn: () => void, _ms: number) => setTimeout(_fn, _ms));
  const clearFn = _clearTimeoutOverride || ((_id: unknown) => clearTimeout(_id as any));
  if (_pendingClearTimer !== null) clearFn(_pendingClearTimer);
  _pendingClearTimer = setFn(() => {
    _pendingClearTimer = null;
    const clipboard = _tryGetClipboard();
    if (!clipboard) return;
    try {
      // 只在剪贴板仍是我们复制的值时清空，避免覆盖用户后续复制的内容
      if (clipboard.readText() === value) {
        clipboard.writeText("");
      }
    } catch {
      /* noop */
    }
  }, CLIPBOARD_CLEAR_AFTER_SEC * 1000);
}

/** 主进程写剪贴板；renderer 不经手明文。 */
export function copyEntry(id: unknown): VaultCopyResponse {
  if (typeof id !== "string" || !id) return { ok: false, reason: "invalid_id" };
  if (!encryptionAvailable()) return { ok: false, reason: "no_safe_storage" };
  if (!readIndex().some((e) => e.id === id)) {
    return { ok: false, reason: "not_found" };
  }
  const blob = readBlob(id);
  if (!blob) return { ok: false, reason: "decrypt_failed" };
  const clipboard = _tryGetClipboard();
  if (!clipboard || typeof clipboard.writeText !== "function") {
    return { ok: false, reason: "no_clipboard" };
  }
  try {
    clipboard.writeText(blob.value);
    _scheduleClipboardClear(blob.value);
    return { ok: true, clearAfterSec: CLIPBOARD_CLEAR_AFTER_SEC };
  } catch (err: any) {
    _logWarn(`[vault] 写剪贴板失败: ${err && err.message}`);
    return { ok: false, reason: "clipboard_failed" };
  }
}

/**
 * 按名称取明文（仅供主进程内部业务使用：github/tmdb 迁移读取等）。
 * 不存在 / 不可解密 → null。
 */
export function getSecretValue(name: unknown): string | null {
  if (!encryptionAvailable()) return null;
  const clean = cleanName(name);
  if (!clean) return null;
  const entry = readIndex().find(
    (e) => e.name.toLowerCase() === clean.toLowerCase(),
  );
  if (!entry) return null;
  const blob = readBlob(entry.id);
  return blob ? blob.value : null;
}

/** 按名称判断条目是否已存在（迁移与 UI 判断用）。 */
export function hasEntryNamed(name: unknown): boolean {
  const clean = cleanName(name);
  if (!clean) return false;
  return readIndex().some((e) => e.name.toLowerCase() === clean.toLowerCase());
}

/** 按名称删除（业务模块清除内置条目用，如清除 TMDB key）。 */
export function deleteEntryByName(name: unknown): boolean {
  const clean = cleanName(name);
  if (!clean) return false;
  const target = readIndex().find(
    (e) => e.name.toLowerCase() === clean.toLowerCase(),
  );
  if (!target) return false;
  return deleteEntry(target.id).ok;
}

module.exports = {
  listEntries,
  setEntry,
  deleteEntry,
  deleteEntryByName,
  revealEntry,
  readEntryFull,
  copyEntry,
  getSecretValue,
  hasEntryNamed,
  maskHint,
  cleanExpiry,
  listIndexEntries,
  markExpiryReminded,
  CLIPBOARD_CLEAR_AFTER_SEC,
  __setSafeStorageForTest,
  __setUserDataDirForTest,
  __setClipboardForTest,
  __setTimersForTest,
  __resetForTest,
};
