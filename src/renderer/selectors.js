/**
 * src/renderer/selectors.js
 *
 * 从原始 result 列表派生出按 section 分组的结果。
 * 用 computed signal 包裹：只有 results 变化时才会重算。
 *
 * Phase 23: 加 filteredResults (search + tab 双重过滤) + tabCounts.
 */

import { computed } from '@preact/signals';
import { results, resultSignals, searchQuery, activeFilter } from './store.js';

// ─── 分组定义 (跟旧 renderer.js 的 SECTION_DEFS 保持一致) ─
export const SECTION_DEFS = [
  { key: 'update_available', label: '有待更新',   color: 'var(--accent-orange)', dotColor: '#ff9500' },
  { key: 'up_to_date',       label: '已是最新',   color: 'var(--accent-green)',  dotColor: '#34c759' },
  { key: 'installed_newer',  label: '预发布版本', color: 'var(--accent-blue)',   dotColor: '#007aff' },
  { key: 'incompatible',     label: '格式不兼容', color: 'var(--accent-gray)',   dotColor: '#8e8e93' },
  { key: 'no_auto_check',    label: '无法检测',   color: 'var(--accent-gray)',   dotColor: '#aeaeb2' },
  { key: 'not_installed',    label: '未安装',     color: 'var(--text-tertiary)', dotColor: '#c7c7cc' },
];

/**
 * 把单个 result 分到 section.key。
 * 沿用旧 renderer.js 的判定规则：
 *   - status=up_to_date 且 note=installed_newer → installed_newer
 *   - status=no_auto_check 且 note=incompatible → incompatible
 *   - 否则按 status 桶进；落不到已知桶 → no_auto_check
 */
function pickSectionKey(r) {
  const note = r.note || '';
  const status = r.status;
  if (status === 'up_to_date' && note === 'installed_newer') return 'installed_newer';
  if (status === 'no_auto_check' && note === 'incompatible')  return 'incompatible';
  const def = SECTION_DEFS.find(d => d.key === status);
  return def ? status : 'no_auto_check';
}

/**
 * 把 results 转成 [{ ...def, items: name[] }]。
 * 只返回有 items 的 section，按 SECTION_DEFS 顺序输出。
 */
function buildSections(list) {
  const buckets = new Map();
  for (const def of SECTION_DEFS) buckets.set(def.key, []);

  for (const r of list) {
    const key = pickSectionKey(r);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r.name);
  }

  return SECTION_DEFS
    .filter(d => buckets.get(d.key).length > 0)
    .map(d => ({ ...d, items: buckets.get(d.key) }));
}

/**
 * computed signal: 订阅 results，重算时把所有 result 收集起来分组。
 * 注意：这里直接读 `results.value` (Map) —— 任何一次 applyProgress
 * 都会换一个新 Map 实例，因此这个 computed 会重算。
 *
 * 但 Section 渲染时只把 `section.items` (name 列表) 透传给 AppRow，
 * AppRow 自己从 resultSignals 取最新数据 —— 因此 Section 重渲染
 * 不会带动其它 row 重渲染。
 */
export const resultsBySection = computed(() => {
  // 依赖 results Map
  // eslint-disable-next-line no-unused-expressions
  results.value;

  // 收集所有已有 result (以 resultSignals 为真相源，因为 spec 写的是用 Map，
  // 但 per-row signal 才能让单 row 订阅。我们两套都更新，保持一致)。
  const all = [];
  for (const [name, sig] of resultSignals) {
    if (sig.value) all.push(sig.value);
  }
  return buildSections(all);
});

// ─── 派生数据选择器 ──────────────────────────────────────
/**
 * 摘要行: "3 个有更新 · 5 个已是最新 · 1 个需关注"
 */
export const summary = computed(() => {
  let updates = 0, upToDate = 0, other = 0;
  for (const sig of resultSignals.values()) {
    const r = sig.value;
    if (!r) continue;
    if (r.has_update) updates++;
    else if (r.status === 'up_to_date') upToDate++;
    else other++;
  }
  const parts = [];
  if (updates)  parts.push(`${updates} 个有更新`);
  if (upToDate) parts.push(`${upToDate} 个已是最新`);
  if (other)    parts.push(`${other} 个需关注`);
  return parts.join('  ·  ') || '暂无数据';
});

/** 可升级应用数量 (驱动"全部升级"按钮) */
export const upgradableCount = computed(() => {
  let n = 0;
  for (const sig of resultSignals.values()) {
    const r = sig.value;
    if (r && r.has_update && r.brew_cask) n++;
  }
  return n;
});

/** 是否还有 app 在 check (驱动 skeleton / 按钮 disabled) */
export const checkedCount = computed(() => {
  let n = 0;
  for (const sig of resultSignals.values()) {
    if (sig.value) n++;
  }
  return n;
});

// ─── Phase 23: Search + Filter 派生 ───────────────────────

/**
 * 纯函数: 判断 result 是否通过 tab + search 过滤.
 * 抽出来便于单元测试, selectors 内部也直接用.
 *
 * @param {object} r           result
 * @param {string} tab         'all' | 'update' | 'latest' | 'error'
 * @param {string} q           search query (已经 lowercase + trim)
 * @returns {boolean}
 */
export function matchesFilter(r, tab, q) {
  if (!r) return false;
  // tab filter
  if (tab === 'update' && !r.has_update) return false;
  if (tab === 'latest' && (r.has_update || r.status !== 'up_to_date')) return false;
  if (tab === 'error' && r.status !== 'error') return false;
  // search filter (substring, case-insensitive, match name + bundle)
  if (q) {
    const nameMatch = r.name && r.name.toLowerCase().includes(q);
    const bundleMatch = r.bundle && r.bundle.toLowerCase().includes(q);
    if (!nameMatch && !bundleMatch) return false;
  }
  return true;
}

/**
 * computed: filteredResults — 应用 search + tab 过滤的 Map<name, result>.
 * 订阅 results + searchQuery + activeFilter. 任一变化 → 重算.
 * Returns Map 跟 results 形状一致, 方便 ResultsView 不用改.
 */
export const filteredResults = computed(() => {
  const tab = activeFilter.value;
  const q = (searchQuery.value || '').toLowerCase().trim();
  const out = new Map();
  for (const [name, r] of results.value) {
    if (matchesFilter(r, tab, q)) out.set(name, r);
  }
  return out;
});

/**
 * computed: tabCounts — 4 个 tab 的 count, 用全局 results 算 (不受自己 filter 影响).
 *   { all, update, latest, error }
 */
export const tabCounts = computed(() => {
  const counts = { all: 0, update: 0, latest: 0, error: 0 };
  for (const r of results.value.values()) {
    if (!r) continue;
    counts.all++;
    if (r.has_update) counts.update++;
    else if (r.status === 'up_to_date') counts.latest++;
    if (r.status === 'error') counts.error++;
  }
  return counts;
});

/**
 * computed: filteredResultsBySection — 跟 resultsBySection 同结构, 但只含
 *   过滤后的 result. 订阅 filteredResults + searchQuery + activeFilter.
 *   ResultsView 用它替代 resultsBySection.
 */
export const filteredResultsBySection = computed(() => {
  // 显式订阅, 触发重算
  // eslint-disable-next-line no-unused-expressions
  filteredResults.value;
  return buildSections(Array.from(filteredResults.value.values()));
});
