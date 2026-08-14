/**
 * src/renderer/selectors.js
 *
 * 从原始 result 列表派生出按 section 分组的结果。
 * 用 computed signal 包裹：只有依赖变化时才会重算。
 *
 * v2 改进:
 *   - 不再读旧 checkStatus signal, 统一读 checkSession.phase
 */

import { computed } from '@preact/signals';
import * as category from '../config/category.ts';
import {
  results,
  resultSignals,
  searchQuery,
  activeFilter,
  activeCategory,
} from './store.ts';

// ─── 分组定义 ──────────────────────────────────────
// dotColor 跟随对应 accent token (P4 OKLCH 化后保持视觉一致).
// 未在 token 系统的细微变体 (如 #aeaeb2 ≈ gray-300 / #c7c7cc ≈ gray-200) 用对应 gray 阶.
export const SECTION_DEFS = [
  { key: 'update_available', label: '有待更新',   color: 'var(--accent-orange)', dotColor: 'var(--accent-orange)' },
  { key: 'up_to_date',       label: '已是最新',   color: 'var(--accent-green)',  dotColor: 'var(--accent-green)' },
  { key: 'installed_newer',  label: '本机较新', color: 'var(--accent-blue)',   dotColor: 'var(--accent-blue)' },
  { key: 'incompatible',     label: '格式不兼容', color: 'var(--accent-gray)',   dotColor: 'var(--accent-gray)' },
  { key: 'no_auto_check',    label: '无法检测',   color: 'var(--accent-gray)',   dotColor: 'var(--gray-300)' },
  { key: 'not_installed',    label: '未安装',     color: 'var(--text-tertiary)', dotColor: 'var(--gray-200)' },
];

/**
 * 把单个 result 分到 section.key。
 */
function pickSectionKey(r: any): string {
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
function buildSections(list: any[]) {
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
 * computed signal: 按 section 分组的结果。
 * 订阅 results Map (任何 applyProgress 都会换 Map 实例 → 触发重算)。
 *
 * Section 渲染时只把 items (name[]) 透传给 AppRow,
 * AppRow 自己从 resultSignals 取最新数据 → Section 重渲染不带动其它 row。
 */
export const resultsBySection = computed(() => {
  // 显式订阅 results Map
   
  results.value;

  const all: any[] = [];
  for (const sig of resultSignals.values()) {
    if (sig.value) all.push(sig.value);
  }
  return buildSections(all);
});

// ─── 摘要与计数 ──────────────────────────────────────

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
  const parts: any[] = [];
  if (updates)  parts.push(`${updates} 个有更新`);
  if (upToDate) parts.push(`${upToDate} 个已是最新`);
  if (other)    parts.push(`${other} 个需关注`);
  return parts.join('  ·  ') || '暂无数据';
});

/** 可升级应用数量 (驱动"全部升级"按钮) */
export const upgradableCount = computed(() => {
  let n = 0;
  for (const r of results.value.values()) {
    if (r && r.has_update && r.brew_cask) n++;
  }
  return n;
});

// ─── Search + Filter 派生 ───────────────────────────

/**
 * 纯函数: 判断 result 是否通过 tab + search 过滤。
 */
export function matchesFilter(r: any, tab: string, q: string): boolean {
  if (!r) return false;
  if (tab === 'update' && !r.has_update) return false;
  if (tab === 'latest' && (r.has_update || r.status !== 'up_to_date')) return false;
  if (tab === 'error' && r.status !== 'error') return false;
  if (q) {
    const nameMatch = r.name && r.name.toLowerCase().includes(q);
    const bundleMatch = r.bundle && r.bundle.toLowerCase().includes(q);
    if (!nameMatch && !bundleMatch) return false;
  }
  return true;
}

/**
 * computed: filteredResults — 应用 search + tab + category 过滤的 Map<name, result>.
 */
export const filteredResults = computed(() => {
  const tab = activeFilter.value;
  const q = (searchQuery.value || '').toLowerCase().trim();
  const cat = activeCategory.value;
  const out = new Map();
  for (const [name, r] of results.value) {
    if (!matchesFilter(r, tab, q)) continue;
    if (cat !== 'all' && category.getCategory(name) !== cat) continue;
    out.set(name, r);
  }
  return out;
});

/**
 * computed: tabCounts — 4 个 tab 的 count。
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
 * computed: filteredResultsBySection — 过滤后的分组结果。
 */
export const filteredResultsBySection = computed(() => {
  // 显式订阅
   
  filteredResults.value;
  return buildSections(Array.from(filteredResults.value.values()));
});
