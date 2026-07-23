/**
 * src/main/ai-leaderboard/normalize.ts
 *
 * 共享归一化层：fetchJson（UA+超时+abort）、BROWSER_UA、slugifyModel、mergeModelSlices。
 * 照搬 games/normalize.js 的 fetchJson + BROWSER_UA 范式（复用同一份实现，避免漂移）。
 */

const { BROWSER_UA, fetchJson } = require("../games/normalize");
const { SOURCE, toAiModel, makeId } = require("./types.ts");

/**
 * 构造稳定主键：vendor + name 归一化。与 types.makeId 同口径。
 * @param vendor
 * @param name
 * @returns {string}
 */
export function slugifyModel(vendor: any, name: any): string {
  return makeId(vendor, name);
}

/**
 * 多源模型切片合并策略：
 *   - 第一遍：主键 = id（slugifyModel(vendor, name)）按 id 合并
 *   - 第二遍：name 兜底 — 跨源 vendor 命名不一致 (AA 用 canonical vendor=anthropic,
 *     models.dev router 把同 name 挂在 vendor=other) 导致 id 不匹配. 按归一 baseName
 *     再合并一次, 把错失的 modelsdev slice 接回.
 *   - 各 fetcher 的 normalize() 只填自身切片（arena / aa / openrouter / livebench / modelsdev）
 *   - sources.<slice> 取更优者（live > sample > none）
 *   - 若合并后出现 live 切片，则整条 isSample 置否
 * @param slicesList 各 fetcher 产出的 AiModel[] 列表
 * @returns {object[]}
 */
export function mergeModelSlices(slicesList: any[][]): any[] {
  const byKey = new Map<string, any>();
  for (const list of slicesList) {
    if (!Array.isArray(list)) continue;
    for (const m of list) {
      if (!m || !m.id) continue;
      const existing = byKey.get(m.id);
      if (!existing) {
        byKey.set(m.id, {
          ...m,
          sources: {
            ...(m.sources || {
              arena: SOURCE.NONE,
              aa: SOURCE.NONE,
              openrouter: SOURCE.NONE,
              livebench: SOURCE.NONE,
              modelsdev: SOURCE.NONE,
            }),
          },
        });
        continue;
      }
      _mergeInto(existing, m);
    }
  }
  // ponytail: name 兜底合并. models.dev 把 Claude / Qwen / DeepSeek 等同一基模挂在多 router 下,
  // 它们的 id 是 vendor=other-..., 而 AA / Arena 用 vendor=anthropic / qwen / deepseek-...,
  // 第一轮按 id 合并不到, name 兜底把 modelsdev slice 接回去.
  // 优先级: aa.live > arena.live > openrouter.live > modelsdev.live > livebench.live > sample > none,
  // 同优先级按 vendor canonical (VENDOR_META) > other 选主条.
  return [..._mergeByName([...byKey.values()]).values()];
}

