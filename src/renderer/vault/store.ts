/**
 * src/renderer/vault/store.ts
 *
 * 密钥库 renderer store (v2.83) — signals + 动作。
 *
 * 安全约定：store 全程不持有明文 value。列表只拿掩码 hint；
 * reveal 明文放在短暂的 signal 里，15s 自动清空；
 * 复制走主进程 clipboard（vault:copy），renderer 不经手明文。
 */

import { signal } from "@preact/signals";
import { api } from "../api.ts";
import { showToast } from "../store/toast-store.ts";
import type { VaultEntryMeta } from "../../shared/ipc-contracts.ts";

export const vaultEntries = signal<VaultEntryMeta[]>([]);
export const vaultLoaded = signal(false);
export const vaultLoading = signal(false);
export const vaultEncryptionAvailable = signal(true);
export const vaultSearchQuery = signal("");
export const vaultModalOpen = signal(false);
export const vaultEditing = signal<VaultEntryMeta | null>(null);
export const vaultBusy = signal(false);
/** 当前正被「显示」的条目 id（同时只允许一条明文展开） */
export const vaultRevealedId = signal<string | null>(null);
/** 短暂持有的明文，15s 后自动清空 */
export const vaultRevealedValue = signal("");
/** 导入预览（主进程只回掩码，不含明文） */
export const vaultImportPreview = signal<null | {
  importId: string;
  fileName: string;
  total: number;
  invalidCount: number;
  entries: Array<{
    name: string;
    category: string;
    hint: string;
    note: string;
    expiresAt: number | null;
    conflict: boolean;
  }>;
}>(null);

const REVEAL_AUTO_HIDE_MS = 15_000;
let _revealTimer: ReturnType<typeof setTimeout> | null = null;

const REASON_TEXT: Record<string, string> = {
  no_safe_storage: "系统加密（Keychain）不可用，已拒绝明文保存",
  invalid_name: "名称不能为空（100 字以内）",
  invalid_value: "密钥内容不能为空",
  name_conflict: "已存在同名条目，请换个名称",
  not_found: "条目不存在（可能已被删除）",
  blob_unreadable: "原密文读取失败，请重新输入密钥内容",
  encrypt_failed: "加密失败，未保存",
  index_write_failed: "索引写入失败，未保存",
  decrypt_failed: "解密失败，密文可能已损坏",
  no_clipboard: "剪贴板不可用",
  clipboard_failed: "复制到剪贴板失败",
};

export function vaultReasonText(reason: string | undefined | null): string {
  if (!reason) return "操作失败";
  return REASON_TEXT[reason] || `操作失败（${reason}）`;
}

export async function refreshVault(): Promise<void> {
  vaultLoading.value = true;
  try {
    const res = await api.vaultList();
    const ok = !!(res && res.ok);
    vaultEncryptionAvailable.value = ok
      ? res.encryptionAvailable !== false
      : false;
    vaultEntries.value = ok && Array.isArray(res.entries) ? res.entries : [];
    vaultLoaded.value = true;
  } catch {
    vaultLoaded.value = true;
  } finally {
    vaultLoading.value = false;
  }
}

export function bootstrapVault(): void {
  if (!vaultLoaded.value) refreshVault();
}

export function openVaultModal(entry: VaultEntryMeta | null = null): void {
  vaultEditing.value = entry;
  vaultModalOpen.value = true;
}

export function closeVaultModal(): void {
  vaultModalOpen.value = false;
  vaultEditing.value = null;
}

export async function saveVaultSecret(input: {
  id?: string;
  name: string;
  category: string;
  value: string;
  note: string;
  expiresAt?: string | number | null;
}): Promise<boolean> {
  vaultBusy.value = true;
  try {
    const wasEditing = !!vaultEditing.value;
    const res = await api.vaultSet(input);
    if (res && res.ok) {
      closeVaultModal();
      await refreshVault();
      showToast(wasEditing ? "密钥已更新" : "密钥已保存（Keychain 加密）", "success", 2200);
      return true;
    }
    showToast(vaultReasonText(res && res.reason), "error", 3200);
    return false;
  } catch (err: any) {
    showToast(`保存失败: ${err && err.message}`, "error", 3200);
    return false;
  } finally {
    vaultBusy.value = false;
  }
}

export async function removeVaultSecret(entry: VaultEntryMeta): Promise<void> {
  const res = await api.vaultDelete(entry.id);
  if (res && res.ok) {
    if (vaultRevealedId.value === entry.id) hideRevealed();
    await refreshVault();
    showToast(`已删除「${entry.name}」`, "info", 2000);
  } else {
    showToast(vaultReasonText(res && res.reason), "error", 3200);
  }
}

export async function copyVaultSecret(entry: VaultEntryMeta): Promise<void> {
  const res = await api.vaultCopy(entry.id);
  if (res && res.ok) {
    showToast(`已复制「${entry.name}」，${res.clearAfterSec}s 后自动清空剪贴板`, "success", 2600);
  } else {
    showToast(vaultReasonText(res && res.reason), "error", 3200);
  }
}

