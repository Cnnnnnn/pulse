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
  // v2.83: 在原 id 主键外, 加 fuzzy 同核心型号合并.
  // 约束:
  //   1. 必须同 vendor (防跨厂商误合)
  //   2. 核心型号 (去前后缀/版本/修饰) 必须完全相同 (保守, 不做相似度)
  //   3. OpenRouter 暂不参与 fuzzy (它跟 AA/Arena 命名都不一致, 避免误合)
  const byKey = new Map();
  for (const list of slicesList) {
    if (!Array.isArray(list)) continue;
    for (const m of list) {
      if (!m || !m.id) continue;
      // OR 走原 id 主键, 不做 fuzzy (避免污染)
      const fuzzyId = m.sources && m.sources.openrouter === SOURCE.LIVE && !m.aa && !m.arena
        ? m.id
        : _fuzzyKey(m);
      const lookupId = fuzzyId || m.id;
      const existing = byKey.get(lookupId) || byKey.get(m.id);
      if (!existing) {
        byKey.set(lookupId, {
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

/**
 * 同 vendor + 核心型号相同的 fuzzy key. 保守策略:
 *   - 小写化 + 去非字母数字
 *   - 删常见前后缀/修饰 (Non-reasoning/High/Low/Max/Thinking/Instant/Codex/xhigh/low/medium 等)
 *   - 删数字版本号 (v1 / 0309 / 1.5) — 保守到极致, 只删日期+版本标记
 *   - 同 vendor 内核心部分相同 → 同 key
 * 误合风险: 同 vendor 不同产品但型号同字符串 (e.g. 不同年份 OpenAI 模型) — 接受有限碰撞
 * @param {object} m AiModel
 * @returns {string} fuzzy id 或 '' (不能 fuzzy 时)
 */
const _MODIFIER_TOKENS = [
  "nonreasoning", "reasoning", "thinking", "instant", "high", "low", "medium",
  "max", "adaptive", "effort", "codex", "harness", "latest",
  "minimal", "instruct", "chat",
];
const _VERSION_RE = /v?\d{1,2}(\.\d{1,2})?(\.\d{1,2})?/g;
const _DATE_RE = /\b\d{6,8}\b/g;
function _fuzzyKey(m) {
  if (!m || !m.vendor || m.vendor === "other") return "";
  const n = String(m.name || "").toLowerCase();
  if (!n) return "";
  // 拆词, 去修饰 token + 版本/日期
  const tokens = n
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => _MODIFIER_TOKENS.indexOf(t) === -1)
    .map(t => t.replace(_VERSION_RE, "").replace(_DATE_RE, ""))
    .filter(Boolean);
  if (tokens.length === 0) return "";
  // 保留核心: vendor + 第一个有意义的 token (一般是产品代号) + 第二个(如版本代号)
  // 进一步保留最多前 2 个核心 token — 避免长链吃多
  const core = tokens.slice(0, 2).join("-");
  return `${m.vendor}-${core}`;
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
