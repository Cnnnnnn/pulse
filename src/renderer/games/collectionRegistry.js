/**
 * src/renderer/games/collectionRegistry.js
 *
 * 统一游戏收藏 — 类型注册表（数据驱动架构的核心）。
 *
 * ⚠️ 关键现实约束（见设计文档 §10 数据契约）：
 *   - 本项目「已收藏集合」即 `wishlist` 信号，**不存在 master catalog（全量游戏目录）**。
 *     因此「未收集」状态在真实数据里无对应物；原型里的 ghost/锁双态仅为演示。
 *   - 故本注册表的 `catalog` 钩子接收「已收藏条目数组」做**视图派生**（按平台 / 按分级 /
 *     按稀有度档位过滤），而非「从未收集目录里挑选」。
 *   - 完成度 `progress` 语义据此设计为两种真实、可达成的口径：
 *       1) 分级覆盖：本视图内已设稀有度的条目数 / 总条目数（"去给收藏分级吧"）；
 *       2) 文件夹目标：条目数 / 文件夹 target（复用既有 folder.target）。
 *
 * 设计原则（设计文档 §7 可扩展性）：新增一个游戏类型 / 收集品类，只需在此注册一项，
 * 视图层（CollectionView / CollectibleCard / CompletionRing）对类型**零硬编码**。
 *
 * 本文件不依赖任何 store / api / 网络；仅引用 rarityTiers.js 的纯常量，可独立单测。
 */

import { DEFAULT_RARITY_TIERS } from "./rarityTiers.js";

/**
 * 平台 → 展示用 emoji（与 gamesStore.PLATFORMS 对齐；这里仅做展示，不引入 store 以免循环）。
 * @type {Record<string,string>}
 */
const PLATFORM_EMOJI = {
  steam: "🎮",
  epic: "🎁",
  xbox: "🟢",
  playstation: "🔵",
  switch: "🔴",
};

/**
 * 判断一条已收藏条目是否已「分级」（稀有度 id 非空）。
 * @param {{rarity?:string|null}} entry
 * @returns {boolean}
 */
export function isRanked(entry) {
  return !!(entry && typeof entry.rarity === "string" && entry.rarity);
}

/**
 * 计算「分级覆盖率」完成度。
 * @param {Array<{rarity?:string|null}>} entries
 * @returns {{collected:number,total:number,pct:number,caption:string}}
 */
export function rarityCoverage(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const total = list.length;
  const collected = list.filter(isRanked).length;
  const pct = total > 0 ? collected / total : 0;
  return {
    collected,
    total,
    pct,
    caption: `已分级 ${collected} / ${total}`,
  };
}

/**
 * 带目标值的完成度（文件夹目标覆盖）。
 * @param {number} collected
 * @param {number|null} target
 * @returns {{collected:number,total:number,pct:number,caption:string}}
 */
export function targetCoverage(collected, target) {
  const c = Math.max(0, Math.floor(Number(collected) || 0));
  const t = target == null ? null : Math.max(0, Math.floor(Number(target) || 0));
  if (t == null || t <= 0) {
    return { collected: c, total: c, pct: c > 0 ? 1 : 0, caption: `${c} 款` };
  }
  return {
    collected: Math.min(c, t),
    total: t,
    pct: c / t,
    caption: `${c} / ${t}`,
  };
}

/**
 * 稀有度分布统计：按档位 id 聚合条目数（含 unranked 桶）。
 * @param {Array<{rarity?:string|null}>} entries
 * @param {Array<{id:string,name:string,weight:number,color:string}>} [tiers]
 * @returns {Array<{id:string,name:string,weight:number,color:string,count:number}>}
 */
export function rarityDistribution(entries, tiers) {
  const list = Array.isArray(entries) ? entries : [];
  const defs =
    tiers && Array.isArray(tiers) && tiers.length
      ? [...tiers].sort((a, b) => b.weight - a.weight)
      : [...DEFAULT_RARITY_TIERS].sort((a, b) => b.weight - a.weight);
  const counts = new Map();
  for (const d of defs) counts.set(d.id, 0);
  let unranked = 0;
  for (const e of list) {
    if (isRanked(e) && counts.has(e.rarity)) counts.set(e.rarity, counts.get(e.rarity) + 1);
    else unranked += 1;
  }
  const rows = defs.map((d) => ({ ...d, count: counts.get(d.id) || 0 }));
  rows.push({
    id: "unranked",
    name: "待分级",
    weight: -1,
    color: "var(--text-secondary)",
    count: unranked,
  });
  return rows;
}

/**
 * 默认类型注册表。
 * 每个类型：
 *   id       唯一键
 *   label    展示名
 *   icon     展示 emoji
 *   accent   主题色（引用全局令牌，禁裸 hex）
 *   catalog(entries, ctx) -> 派生后的条目数组（视图过滤）
 *   progress(entries, ctx) -> 完成度 {collected,total,pct,caption}
 *   rarityTiers  该类型使用的档位（默认复用 DEFAULT_RARITY_TIERS）
 *   milestone    里程碑阈值 [0..1]（默认 25/50/75/100%）
 *
 * ctx 形状：{ target?: number|null }（文件夹类型传入 folder.target）
 */