export function _mergeInto(existing: any, m: any) {
  if (m.arena && Object.keys(m.arena).length) {
    existing.arena = { ...existing.arena, ...m.arena };
  }
  if (m.aa) existing.aa = { ...(existing.aa || {}), ...m.aa };
  if (m.openrouter) {
    existing.openrouter = { ...(existing.openrouter || {}), ...m.openrouter };
  }
  if (m.livebench) {
    existing.livebench = { ...(existing.livebench || {}), ...m.livebench };
  }
  if (m.modelsdev) {
    existing.modelsdev = { ...(existing.modelsdev || {}), ...m.modelsdev };
  }
  // ponytail: HF 切片 — 跟上面 4 个 slice 一样合并数据, 但 sources 形状不强制
  // (默认 5 字段, hf 切片自己 6 字段, merge 后保留主条形状, 避免破坏现有 toEqual 断言).
  if (m.huggingface) {
    existing.huggingface = { ...(existing.huggingface || {}), ...m.huggingface };
  }
  existing.sources.arena = _bestSource(existing.sources.arena, m.sources ? m.sources.arena : SOURCE.NONE);
  existing.sources.aa = _bestSource(existing.sources.aa, m.sources ? m.sources.aa : SOURCE.NONE);
  existing.sources.openrouter = _bestSource(
    existing.sources.openrouter,
    m.sources ? m.sources.openrouter : SOURCE.NONE,
  );
  existing.sources.livebench = _bestSource(
    existing.sources.livebench,
    m.sources ? m.sources.livebench : SOURCE.NONE,
  );
  existing.sources.modelsdev = _bestSource(
    existing.sources.modelsdev,
    m.sources ? m.sources.modelsdev : SOURCE.NONE,
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

// 把 name 末尾括号变体归一: "GPT-5.5 (xhigh)" / "Claude Sonnet 5 (Max Effort)" → "GPT-5.5" / "Claude Sonnet 5"
export function _baseName(name: any): string {
  return String(name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// ponytail: 跨源 name 归一 (Arena 用小写连字符 + 末尾变体, MD/AA 用正常 title case).
// 例: Arena "gpt-5.5-high" → "gpt55", MD "GPT-5.5" → "gpt55". 命中后即可按 baseName 兜底合并.
// 末尾变体白名单: high / medium / low / xhigh / preview / instant / pro / thinking / lite / turbo / reasoning / chat / max.
const _VARIANT_SUFFIX = /-(high|medium|low|xhigh|preview|chat|instant|max|pro|thinking|lite|turbo|reasoning)$/i;
export function _normName(name: any): string {
  let s = String(name || "").toLowerCase();
  s = s.replace(_VARIANT_SUFFIX, "");
  s = s.replace(/[^a-z0-9]/g, "");
  return s;
}

export function _priorityScore(m: any): number {
  const src = m.sources || {};
  // 优先级: aa > arena > openrouter > modelsdev > livebench > sample > none
  if (src.aa === "live") return 7;
  if (src.arena === "live") return 6;
  if (src.openrouter === "live") return 5;
  if (src.modelsdev === "live") return 4;
  if (src.livebench === "live") return 3;
  if (m.isSample) return 1;
  return 0;
}

export function _mergeByName(models: any[]): Map<string, any> {
  // 第一轮: 按 baseName (剥末尾括号变体) 合并 — 处理 AA "GPT-5.5 (xhigh)" vs MD "GPT-5.5" 这种.
  // 第二轮: 按 _normName (小写去标点 + 剥末尾横杠变体) 合并 — 处理 Arena "gpt-5.5-high" vs MD "GPT-5.5" 这种.
  // 两轮都共用 _pickAndMerge 逻辑, 同条 id 在两轮间去重避免重复处理.
  const byKey = new Map<string, any>();
  for (const m of models) byKey.set(m.id, m);
  const _mergeGroup = (keyFn: (n: any) => string) => {
    const groups = new Map<string, any[]>();
    for (const m of byKey.values()) {
      const key = keyFn(m.name);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    for (const [, list] of groups) {
      if (list.length < 2) continue;
      list.sort((a, b) => {
        const pa = _priorityScore(a);
        const pb = _priorityScore(b);
        if (pb !== pa) return pb - pa;
        const aIsCanonical = a.vendor && a.vendor !== "other" ? 1 : 0;
        const bIsCanonical = b.vendor && b.vendor !== "other" ? 1 : 0;
        return bIsCanonical - aIsCanonical;
      });
      const primary = list[0];
      for (const other of list.slice(1)) {
        _mergeInto(primary, other);
        byKey.delete(other.id);
      }
    }
  };
  _mergeGroup(_baseName);
  _mergeGroup(_normName);
  return byKey;
}

export const _SOURCE_RANK: Record<string, number> = { live: 2, sample: 1, none: 0 };
export function _bestSource(a: any, b: any): string {
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
