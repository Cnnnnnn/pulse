import { useEffect } from 'preact/hooks';
import { navHistoryCache, loadFundNavHistory } from './fundStore.js';
import { api } from '../api.js';

export function buildSparklinePoints(values, w = 100, h = 24, pad = 2) {
  if (!values.length) return [];
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v, i) => ({
    x: pad + (i / (values.length - 1 || 1)) * (w - pad * 2),
    y: h - pad - ((v - min) / span) * (h - pad * 2),
  }));
}

export function FundCardSparkline({ code }) {
  useEffect(() => {
    const c = navHistoryCache.value[code];
    if (!c || !c.series || !c.series.length) void loadFundNavHistory(api, code);
  }, [code]);

  const series = (navHistoryCache.value[code] && navHistoryCache.value[code].series) || [];
  if (!series.length) return <div class="fund-card-spark fund-card-spark--empty" aria-hidden="true" />;
  const pts = buildSparklinePoints(series.map((s) => s.nav));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const up = series[series.length - 1].nav >= series[0].nav;
  return (
    <svg viewBox="0 0 100 24" class="fund-card-spark" preserveAspectRatio="none" aria-label={`近${series.length}天净值走势`} role="img">
      <path d={d} fill="none" stroke={up ? 'var(--color-up)' : 'var(--color-down)'} stroke-width="1.5" vector-effect="non-scaling-stroke" />
    </svg>
  );
}
export default FundCardSparkline;