export const DEFAULT_COLLECTION_TYPES = {
  all: {
    id: "all",
    label: "全平台图鉴",
    icon: "🎮",
    accent: "var(--accent-primary)",
    catalog: (entries) => (Array.isArray(entries) ? entries : []),
    progress: (entries) => rarityCoverage(entries),
    rarityTiers: DEFAULT_RARITY_TIERS,
    milestone: [0.25, 0.5, 0.75, 1],
  },

  // ── 平台视图（证明「同一套 UI 派生不同类型」）──
  steam: platformType("steam"),
  epic: platformType("epic"),
  xbox: platformType("xbox"),
  playstation: platformType("playstation"),
  switch: platformType("switch"),

  // ── 稀有度「待分级」视图：未分级条目集合，完成度=已分级覆盖（鼓励去分级）──
  unranked: {
    id: "unranked",
    label: "待分级",
    icon: "🏷️",
    accent: "var(--text-secondary)",
    catalog: (entries) =>
      (Array.isArray(entries) ? entries : []).filter((e) => !isRanked(e)),
    progress: (entries) => {
      const cov = rarityCoverage(entries);
      // 反相：待分级视图的「完成」= 清零未分级项
      return {
        collected: cov.total - cov.collected,
        total: cov.total,
        pct: cov.total > 0 ? 1 - cov.pct : 0,
        caption: `剩余未分级 ${cov.total - cov.collected} / ${cov.total}`,
      };
    },
    rarityTiers: DEFAULT_RARITY_TIERS,
    milestone: [0.25, 0.5, 0.75, 1],
  },

  // ── 传说收藏：仅展示 legendary 档位，完成度=已分级覆盖（稀缺感）──
  legendary: {
    id: "legendary",
    label: "传说典藏",
    icon: "👑",
    accent: "var(--color-warning)",
    catalog: (entries) =>
      (Array.isArray(entries) ? entries : []).filter((e) => e && e.rarity === "legendary"),
    progress: (entries) => rarityCoverage(entries),
    rarityTiers: DEFAULT_RARITY_TIERS,
    milestone: [0.25, 0.5, 0.75, 1],
  },
};

/**
 * 构造一个「平台过滤」类型定义（工厂，避免 5 个重复字面量）。
 * @param {string} platform
 */
function platformType(platform) {
  const emoji = PLATFORM_EMOJI[platform] || "🎮";
  return {
    id: platform,
    label: platform.charAt(0).toUpperCase() + platform.slice(1),
    icon: emoji,
    accent: "var(--accent-primary)",
    catalog: (entries) =>
      (Array.isArray(entries) ? entries : []).filter((e) => e && e.platform === platform),
    progress: (entries) => rarityCoverage(entries),
    rarityTiers: DEFAULT_RARITY_TIERS,
    milestone: [0.25, 0.5, 0.75, 1],
  };
}

/**
 * 取某个类型定义（含用户自定义覆盖）；不存在返回 null。
 * @param {string} id
 * @param {Record<string,object>} [custom] 用户自定义注册覆盖（合并到默认之上）
 * @returns {object|null}
 */
export function getCollectionType(id, custom) {
  if (!id) return null;
  if (custom && custom[id]) return custom[id];
  return DEFAULT_COLLECTION_TYPES[id] || null;
}

/**
 * 列出全部可用类型（默认 + 自定义），保持插入顺序。
 * @param {Record<string,object>} [custom]
 * @returns {object[]}
 */
export function listCollectionTypes(custom) {
  const base = Object.values(DEFAULT_COLLECTION_TYPES);
  const extra = custom ? Object.values(custom) : [];
  return [...base, ...extra];
}

/**
 * 计算某类型在某上下文下的目录条目。
 * @param {string} typeId
 * @param {Array<object>} entries 已收藏条目数组
 * @param {{target?:number|null, custom?:object}} [ctx]
 * @returns {object[]}
 */
export function catalogOf(typeId, entries, ctx = {}) {
  const t = getCollectionType(typeId, ctx.custom);
  if (!t) return Array.isArray(entries) ? entries : [];
  return t.catalog(entries, ctx) || [];
}

/**
 * 计算某类型完成度。
 * @param {string} typeId
 * @param {Array<object>} entries 已收藏条目数组（全量，非目录过滤后）
 * @param {{target?:number|null, custom?:object}} [ctx]
 * @returns {{collected:number,total:number,pct:number,caption:string}}
 */
export function progressOf(typeId, entries, ctx = {}) {
  const t = getCollectionType(typeId, ctx.custom);
  if (!t) return { collected: 0, total: 0, pct: 0, caption: "" };
  return t.progress(entries, ctx) || { collected: 0, total: 0, pct: 0, caption: "" };
}

/**
 * 里程碑判定：给定旧/新完成度 pct，返回「本次越过的里程碑阈值数组」。
 * 用于解锁庆祝动效（25/50/75/100%）。
 * @param {number} prevPct 旧完成度 [0..1]
 * @param {number} nextPct 新完成度 [0..1]
 * @param {number[]} [milestones]
 * @returns {number[]}
 */
export function crossedMilestones(prevPct, nextPct, milestones) {
  const ms = Array.isArray(milestones) && milestones.length ? milestones : [0.25, 0.5, 0.75, 1];
  const lo = Math.min(prevPct, nextPct);
  const hi = Math.max(prevPct, nextPct);
  return ms.filter((m) => m > lo && m <= hi);
}

/** 裁剪 pct 到 [0,1]。 */
export function clampPct(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
