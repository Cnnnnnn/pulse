import { useState } from 'preact/hooks';
import { categoryAllocation, rowsWithMetrics } from './fundStore.js';
import { computeConcentration } from '../../funds/concentration.js';

export const CATEGORY_ORDER = ['stock', 'bond', 'money', 'qdii', 'other'];
const CAT_LABEL = { stock: '股票', bond: '债券', money: '货币', qdii: 'QDII', other: '其他' };

export function polar(cx, cy, r, deg) {
  const a = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
export function describeArc(cx, cy, r, start, end) {
  const [sx, sy] = polar(cx, cy, r, end);
  const [ex, ey] = polar(cx, cy, r, start);
  const large = end - start <= 180 ? 0 : 1;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 0 ${ex} ${ey}`;
}
export function buildSegments(byCat, total) {
  const segs = [];
  let cursor = 0;
  for (const cat of CATEGORY_ORDER) {
    const val = byCat[cat] || 0;
    if (val <= 0) continue;
    const sweep = total > 0 ? (val / total) * 360 : 0;
    segs.push({ cat, value: val, start: cursor, sweep });
    cursor += sweep;
  }
  return segs;
}

export function FundAllocationDonut() {
  const { byCategory, total } = categoryAllocation.value;
  // 阶段 D (蓝图 §3.4 / §D-2): 直接调用 computeConcentration (纯函数单一来源),
  // 由 rowsWithMetrics 的 marketValue 计算前三大 / 最大权重 / HHI, warn 时整区转警示色.
  const risk = computeConcentration(rowsWithMetrics.value);
  const segs = buildSegments(byCategory, total);
  // 2026-07-15: legend 按占比从大到小排, 最大占比项高亮
  //   ponytail: 不动 svg 路径顺序 (角度顺序仍按 CATEGORY_ORDER, 保证视觉与原图一致),
  //             只在 legend 列表里排序并标 top
  const legendEntries = CATEGORY_ORDER
    .map((cat) => ({
      cat,
      value: byCategory[cat] || 0,
      pct: total > 0 ? ((byCategory[cat] || 0) / total) * 100 : 0,
    }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);
  const topCat = legendEntries.length > 0 ? legendEntries[0].cat : null;
  // 2026-07-15: hover 高亮 — 鼠标移到某根扇区/legend 项, 突出该 cat, 其他半透明
  //   ponytail: useState 而非 signal (本组件局部状态, 不跨组件共享)
  const [hoverCat, setHoverCat] = useState(null);
  const dim = (cat) => hoverCat && hoverCat !== cat ? 'fund-donut-dim' : '';
  return (
    <div class="fund-donut" role="img" aria-label={`配置占比 donut, 总市值 ${total}`}>
      <svg viewBox="0 0 100 100" class="fund-donut-svg" aria-hidden="true">
        {segs.map((s) => {
          // 单分类占满 360° 时退化为整圆, 否则画 arc
          if (s.sweep >= 359.9) {
            return (
              <circle
                key={s.cat}
                cx="50" cy="50" r="40"
                fill="none"
                stroke={`var(--cat-${s.cat})`}
                stroke-width={hoverCat === s.cat ? 19 : 16}
                class={dim(s.cat)}
                onMouseEnter={() => setHoverCat(s.cat)}
                onMouseLeave={() => setHoverCat(null)}
                onFocus={() => setHoverCat(s.cat)}
                onBlur={() => setHoverCat(null)}
                tabIndex={0}
                role="button"
                aria-label={`${CAT_LABEL[s.cat]} 占比 ${((s.value / total) * 100).toFixed(1)}%`}
              />
            );
          }
          return (
            <path
              key={s.cat}
              d={describeArc(50, 50, 40, s.start, s.start + s.sweep)}
              fill="none"
              stroke={`var(--cat-${s.cat})`}
              stroke-width={hoverCat === s.cat ? 19 : 16}
              class={dim(s.cat)}
              onMouseEnter={() => setHoverCat(s.cat)}
              onMouseLeave={() => setHoverCat(null)}
              onFocus={() => setHoverCat(s.cat)}
              onBlur={() => setHoverCat(null)}
              tabIndex={0}
              role="button"
              aria-label={`${CAT_LABEL[s.cat]} 占比 ${((s.value / total) * 100).toFixed(1)}%`}
            />
          );
        })}
      </svg>
      <ul class="fund-donut-legend" aria-label="分类占比从高到低">
        {legendEntries.map((e) => (
          <li
            key={e.cat}
            class={`${e.cat === topCat ? "fund-donut-legend-top" : ""} ${dim(e.cat)}`}
            title={`${CAT_LABEL[e.cat]} · 占比 ${e.pct.toFixed(1)}%`}
            onMouseEnter={() => setHoverCat(e.cat)}
            onMouseLeave={() => setHoverCat(null)}
          >
            <span class="fund-donut-dot" style={`background:var(--cat-${e.cat})`} />
            <span class="fund-donut-label-text">{CAT_LABEL[e.cat]}</span>
            <span class="fund-donut-label-pct">{e.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
      <div
        class={`fund-donut-risk${risk.warn ? ' fund-donut-risk-warn negative' : ''}`}
        role="status"
        aria-live="polite"
      >
        <span class="fund-donut-risk-item">前三大 {risk.top3Pct}%</span>
        <span class="fund-donut-risk-sep">·</span>
        <span class="fund-donut-risk-item">最大 {risk.maxWeight}%</span>
        <span class="fund-donut-risk-sep">·</span>
        <span class="fund-donut-risk-item">HHI {risk.hhi}</span>
      </div>
    </div>
  );
}
export default FundAllocationDonut;
