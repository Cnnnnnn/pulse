/**
 * src/main/ai-leaderboard/normalize.js
 *
 * 共享归一化层：fetchJson（UA+超时+abort）、BROWSER_UA、slugifyModel、mergeModelSlices。
 * 照搬 games/normalize.js 的 fetchJson + BROWSER_UA 范式（复用同一份实现，避免漂移）。
 */

const { BROWSER_UA, fetchJson } = require("../games/normalize");
const { SOURCE, toAiModel, makeId } = require("./types");

/**
 * 构造稳定主键：vendor + name 归一化。与 types.makeId 同口径。
 * @param {string|null|undefined} vendor
 * @param {string|null|undefined} name
 * @returns {string}
 */
function slugifyModel(vendor, name) {
  return makeId(vendor, name);
}

/**
 * 多源模型切片合并策略：
 *   - 主键 = id（slugifyModel(vendor, name)）
 *   - 各 fetcher 的 normalize() 只填自身切片（arena / aa / openrouter）
 *   - 按主键合并多源切片为单个 AiModel；缺失切片保持原状
 *   - sources.<slice> 取更优者（live > sample > none）
 *   - 若合并后出现 live 切片，则整条 isSample 置否
 * @param {Array<Array<object>>} slicesList 各 fetcher 产出的 AiModel[] 列表
 * @returns {object[]}
 */
function mergeModelSlices(slicesList) {
  const byKey = new Map();
  for (const list of slicesList) {
    if (!Array.isArray(list)) continue;
    for (const m of list) {
      if (!m || !m.id) continue;
      const existing = byKey.get(m.id);
      if (!existing) {
        byKey.set(m.id, {
          ...m,
          sources: { ...(m.sources || { arena: SOURCE.NONE, aa: SOURCE.NONE, openrouter: SOURCE.NONE }) },
        });
        continue;
      }
      if (m.arena && Object.keys(m.arena).length) {
        existing.arena = { ...existing.arena, ...m.arena };
      }
      if (m.aa) existing.aa = { ...(existing.aa || {}), ...m.aa };
      if (m.openrouter) {
        existing.openrouter = { ...(existing.openrouter || {}), ...m.openrouter };
      }
      existing.sources.arena = _bestSource(existing.sources.arena, m.sources ? m.sources.arena : SOURCE.NONE);
      existing.sources.aa = _bestSource(existing.sources.aa, m.sources ? m.sources.aa : SOURCE.NONE);
      existing.sources.openrouter = _bestSource(
        existing.sources.openrouter,
        m.sources ? m.sources.openrouter : SOURCE.NONE,
      );
      if (!existing.vendorRaw && m.vendorRaw) existing.vendorRaw = m.vendorRaw;
      // 用 live 切片覆盖 sample 的展示名/vendor（sample 只是兜底占位）
      if (existing.isSample && !m.isSample) {
        existing.name = m.name;
        existing.vendor = m.vendor;
        existing.vendorRaw = m.vendorRaw || existing.vendorRaw;
        existing.category = m.category;
        existing.isSample = false;
      }
    }
  }
  return [...byKey.values()];
}

const _SOURCE_RANK = { live: 2, sample: 1, none: 0 };
function _bestSource(a, b) {
  const ra = _SOURCE_RANK[a] != null ? _SOURCE_RANK[a] : 0;
  const rb = _SOURCE_RANK[b] != null ? _SOURCE_RANK[b] : 0;
  return rb > ra ? b : a;
}

module.exports = {
  BROWSER_UA,
  fetchJson,
  slugifyModel,
  mergeModelSlices,
};
