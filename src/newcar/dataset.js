/**
 * src/newcar/dataset.js
 *
 * 内置 2026 发布日历数据集: 加载 / 清洗 / 筛选 / 详情占位.
 * 纯函数, 无 Preact 依赖, 由 renderer store 调用.
 *
 * esbuild 原生支持 .json import (打进 bundle, 天然离线, 零网络).
 */

import builtin from './newcar-2026.json';

/**
 * 读内置 JSON 数据集.
 * @returns {import('./types.js').CalendarDataset}
 */
export function loadBuiltinCalendar() {
  return builtin;
}

/**
 * 清洗原始 release 数组: 过滤缺 id / releaseDate 格式非法 的记录.
 * @param {Array|{releases?: Array}|null} [raw]
 * @returns {import('./types.js').ReleaseRecord[]}
 */
export function normalize(raw) {
  const list = Array.isArray(raw)
    ? raw
    : raw && Array.isArray(raw.releases)
      ? raw.releases
      : [];
  return list.filter(
    (r) =>
      r &&
      typeof r.id === 'string' &&
      r.id &&
      typeof r.releaseDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(r.releaseDate),
  );
}

/**
 * 应用筛选条件. 任意条件为空 / 未设表示不限制.
 * @param {import('./types.js').ReleaseRecord[]} list
 * @param {import('./types.js').FilterState} [f]
 * @returns {import('./types.js').ReleaseRecord[]}
 */
export function filterReleases(list, f) {
  const fil = f || {};
  return (list || []).filter((r) => {
    if (fil.brands && fil.brands.length && !fil.brands.includes(r.brand)) return false;
    if (fil.energyTypes && fil.energyTypes.length && !fil.energyTypes.includes(r.energyType)) {
      return false;
    }
    if (fil.status && fil.status.length && !fil.status.includes(r.status)) return false;
    if (fil.date && r.releaseDate !== fil.date) return false;
    if (fil.priceMin != null && (r.priceMax == null || r.priceMax < fil.priceMin)) return false;
    if (fil.priceMax != null && (r.priceMin == null || r.priceMin > fil.priceMax)) return false;
    return true;
  });
}

/**
 * P1 详情增强占位: MVP 直接返 null (不接真实 API, 不阻断主列表).
 * 真实骨架见 src/newcar/fetch-details.js (P1 接汽车数据 API, 失败亦返 null).
 * @param {string} _id
 * @returns {Promise<import('./types.js').CarDetails|null>}
 */
export async function fetchCarDetails(_id) {
  return null;
}
