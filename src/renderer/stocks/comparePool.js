/**
 * src/renderer/stocks/comparePool.js
 *
 * 个股对比池 store — signal-driven, 最多 4 只.
 *
 * entry 字段:
 *   code          必填, 唯一 key
 *   name          用户可读的股票名
 *   price?        最近一次见到价 (ResultTable / diagnosisStock)
 *   changePct?
 *   industry?
 *   scores?       可选, 从诊断页加 pool 时附带. 没诊断过就 null, 对比表显示 "—".
 *
 * ponytail:
 *   - 不存 perAngle 全量 (重). 只存 ratings 摘要.
 *   - 不持久化 (跨会话比无意义). tab 重开就清.
 *   - max=4 硬限制, 超出时 addXxx 返 false (不动旧数据), 让 caller 给提示.
 *   - remove 按 code, 重复 code 加 pool 时 toggle 移除.
 */
import { signal, computed } from "@preact/signals";

export const MAX_COMPARE = 4;
export const comparePool = signal([]);
export const compareDrawerOpen = signal(false);

export const comparePoolCount = computed(() => comparePool.value.length);
export const compareIsFull = computed(
  () => comparePool.value.length >= MAX_COMPARE,
);

function hasCode(pool, code) {
  return pool.some((e) => e.code === code);
}

// ponytail: 同 code 重复 → 移除 (toggle). 已满 → 不加, 返 false.
export function toggleCompare(entry) {
  if (!entry || !entry.code) return { ok: false, reason: "missing_code" };
  const pool = comparePool.value;
  if (hasCode(pool, entry.code)) {
    comparePool.value = pool.filter((e) => e.code !== entry.code);
    return { ok: true, action: "removed" };
  }
  if (pool.length >= MAX_COMPARE) {
    return { ok: false, reason: "full", max: MAX_COMPARE };
  }
  comparePool.value = [...pool, normalize(entry)];
  return { ok: true, action: "added" };
}

export function removeFromCompare(code) {
  comparePool.value = comparePool.value.filter((e) => e.code !== code);
}

// ponytail 2026-07-07: drawer 渲染时如果 entry 缺价, 反查一次 stocksSearch 拿到价后
// 写回 pool (reactive), 让全屏 (ResultTable 行尾 "已在对比池" 角标等) 都能看到最新价.
// 不存在的 code 或非数组 pool 都安全 noop.
export function updateComparePrice(code, { price, changePct } = {}) {
  if (!code) return;
  const pool = comparePool.value;
  if (!Array.isArray(pool) || pool.length === 0) return;
  let changed = false;
  const next = pool.map((e) => {
    if (!e || e.code !== code) return e;
    const merged = { ...e };
    if (price != null) {
      merged.price = price;
      changed = true;
    }
    if (changePct != null) {
      merged.changePct = changePct;
      changed = true;
    }
    return merged;
  });
  if (changed) comparePool.value = next;
}

export function clearCompare() {
  comparePool.value = [];
}

export function openCompareDrawer() {
  compareDrawerOpen.value = true;
}

export function closeCompareDrawer() {
  compareDrawerOpen.value = false;
}

export function isInCompare(code) {
  return hasCode(comparePool.value, code);
}

// ponytail: 跟 diagnosis-scorer.js 的 5 维 key 对齐. 没 scores → "—".
export const DIM_LABELS = {
  fundamental: "基本面",
  valuation: "估值",
  capital: "资金",
  tech: "技术",
  risk: "风险",
};
export const DIM_KEYS = Object.keys(DIM_LABELS);

function normalize(entry) {
  return {
    code: entry.code,
    name: entry.name || entry.code,
    price: entry.price ?? null,
    changePct: entry.changePct ?? null,
    industry: entry.industry ?? null,
    scores: entry.scores
      ? {
          overall: entry.scores.overall ?? null,
          dimensions: entry.scores.dimensions || {},
        }
      : null,
    addedAt: Date.now(),
  };
}
