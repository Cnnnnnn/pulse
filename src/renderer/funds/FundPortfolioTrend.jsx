import { dailySnapshots } from './fundStore.js';

export function recentTotals(snaps, days = 30) {
  const arr = Array.isArray(snaps) ? snaps : [];
  const sorted = [...arr].sort((a, b) => (a.date < b.date ? -1 : 1));
  return sorted.slice(-days).map((s) => ({ date: s.date, value: s.totalMarketValue || 0 }));
}
export function buildLinePath(pts) {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}
export function buildAreaPath(pts, h) {
  if (!pts.length) return '';
  const first = pts[0], last = pts[pts.length - 1];
  return `${buildLinePath(pts)} L ${last.x} ${h} L ${first.x} ${h} Z`;
}

export function FundPortfolioTrend() {
  const snaps = recentTotals(dailySnapshots.value, 30);
  if (!snaps.length) return <div class="fund-trend fund-trend--empty">净值刷新后展示近 30 天走势</div>;
  const W = 300, H = 90, PAD = 6;
  const vals = snaps.map((s) => s.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const pts = snaps.map((s, i) => ({
    x: PAD + (i / (snaps.length - 1 || 1)) * (W - PAD * 2),
    y: H - PAD - ((s.value - min) / span) * (H - PAD * 2),
  }));
  return (
    <div class="fund-trend" role="img" aria-label={`近30天组合净值走势, 从 ${min} 到 ${max}`}>
      <svg viewBox={`0 0 ${W} ${H}`} class="fund-trend-svg" preserveAspectRatio="none" aria-hidden="true">
        <path d={buildAreaPath(pts, H)} fill="var(--fund-trend-area)" />
        <path d={buildLinePath(pts)} fill="none" stroke="var(--fund-trend)" stroke-width="2" vector-effect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
export default FundPortfolioTrend;
