/**
 * src/main/vault/expiry-watch.ts
 *
 * 密钥库过期提醒 (v2.83)。
 *   - 7 天窗口内到期 / 已过期的条目发系统通知
 *   - 每条 24h 内最多提醒一次 (lastExpiryRemindAt 去重，存索引文件)
 *   - pickDueEntries 纯函数可测；checkVaultExpiry 组合 IO
 *
 * 调度: register-vault.ts 注册 IPC 时挂 setManagedInterval (启动 30s 后先查一次, 每 6h 复查)。
 * 纯索引扫描, 不解密, safeStorage 不可用也能提醒。
 */

import {
  listIndexEntries,
  markExpiryReminded,
} from "./secret-vault";

/** 提前多少天开始提醒 */
export const EXPIRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** 同一条目两次提醒的最小间隔 */
export const REMIND_DEDUPE_MS = 24 * 60 * 60 * 1000;

export type DueExpiryEntry = {
  id: string;
  name: string;
  expired: boolean;
  /** 已过期 = 过去的天数; 未过期 = 剩余天数 (均按整天取整, <1 天算 0) */
  days: number;
};

export function pickDueEntries(
  entries: Array<{
    id: string;
    name: string;
    expiresAt: number | null;
    lastExpiryRemindAt: number | null;
  }>,
  now: number,
  windowMs: number = EXPIRY_WINDOW_MS,
  dedupeMs: number = REMIND_DEDUPE_MS,
): DueExpiryEntry[] {
  const due: DueExpiryEntry[] = [];
  for (const e of entries) {
    if (typeof e.expiresAt !== "number" || e.expiresAt <= 0) continue;
    const delta = e.expiresAt - now;
    if (delta > windowMs) continue;
    // 已过期 → delta < 0；未过期 → delta >= 0 但在窗口内
    const expired = delta < 0;
    const days = Math.floor(Math.abs(delta) / (24 * 60 * 60 * 1000));
    const last = typeof e.lastExpiryRemindAt === "number" ? e.lastExpiryRemindAt : 0;
    if (now - last < dedupeMs) continue;
    due.push({ id: e.id, name: e.name, expired, days });
  }
  // 最紧急的排前面: 已过期且天数多的最先
  due.sort((a, b) => {
    if (a.expired !== b.expired) return a.expired ? -1 : 1;
    return b.days - a.days;
  });
  return due;
}

export function formatExpiryNotice(item: DueExpiryEntry): string {
  return item.expired
    ? `密钥「${item.name}」已过期 ${item.days} 天，请尽快更换。`
    : `密钥「${item.name}」将在 ${item.days === 0 ? "不到 1 天" : `${item.days} 天`}后过期。`;
}

/**
 * 扫描 + 通知 + 标记已提醒。
 * @param send 系统通知发送函数 (register-vault 注入 makeWatchlistSendNotification 的产物; 测试可注入)
 * @returns 本次实际提醒的条目
 */
export function checkVaultExpiry(
  send?: (_n: { title: string; body: string }) => void,
  now: number = Date.now(),
): DueExpiryEntry[] {
  const due = pickDueEntries(listIndexEntries(), now);
  for (const item of due) {
    try {
      if (typeof send === "function") {
        send({ title: "密钥过期提醒", body: formatExpiryNotice(item) });
      }
    } catch {
      /* 通知失败不阻塞标记 */
    }
    try {
      markExpiryReminded(item.id, now);
    } catch {
      /* 标记失败下次重复提醒, 可接受 */
    }
  }
  return due;
}

module.exports = {
  pickDueEntries,
  formatExpiryNotice,
  checkVaultExpiry,
  EXPIRY_WINDOW_MS,
  REMIND_DEDUPE_MS,
};
