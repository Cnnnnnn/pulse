/**
 * src/renderer/games/achievementsEngine.js
 *
 * 成就系统引擎（P1c · C）— 内置成就定义（代码常量）+ 响应式求值（纯函数）。
 *
 * 约定（见架构 §3.6 / PRD §2 C）：
 *  - 成就按「维度 × 目标 × 阈值」派生，完全基于现有 wishlist 数据，无网络、无副作用。
 *  - DEFAULT_ACHIEVEMENTS 为内置成就（不持久化）；用户自定义成就存 localStorage
 *    （见 gamesStore 的 achievementsDef signal），引擎求值时会合并两者。
 *  - countMatches 逻辑与 P1b badges.js 保持一致（本文件为单一真源，eventsEngine 复用）。
 *  - 本文件为纯函数，便于单测；解锁态带 unlockedAt 历史（已解锁后时间戳保留）。
 */

/**
 * 内置成就定义（代码常量，不持久化）。
 * dimension ∈ tag | folder | platform | rarity | merged；target 为匹配值（merged 为 null）。
 * 顺序即展示顺序（已解锁在前、未解锁置灰在后，见 AchievementsPanel）。
 */
export const DEFAULT_ACHIEVEMENTS = [
  { id: "ach_10_steam", name: "Steam 十连", dimension: "platform", target: "steam",    threshold: 10 },
  { id: "ach_5_epic",   name: "Epic 五虎",  dimension: "platform", target: "epic",     threshold: 5 },
  { id: "ach_tag_rpg",  name: "RPG 控",     dimension: "tag",      target: "RPG",      threshold: 3 },
  { id: "ach_legendary",name: "传说达成",   dimension: "rarity",   target: "legendary",threshold: 1 },
  { id: "ach_3_merged", name: "合并大师",   dimension: "merged",   target: null,       threshold: 3 },
];

/**
 * 按维度统计匹配条目数（单一真源；eventsEngine 复用）。
 * @param {Array<{platform?:string,tags?:string[],folderId?:string|null,rarity?:string|null,mergedMembers?:Array|null}>} entries
 * @param {string} dimension
 * @param {string|null} target
 * @returns {number}
 */
export function countMatches(entries, dimension, target) {
  switch (dimension) {
    case "platform": return entries.filter((e) => e.platform === target).length;
    case "tag":      return entries.filter((e) => (e.tags || []).includes(target)).length;
    case "folder":   return entries.filter((e) => e.folderId === target).length;
    case "rarity":   return entries.filter((e) => e.rarity === target).length;
    case "merged":   return entries.filter((e) => e.mergedMembers && e.mergedMembers.length).length;
    default: return 0;
  }
}

/**
 * 响应式求值：返回各成就解锁态。
 *  - unlocked：曾解锁（prev.unlocked）或当前 current >= threshold。
 *  - unlockedAt：解锁时的时间戳；已解锁则保留历史时间（不刷新），未解锁为 null。
 *  - current：当前匹配进度（用于展示 current/threshold）。
 *
 * @param {Array<object>} entries 收藏条目
 * @param {Array<{id:string,name:string,dimension:string,target:string|null,threshold:number}>} [defs] 成就定义（内置+用户）
 * @param {object} [prev] 上一次进度（保留 unlockedAt / claimed 历史）
 * @returns {{[id:string]:{unlocked:boolean,unlockedAt:string|null,current:number}}}
 */
export function evaluateAchievements(entries, defs, prev) {
  const out = {};
  const now = new Date().toISOString();
  for (const d of defs || []) {
    const current = countMatches(entries, d.dimension, d.target);
    const wasUnlocked = prev && prev[d.id] && prev[d.id].unlocked;
    const unlocked = wasUnlocked || current >= d.threshold;
    out[d.id] = {
      unlocked,
      unlockedAt: unlocked ? (wasUnlocked && prev[d.id].unlockedAt ? prev[d.id].unlockedAt : now) : null,
      current,
    };
  }
  return out;
}
