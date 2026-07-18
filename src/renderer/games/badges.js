/**
 * src/renderer/games/badges.js
 *
 * 组合徽章（P1b · B）— 内置规则表（代码常量）+ 响应式求值。
 *
 * 约定（见 PRD §2 B / 架构 §3.5）：
 *  - 徽章是「展示型荣誉」，基于现有数据（标签 / 收藏夹 / 合并主记录 / 稀有度）派生，
 *    与 C 成就引擎独立（Q4 已采纳：不强制合并）。
 *  - 规则定义为代码常量 BUILTIN_BADGE_RULES（不持久化）；已点亮集合可缓存到
 *    pulse.games.badges.earned.v1（见 gamesStore.js）。
 *  - 本文件为纯函数（无网络、无副作用、不依赖 signals / DOM），便于单测。
 */

/**
 * 内置徽章规则（代码常量，不持久化）。
 * 每条：{ id, name, desc, icon, test(ctx) }。
 *  - icon：emoji（a11y 另加 aria-label）。
 *  - test(ctx)：基于派生上下文 ctx 返回布尔，命中即点亮。
 *  - 顺序即徽章墙展示顺序（已点亮在前、未点亮置灰在后，见 BadgeWall）。
 */
export const BUILTIN_BADGE_RULES = [
  {
    id: "first_10",
    name: "初露锋芒",
    desc: "收藏满 10 款",
    icon: "🌱",
    test: (c) => c.total >= 10,
  },
  {
    id: "first_merge",
    name: "跨界收藏家",
    desc: "完成首次合并",
    icon: "🔗",
    test: (c) => c.mergedCount >= 1,
  },
  {
    id: "multiplat",
    name: "全家桶",
    desc: "同一游戏 ≥3 平台",
    icon: "🎮",
    test: (c) => c.maxPlatforms >= 3,
  },
  {
    id: "fully_rated",
    name: "评分达人",
    desc: "全部已评分",
    icon: "⭐",
    test: (c) => c.total > 0 && c.rated === c.total,
  },
  {
    id: "collector",
    name: "收藏大师",
    desc: "收藏满 50 款",
    icon: "🏆",
    test: (c) => c.total >= 50,
  },
  {
    id: "folder_master",
    name: "收纳控",
    desc: "创建 ≥3 收藏夹",
    icon: "📁",
    test: (c) => c.folderCount >= 3,
  },
  {
    id: "tagged",
    name: "标签猎人",
    desc: "使用 ≥5 标签",
    icon: "🏷️",
    test: (c) => c.tagKinds >= 5,
  },
  {
    id: "legendary",
    name: "传说收藏",
    desc: "拥有传说稀有度",
    icon: "💎",
    test: (c) => c.hasLegendary,
  },
];

/** 规则 id → 规则对象（O(1) 查表，供 BadgeWall 取 name/icon/desc）。 */
const BADGE_RULE_MAP = new Map(BUILTIN_BADGE_RULES.map((r) => [r.id, r]));

/**
 * 按 id 取规则；不存在返回 undefined。
 * @param {string} id
 * @returns {{id:string,name:string,desc:string,icon:string,test:(c:object)=>boolean}|undefined}
 */
export function getBadgeRule(id) {
  return BADGE_RULE_MAP.get(id);
}

/**
 * 从收藏条目派生徽章求值上下文（纯函数，从 entries 计算）。
 *
 * 字段（见 PRD/任务规范）：
 *  - total：条目总数。
 *  - rated：rating > 0 的条目数。
 *  - mergedCount：mergedMembers / mergedIds 非空的条目数。
 *  - maxPlatforms：各游戏覆盖平台数最大值（合并项按 mergedMembers 长度计，单条计 1）。
 *  - folderCount：条目中去重后的 folderId 数（即「用到过 ≥N 个收藏夹」）。
 *  - tagKinds：条目中去重后的标签数。
 *  - hasLegendary：是否存在 rarity === "legendary" 的条目。
 *
 * @param {Array<{rating?:number,mergedMembers?:Array|null,mergedIds?:Array|null,folderId?:string|null,tags?:string[],rarity?:string|null}>} entries
 * @param {Array<any>} [folders] 预留（当前从 entries 计算，未使用）。
 * @param {Array<any>} [tags] 预留（当前从 entries 计算，未使用）。
 * @returns {{total:number,rated:number,mergedCount:number,maxPlatforms:number,folderCount:number,tagKinds:number,hasLegendary:boolean}}
 */
export function buildBadgeCtx(entries, folders, tags) {
  const list = Array.isArray(entries) ? entries : [];
  const folderIds = new Set();
  const tagSet = new Set();
  let rated = 0;
  let mergedCount = 0;
  let maxPlatforms = 0;
  let hasLegendary = false;

  for (const e of list) {
    if (e && e.rating > 0) rated += 1;

    const isMerged = !!(
      (e && e.mergedMembers && Array.isArray(e.mergedMembers) && e.mergedMembers.length) ||
      (e && e.mergedIds && Array.isArray(e.mergedIds) && e.mergedIds.length)
    );
    if (isMerged) mergedCount += 1;

    const platforms =
      e && e.mergedMembers && Array.isArray(e.mergedMembers) && e.mergedMembers.length
        ? e.mergedMembers.length
        : 1;
    if (platforms > maxPlatforms) maxPlatforms = platforms;

    if (e && e.folderId != null && e.folderId !== "") folderIds.add(e.folderId);

    if (e && Array.isArray(e.tags)) {
      for (const t of e.tags) {
        if (t) tagSet.add(t);
      }
    }

    if (e && e.rarity === "legendary") hasLegendary = true;
  }

  return {
    total: list.length,
    rated,
    mergedCount,
    maxPlatforms,
    folderCount: folderIds.size,
    tagKinds: tagSet.size,
    hasLegendary,
  };
}

/**
 * 响应式求值：返回已点亮徽章 [{ id, earnedAt }]。
 * 对命中规则返回点亮记录；earnedAt 用当前 ISO 时间（仅当前命中集，无历史进度）。
 *
 * @param {Array<object>} entries 收藏条目
 * @param {{total:number,rated:number,mergedCount:number,maxPlatforms:number,folderCount:number,tagKinds:number,hasLegendary:boolean}} [ctx]
 *   预计算的徽章上下文；省略时由 entries 自动构建（兜底）。
 * @returns {Array<{id:string,earnedAt:string}>}
 */
export function evaluateBadges(entries, ctx) {
  const context = ctx || buildBadgeCtx(entries);
  const now = new Date().toISOString();
  const out = [];
  for (const rule of BUILTIN_BADGE_RULES) {
    let hit = false;
    try {
      hit = !!(rule.test && rule.test(context));
    } catch {
      hit = false; // 单条规则异常不影响其它规则
    }
    if (hit) out.push({ id: rule.id, earnedAt: now });
  }
  return out;
}
