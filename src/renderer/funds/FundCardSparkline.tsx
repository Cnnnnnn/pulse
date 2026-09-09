import { useEffect, useState } from 'preact/hooks';
import { navHistoryCache, loadFundNavHistory } from './fundStore.ts';
import { api } from '../api.ts';

export function buildSparklinePoints(values: number[], w = 100, h = 24, pad = 2) {
  if (!values.length) return [];
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v: number, i: number) => ({
    x: pad + (i / (values.length - 1 || 1)) * (w - pad * 2),
    y: h - pad - ((v - min) / span) * (h - pad * 2),
  }));
}

type NavSeries = { nav: number };
type NavHistoryCacheShape = Record<string, { series: NavSeries[] }>;

export function FundCardSparkline({ code }: { code: string }) {
  const [status, setStatus] = useState('idle'); // idle | loading | ok | error

  useEffect(() => {
    let alive = true;
    async function load() {
      setStatus('loading');
      const r = await loadFundNavHistory(api, code);
      if (alive) setStatus(r && r.ok ? 'ok' : 'error');
    }
    const cache = navHistoryCache.value as NavHistoryCacheShape;
    const c = cache[code];
    if (!c || !c.series || !c.series.length) {
      void load();
    } else {
      setStatus('ok');
    }
    return () => {
      alive = false;
    };
  }, [code]);

  const cache = navHistoryCache.value as NavHistoryCacheShape;
  const series = (cache[code] && cache[code].series) || [];

  if (status === 'error') {
    return (
      <button
        type="button"
        class="fund-card-spark-retry"
        onClick={() => {
          void loadFundNavHistory(api, code).then((r) =>
            setStatus(r && r.ok ? 'ok' : 'error'),
          );
        }}
        aria-label="重新加载净值走势"
      >
        ↻
      </button>
    );
  }
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

