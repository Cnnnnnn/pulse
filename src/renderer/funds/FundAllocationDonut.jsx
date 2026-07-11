import { categoryAllocation } from './fundStore.js';

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
  const segs = buildSegments(byCategory, total);
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
                stroke-width="16"
              />
            );
          }
          return (
            <path
              key={s.cat}
              d={describeArc(50, 50, 40, s.start, s.start + s.sweep)}
              fill="none"
              stroke={`var(--cat-${s.cat})`}
              stroke-width="16"
            />
          );
        })}
      </svg>
      <ul class="fund-donut-legend">
        {CATEGORY_ORDER.map((cat) => {
          const v = byCategory[cat] || 0;
          const pct = total > 0 ? (v / total) * 100 : 0;
          if (v <= 0) return null;
          return (
            <li key={cat}>
              <span class="fund-donut-dot" style={`background:var(--cat-${cat})`} />
              {CAT_LABEL[cat]} {pct.toFixed(1)}%
            </li>
          );
        })}
      </ul>
    </div>
  );
}
export default FundAllocationDonut;
