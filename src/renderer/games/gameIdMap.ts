/**
 * src/renderer/games/gameIdMap.js
 *
 * 跨平台「同一游戏」静态映射表 + 去重候选查询（纯本地、无网络）。
 *
 * 设计说明：
 * - 条目主键形如 `platform:id`（与 gamesStore.getWishlistKey 一致）。
 * - 这里仅维护**少量示例映射**（3–5 条），用于阶段 1 验证「可合并」徽标与
 *   合并/拆分 round-trip。后续阶段可接 ITAD 等价表动态扩充，接口不变。
 * - 仅做「建议 + 确认」，绝不自动合并：findMergeCandidates 只返回候选 key，
 *   是否合并由用户在 MergeConfirmModal 中确认。
 *
 * 本文件不依赖 store / api，避免循环依赖与网络出口。
 */

/**
 * 规范化「同一游戏」索引。每个游戏登记其在各平台的 key。
 *
 * ⚠️ key 必须与 gamesStore.getWishlistKey(game) 一致，即 `platform:${game.id}`。
 * 注意：各平台的 game.id 自身常带平台前缀（如 Steam 的 id = "steam-367520"），
 * 故完整 key 形如 "steam:steam-367520" / "epic:epic-hollowknight" 等。
 *
 * @type {Array<{id:string,title:string,platforms:Record<string,string>}>}
 */
const CANONICAL_GAMES = [
  {
    id: "hollow-knight",
    title: "Hollow Knight",
    platforms: {
      steam: "steam:steam-367520",
      epic: "epic:epic-hollowknight",
      gog: "gog:1207664663",
      switch: "switch:hollow-knight",
    },
  },
  {
    id: "stardew-valley",
    title: "Stardew Valley",
    platforms: {
      steam: "steam:steam-413150",
      xbox: "xbox:stardew-valley",
      gog: "gog:1453375254",
    },
  },
  {
    id: "celeste",
    title: "Celeste",
    platforms: {
      steam: "steam:steam-504230",
      epic: "epic:celeste",
      gog: "gog:1850576697",
    },
  },
  {
    id: "hades",
    title: "Hades",
    platforms: {
      steam: "steam:steam-1145360",
      epic: "epic:hades",
      gog: "gog:1426438811",
    },
  },
  {
    id: "dead-cells",
    title: "Dead Cells",
    platforms: {
      steam: "steam:steam-588650",
      xbox: "xbox:dead-cells",
      gog: "gog:1196800168",
    },
  },
];

/** key → canonical game id 反向索引（构建一次）。 */
const KEY_TO_GAME = (() => {
  /** @type {Record<string,string>} */
  const map = {};
  for (const g of CANONICAL_GAMES) {
    for (const k of Object.values(g.platforms)) map[k] = g.id;
  }
  return map;
})();

/**
 * 面向阅读的静态映射表：steam key → 其他平台等价 key 列表。
 * 仅作文档/调试用途，查询走 findMergeCandidates。
 */
export const STEAM_TO_OTHER = CANONICAL_GAMES.reduce((acc, g) => {
  if (g.platforms.steam) {
    acc[g.platforms.steam] = Object.entries(g.platforms)
      .filter(([p]) => p !== "steam")
      .map(([, k]) => k);
  }
  return acc;
}, /** @type {Record<string,string[]>} */ ({}));

/**
 * 返回与 key 同游戏的「其他平台」候选 key 列表（不含自身）。
 * 若 key 不在静态表中，返回空数组（即「映射未知」）。
 * @param {string} key
 * @returns {string[]}
 */
export function findMergeCandidates(key) {
  const gameId = KEY_TO_GAME[key];
  if (!gameId) return [];
  const game = CANONICAL_GAMES.find((g) => g.id === gameId);
  if (!game) return [];
  return Object.values(game.platforms).filter((k) => k !== key);
}

/**
 * 判断两个 key 是否为同一游戏（基于静态表）。
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function areSameGame(a, b) {
  const ga = KEY_TO_GAME[a];
  const gb = KEY_TO_GAME[b];
  return !!ga && ga === gb;
}

/**
 * 判断一组 key 是否「全部命中同一静态游戏映射」（即已知同游戏、无需用户自确认）。
 * 任一 key 不在表中、或分属不同游戏 → 视为未知（false）。
 * 单条或空数组：无歧义，返回 true（空数组语义由调用方决定）。
 *
 * 仅用于「建议 + 确认」流程中区分已知映射 / 手动合并的提示文案，绝不参与自动合并。
 * @param {string[]} keys
 * @returns {boolean}
 */
export function areCandidatesKnown(keys) {
  const list = Array.isArray(keys) ? keys : [];
  if (list.length < 2) return true;
  const first = KEY_TO_GAME[list[0]];
  if (!first) return false;
  return list.every((k) => KEY_TO_GAME[k] === first);
}
