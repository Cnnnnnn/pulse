/**
 * src/renderer/games/eventsEngine.js
 *
 * 限时活动引擎（P1c · D）— 内置活动配置（代码常量）+ 响应式求值（纯函数，本地时钟）。
 *
 * 约定（见架构 §3.7 / PRD §2 D）：
 *  - 活动有起止时间窗口（本地时钟判定 isEventActive），窗口内按「维度 × 目标 × 阈值」累计进度。
 *  - 窗口外（已结束）锁存历史状态：claimed / completed / progress 均从上一次进度保留，
 *    不再重算（保证「已领取 / 已完成」状态跨时间持久）。
 *  - countMatches 复用 achievementsEngine（单一真源）。
 *  - 本文件为纯函数，便于单测；无网络、无副作用。
 */

import { countMatches } from "./achievementsEngine.js";

/**
 * 内置活动配置（代码常量，不持久化）。
 * 时间用 ISO 字符串；dimension ∈ tag | folder | platform | rarity | merged。
 */
export const DEFAULT_EVENTS = [
  {
    id: "ev_spring",
    title: "春季收藏冲刺",
    startAt: "2026-03-01T00:00:00Z",
    endAt: "2026-03-31T23:59:59Z",
    dimension: "platform",
    target: "steam",
    threshold: 20,
  },
];

/**
 * 判断活动是否在窗口内（本地时钟 now 默认 Date.now()）。
 * NaN 时间视为非法 → 返回 false（安全降级）。
 * @param {{startAt:string,endAt:string}} ev
 * @param {number} [now] 本地时间戳（ms）
 * @returns {boolean}
 */
export function isEventActive(ev, now = Date.now()) {
  const s = new Date(ev.startAt).getTime();
  const e = new Date(ev.endAt).getTime();
  return !Number.isNaN(s) && !Number.isNaN(e) && now >= s && now <= e;
}

/**
 * 响应式求值：返回各活动进度。
 *  - active：progress = countMatches，completed = progress >= threshold；claimed 沿用历史。
 *  - inactive（已结束）：直接锁存 prev 的 claimed / completed / progress，不重算。
 *
 * @param {Array<object>} entries 收藏条目
 * @param {Array<object>} [configs] 活动配置（内置+用户）
 * @param {object} [prev] 上一次进度
 * @param {number} [now] 本地时间戳（ms）
 * @returns {{[id:string]:{claimed:boolean,completed:boolean,progress:number}}}
 */
export function evaluateEvents(entries, configs, prev, now = Date.now()) {
  const out = {};
  for (const cfg of configs || []) {
    const p = (prev && prev[cfg.id]) || { claimed: false, completed: false, progress: 0 };
    const active = isEventActive(cfg, now);
    if (!active) {
      out[cfg.id] = { claimed: p.claimed, completed: p.completed, progress: p.progress };
      continue;
    }
    const progress = countMatches(entries, cfg.dimension, cfg.target);
    out[cfg.id] = { claimed: p.claimed, completed: progress >= cfg.threshold, progress };
  }
  return out;
}
