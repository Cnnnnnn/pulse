/**
 * src/main/token-budget.ts
 *
 * P71 — LLM 每日 token 预算. 纯函数 + state.json 持久化 (tokenSpend 字段).
 *
 *   state.tokenSpend        = { "YYYY-MM-DD": number, ... }  // 最近 30 天
 *   state.tokenBudgetConfig = { dailyLimit: number, mode: "warn"|"block" }
 *
 * 设计:
 *   - 调用 LLM 前 isOverBudget (block 模式拦截)
 *   - 调用后 addSpend 累计
 *   - warn 模式不拦截, 仅 ai-errors 提示
 *
 * 默认 dailyLimit=0 (不限制), mode=warn → 升级零破坏.
 */
"use strict";

const DEFAULT_DAILY_LIMIT = 0; // 0 = 未设预算, 不拦截
const DEFAULT_MODE = "warn"; // warn | block
const KEEP_DAYS = 30;

export function todayKey(now: any = new Date()): string {
  const d = now instanceof Date ? now : new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addSpend(spendMap: any, dayKey: string, tokens: number): Record<string, number> {
  if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens <= 0) {
    return spendMap; // 非法/0/负数 不记
  }
  const next: Record<string, number> = { ...(spendMap || {}) };
  next[dayKey] = (next[dayKey] || 0) + tokens;
  return next;
}

export function isOverBudget(spendMap: any, dayKey: string, dailyLimit: number): boolean {
  if (typeof dailyLimit !== "number" || dailyLimit <= 0) return false; // 未设预算
  const used = (spendMap && spendMap[dayKey]) || 0;
  return used >= dailyLimit;
}

export function pruneDays(spendMap: any, keep: number = KEEP_DAYS): Record<string, number> {
  if (!spendMap || typeof spendMap !== "object") return spendMap;
  const keys = Object.keys(spendMap).sort(); // 日期串字典序 = 时间序
  if (keys.length <= keep) return spendMap;
  const keepSet = new Set(keys.slice(-keep)); // 保留最新 keep 天
  const out: Record<string, number> = {};
  for (const k of keys) if (keepSet.has(k)) out[k] = spendMap[k];
  return out;
}

module.exports = {
  todayKey,
  addSpend,
  isOverBudget,
  pruneDays,
  DEFAULT_DAILY_LIMIT,
  DEFAULT_MODE,
  KEEP_DAYS,
};