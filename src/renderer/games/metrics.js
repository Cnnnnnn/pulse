/**
 * src/renderer/games/metrics.js
 *
 * 本地埋点（P1a · E）— 纯函数（无网络、无副作用）。
 *
 * 约定（见架构 §3.4 / §8 Q8 已采纳）：
 *  - 仅计数 + 时间戳，不记录逐条明细；纯本地，明确不上传。
 *  - 本文件不依赖任何外部模块，不产生任何网络出口（无 fetch / XHR / IPC）。
 *  - 计数器表结构：{ [eventName]: { count, firstSeen, lastSeen } }。
 */

/** 空计数器表（不可变起点）。 */
export const EMPTY_METRICS = {};

/**
 * 在 metrics 表上自增某事件计数（不可变更新，返回新对象）。
 * - 首次出现：count=1，firstSeen=lastSeen=now。
 * - 再次出现：count+1，firstSeen 保持首见、lastSeen=now。
 *
 * @param {{[k:string]:{count:number,firstSeen:string,lastSeen:string}}} metrics
 * @param {string} name 事件名（如 "wishlist.add"）
 * @returns {{[k:string]:{count:number,firstSeen:string,lastSeen:string}}}
 */
export function bumpMetric(metrics, name) {
  const now = new Date().toISOString();
  const cur = metrics && metrics[name];
  const next = { ...(metrics || {}) };
  if (!cur) {
    next[name] = { count: 1, firstSeen: now, lastSeen: now };
  } else {
    next[name] = {
      count: cur.count + 1,
      firstSeen: cur.firstSeen,
      lastSeen: now,
    };
  }
  return next;
}

/**
 * 合并两份计数器表（用于导入 / 多会话聚合）。
 * - count 累加；
 * - firstSeen 取二者更早；
 * - lastSeen 取二者更晚。
 * 返回新对象，不修改入参。
 *
 * @param {{[k:string]:{count:number,firstSeen:string,lastSeen:string}}} a
 * @param {{[k:string]:{count:number,firstSeen:string,lastSeen:string}}} b
 * @returns {{[k:string]:{count:number,firstSeen:string,lastSeen:string}}}
 */
export function mergeMetrics(a, b) {
  const out = { ...(a || {}) };
  for (const [name, m] of Object.entries(b || {})) {
    const cur = out[name];
    if (!cur) {
      out[name] = { ...m };
    } else {
      const af = cur.firstSeen || "";
      const bf = m.firstSeen || "";
      const al = cur.lastSeen || "";
      const bl = m.lastSeen || "";
      out[name] = {
        count: (cur.count || 0) + (m.count || 0),
        firstSeen: af && bf ? (af < bf ? af : bf) : af || bf,
        lastSeen: al && bl ? (al > bl ? al : bl) : al || bl,
      };
    }
  }
  return out;
}