function hideRevealed(): void {
  if (_revealTimer !== null) {
    clearTimeout(_revealTimer);
    _revealTimer = null;
  }
  vaultRevealedId.value = null;
  vaultRevealedValue.value = "";
}

/** 切换单条明文显示；同时只展开一条，15s 自动隐藏。 */
export async function toggleReveal(entry: VaultEntryMeta): Promise<void> {
  if (vaultRevealedId.value === entry.id) {
    hideRevealed();
    return;
  }
  const res = await api.vaultReveal(entry.id);
  if (res && res.ok) {
    if (_revealTimer !== null) clearTimeout(_revealTimer);
    vaultRevealedId.value = entry.id;
    vaultRevealedValue.value = res.value;
    _revealTimer = setTimeout(() => hideRevealed(), REVEAL_AUTO_HIDE_MS);
  } else {
    showToast(vaultReasonText(res && res.reason), "error", 3200);
  }
}

/** 按搜索词过滤（name / category / note，大小写不敏感）。 */
export function filterVaultEntries(
  entries: VaultEntryMeta[],
  query: string,
): VaultEntryMeta[] {
  const q = (query || "").trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) =>
    [e.name, e.category, e.note].some((field) =>
      (field || "").toLowerCase().includes(q),
    ),
  );
}

/** 分类预设建议（可自由输入其它值）。 */
export const VAULT_CATEGORY_PRESETS = ["内置功能", "AI", "开发", "云服务"];

// ── 过期徽标 ─────────────────────────────────────────

export type VaultExpiryBadge = {
  text: string;
  tone: "danger" | "warn" | "muted";
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** 提前多少天开始显示「N 天后过期」警示徽标（与主进程提醒窗口一致） */
export const EXPIRY_BADGE_WINDOW_DAYS = 7;

/** 生成行内过期徽标；未设置过期时间返回 null。 */
export function formatExpiryBadge(
  expiresAt: number | null | undefined,
  now: number = Date.now(),
): VaultExpiryBadge | null {
  if (typeof expiresAt !== "number" || expiresAt <= 0) return null;
  const delta = expiresAt - now;
  if (delta < 0) {
    const days = Math.floor(-delta / DAY_MS);
    return { text: days > 0 ? `已过期 ${days} 天` : "今天过期", tone: "danger" };
  }
  const days = Math.floor(delta / DAY_MS);
  if (days <= EXPIRY_BADGE_WINDOW_DAYS) {
    return { text: days === 0 ? "今天过期" : `${days} 天后过期`, tone: "warn" };
  }
  const d = new Date(expiresAt);
  return {
    text: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    tone: "muted",
  };
}

// ── 导入 / 导出 ──────────────────────────────────────

export async function runVaultExport(): Promise<void> {
  try {
    const r = await api.vaultExport();
    if (r && r.ok) {
      showToast(`已导出 ${r.count} 条到 ${r.path}`, "success", 4000);
    } else if (r && r.reason === "cancelled") {
      /* 用户取消 */
    } else {
      showToast(`导出失败${r && r.error ? `: ${r.error}` : ""}`, "error", 3200);
    }
  } catch (err: any) {
    showToast(`导出失败: ${err && err.message}`, "error", 3200);
  }
}

export async function runVaultImportLoad(): Promise<void> {
  try {
    const r = await api.vaultImportLoad();
    if (r && r.ok) {
      vaultImportPreview.value = {
        importId: r.importId!,
        fileName: r.fileName || "",
        total: r.total || 0,
        invalidCount: r.invalidCount || 0,
        entries: r.entries || [],
      };
    } else if (r && r.reason === "cancelled") {
      /* 用户取消 */
    } else {
      showToast(
        r && r.reason === "invalid_schema"
          ? "文件格式不是密钥库导出文件"
          : `读取失败${r && r.error ? `: ${r.error}` : ""}`,
        "error",
        3200,
      );
    }
  } catch (err: any) {
    showToast(`导入失败: ${err && err.message}`, "error", 3200);
  }
}

export async function confirmVaultImport(): Promise<void> {
  const preview = vaultImportPreview.value;
  if (!preview) return;
  try {
    const r = await api.vaultImportApply(preview.importId);
    if (r && r.ok) {
      vaultImportPreview.value = null;
      await refreshVault();
      showToast(`导入完成：新建 ${r.imported}，更新 ${r.updated}${r.failed ? `，失败 ${r.failed}` : ""}`, "success", 3600);
    } else {
      showToast(vaultReasonText(r && r.reason), "error", 3200);
    }
  } catch (err: any) {
    showToast(`导入失败: ${err && err.message}`, "error", 3200);
  }
}

export function cancelVaultImport(): void {
  vaultImportPreview.value = null;
}
