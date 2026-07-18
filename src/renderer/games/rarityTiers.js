/**
 * src/renderer/games/rarityTiers.js
 *
 * 稀有度档位（P1a · A）— 默认常量 + 纯函数。
 *
 * 约定（见架构 §3.3 / §7 共享知识）：
 *  - 档位为代码常量 DEFAULT_RARITY_TIERS（4 档），用户可重命名 / 新增 / 删除，持久化于
 *    pulse.games.rarity.tiers.v1（键登记在 gamesStore.js 顶部 KEY 区）。
 *  - 每个档位 { id, name, weight, color }：weight 越大越稀有（驱动排序 / 分布展示），
 *    color 仅用 var(--token) 或 color-mix(in oklch,…)，禁止裸 hex（Stylelint color-no-hex）。
 *  - 本文件不依赖任何外部模块 / 不产生网络出口，便于单测与复用。
 */

/**
 * 默认 4 档（common → legendary，weight 递增）。
 * 颜色统一引用全局语义令牌（明暗双值已在 styles.css 主题感知）：
 *  - common（普通）：中性灰 var(--text-secondary)
 *  - rare（稀有）：  绿   var(--color-success)
 *  - epic（史诗）：  蓝   var(--color-info)
 *  - legendary（传说）：琥珀 var(--color-warning)
 */
export const DEFAULT_RARITY_TIERS = [
  { id: "common", name: "普通", weight: 1, color: "var(--text-secondary)" },
  { id: "rare", name: "稀有", weight: 2, color: "var(--color-success)" },
  { id: "epic", name: "史诗", weight: 3, color: "var(--color-info)" },
  { id: "legendary", name: "传说", weight: 4, color: "var(--color-warning)" },
];

/**
 * 归一化单个档位。非法（缺 id）返回 null，调用方负责过滤。
 * @param {any} raw
 * @returns {{id:string,name:string,weight:number,color:string}|null}
 */
export function normalizeRarityTier(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  if (!id) return null;
  return {
    id,
    name: typeof raw.name === "string" && raw.name ? raw.name : id,
    weight: Number.isFinite(Number(raw.weight)) ? Number(raw.weight) : 1,
    color: typeof raw.color === "string" && raw.color ? raw.color : "var(--text-secondary)",
  };
}

/**
 * 按 weight 降序（越稀有越靠前）。返回新数组，不修改入参。
 * @param {Array<{id:string,weight:number,name:string,color:string}>} tiers
 * @returns {Array<{id:string,weight:number,name:string,color:string}>}
 */
export function sortByWeight(tiers) {
  return [...(tiers || [])].sort((a, b) => b.weight - a.weight);
}

/**
 * 取某档位颜色；未知 id / null 返回中性色（var(--text-secondary)）。
 * @param {Array<{id:string,color:string}>} tiers
 * @param {string|null} rarityId
 * @returns {string}
 */
export function tierColorOf(tiers, rarityId) {
  if (!rarityId) return "var(--text-secondary)";
  const t = (tiers || []).find((x) => x.id === rarityId);
  return t ? t.color : "var(--text-secondary)";
}
