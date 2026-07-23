/**
 * src/main/ai-feedback-store.ts
 *
 * A8 — AI 反馈闭环. 显式 (👍/👎) + 隐式 (升级/snooze/force) 反馈样本的纯函数 + LRU.
 * 持久化走 state.json.aiFeedback (cap 500), 由 state-store 持有读写.
 *
 * 样本 shape:
 *   { id, feature, appName, version, rec, confidence, vote, implicit, ts }
 *
 *   feature:   "advice" (A2) | "summary" (A1)
 *   vote:      "up" | "down"  (显式反馈)
 *   implicit:  "upgraded" | "snoozed" | "refreshed" | null  (隐式信号, 显式反馈时为 null)
 *
 * id 格式: feature::appName::version::ts  (同 id 覆盖, 用于"用户改 vote")
 */
"use strict";

const FEEDBACK_CAP = 500;

export function dedupeKey(sample: any): string {
  return `${sample.feature}::${sample.appName}::${sample.version || ""}::${sample.ts}`;
}

export function recordFeedback(list: any, raw: any): any[] {
  if (!Array.isArray(list)) return list;
  if (!raw || typeof raw !== "object") return list;
  // 防御: 必填 feature / appName / ts; 且 vote 或 implicit 至少一个
  if (!raw.feature || !raw.appName || typeof raw.ts !== "number") {
    return list;
  }
  if (!raw.vote && !raw.implicit) {
    return list; // 既无显式 vote 也无隐式信号, 无意义
  }
  const sample = {
    id: dedupeKey(raw),
    feature: raw.feature,
    appName: raw.appName,
    version: typeof raw.version === "string" ? raw.version : null,
    rec: raw.rec || null,
    confidence: raw.confidence || null,
    vote: raw.vote || null,
    implicit: raw.implicit || null,
    ts: raw.ts,
  };
  // 去重: 同 id 覆盖 (用户改 vote)
  const filtered = list.filter((s: any) => s && s.id !== sample.id);
  return [sample, ...filtered];
}

export function pruneToCap(list: any[], cap: number = FEEDBACK_CAP): any[] {
  if (!Array.isArray(list)) return list;
  if (list.length <= cap) return list;
  return list.slice(0, cap); // list 头部最新, 截尾部
}

module.exports = { recordFeedback, dedupeKey, pruneToCap, FEEDBACK_CAP };