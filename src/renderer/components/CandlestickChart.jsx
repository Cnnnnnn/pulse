import { maSeries, macdSeries } from "../stocks/indicators.js";

// ponytail: 颜色全交给 CSS (--stock-up / --stock-down / --stock-axis), 组件只挂 class.
const MA_PERIODS = [5, 10, 20];

function priceExtent(klines) {
  let min = Infinity, max = -Infinity;
  for (const k of klines) {
    if (k.low < min) min = k.low;
    if (k.high > max) max = k.high;
  }
  const pad = (max - min) * 0.05 || 1;
  return { min: min - pad, max: max + pad };
}

function volumeExtent(klines) {
  let max = 0;
  for (const k of klines) if (k.volume > max) max = k.volume;
  return { min: 0, max: max * 1.1 || 1 };
}

function macdExtent({ dif, dea, hist }) {
  let min = Infinity, max = -Infinity;
  for (const arr of [dif, dea, hist]) {
    for (const v of arr) {
      if (v == null || Number.isNaN(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!isFinite(min) || !isFinite(max)) return { min: -1, max: 1 };
  const pad = (max - min) * 0.1 || 0.1;
  return { min: min - pad, max: max + pad };
}

export function CandlestickChart({
  klines = [],
  closes = [],
  width = 680,
  showMacd = true,
}) {
  const height = showMacd ? 360 : 300;
  const padding = { top: 10, right: 50, bottom: 20, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const klineH = showMacd ? 200 : 240;
  const volH = 40;
  const macdH = showMacd ? 80 : 0;
  const klineTop = padding.top;
  const volTop = klineTop + klineH + 10;
  const macdTop = volTop + volH + 10;

  if (!klines.length) {
    return (
      <svg width={width} height={height} role="img" aria-label="无 K 线数据">
        <title>无 K 线数据</title>
        <text x={width / 2} y={height / 2} text-anchor="middle" className="stock-candle-empty">
          暂无 K 线数据
        </text>
      </svg>
    );
  }

  const n = klines.length;
  const slot = chartWidth / n;
  const candleW = Math.max(2, slot * 0.6);
  const xAt = (i) => padding.left + slot * i + slot / 2;
  const { min: yMin, max: yMax } = priceExtent(klines);
  const yAt = (v) => klineTop + (1 - (v - yMin) / (yMax - yMin)) * klineH;
  const { max: volMax } = volumeExtent(klines);
  const volYAt = (v) => volTop + volH - (v / volMax) * volH;

  const maLines = MA_PERIODS.map((period) => {
    const series = maSeries(closes, period);
    const points = series
      .map((v, i) => (v == null ? null : `${xAt(i)},${yAt(v)}`))
      .filter(Boolean)
      .join(" ");
    return { period, points };
  });

  // ponytail: volume 红涨绿跌 — 同蜡烛色, 不引入新色变量.
  const volumeBars = klines.map((k, i) => {
    const up = k.close >= k.open;
    const x = xAt(i) - candleW / 2;
    const y = volYAt(k.volume);
    const h = Math.max(1, volTop + volH - y);
    return { x, y, h, up, key: i };
  });

  let macdBlock = null;
  if (showMacd) {
    const macd = macdSeries(closes);
    const { min: mMin, max: mMax } = macdExtent(macd);
    const zeroY = macdTop + (1 - (0 - mMin) / (mMax - mMin)) * macdH;
    const yM = (v) => macdTop + (1 - (v - mMin) / (mMax - mMin)) * macdH;
    macdBlock = (
      <g className="stock-candle-macd">
        <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} className="stock-candle-macd-zero" />
        {macd.hist.map((v, i) => {
          if (v == null) return null;
          const up = v >= 0;
          const x = xAt(i) - candleW / 2;
          const y = Math.min(yM(v), zeroY);
          const h = Math.max(1, Math.abs(yM(v) - zeroY));
          return <rect key={`hist-${i}`} x={x} y={y} width={candleW} height={h} className={`stock-candle-macd-hist ${up ? "stock-candle-macd-up" : "stock-candle-macd-down"}`} />;
        })}
        {(() => {
          const difPath = macd.dif.map((v, i) => v != null ? `${xAt(i)},${yM(v)}` : "").filter(Boolean).join(" ");
          const deaPath = macd.dea.map((v, i) => v != null ? `${xAt(i)},${yM(v)}` : "").filter(Boolean).join(" ");
          return (
            <>
              <polyline points={difPath} className="stock-candle-macd-dif" />
              <polyline points={deaPath} className="stock-candle-macd-dea" />
            </>
          );
        })()}
      </g>
    );
  }

  return (
    <svg width={width} height={height} role="img" aria-label="K 线图含 MA 与成交量, 可选 MACD">
      <title>股票 K 线图</title>
      <desc>展示最近 {n} 个交易日的开高低收价格, 叠加 MA5/10/20 均线, 成交额柱与 MACD 指标.</desc>
      <g className="stock-candle-klines">
        {klines.map((k, i) => {
          const up = k.close >= k.open;
          const x = xAt(i) - candleW / 2;
          const yOpen = yAt(k.open);
          const yClose = yAt(k.close);
          const yHigh = yAt(k.high);
          const yLow = yAt(k.low);
          const bodyY = Math.min(yOpen, yClose);
          const bodyH = Math.max(1, Math.abs(yClose - yOpen));
          return (
            <g key={`k-${i}`} className="stock-candle-group">
              <line x1={xAt(i)} x2={xAt(i)} y1={yHigh} y2={yLow} className={`stock-candle-wick ${up ? "stock-candle-up" : "stock-candle-down"}`} />
              <rect x={x} y={bodyY} width={candleW} height={bodyH} className={`stock-candle ${up ? "stock-candle-up" : "stock-candle-down"}`} />
            </g>
          );
        })}
      </g>
      <g className="stock-candle-ma-lines">
        {maLines.map((m) => (
          <polyline key={`ma-${m.period}`} points={m.points} className={`stock-candle-ma stock-candle-ma-${m.period}`} />
        ))}
      </g>
      <g className="stock-candle-volume">
        {volumeBars.map((b) => (
          <rect key={`vol-${b.key}`} x={b.x} y={b.y} width={candleW} height={b.h} className={`stock-candle-volume ${b.up ? "stock-candle-volume-up" : "stock-candle-volume-down"}`} />
        ))}
      </g>
      {macdBlock}
    </svg>
  );
}

export default CandlestickChart;
