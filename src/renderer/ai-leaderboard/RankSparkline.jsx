/**
 * src/renderer/ai-leaderboard/RankSparkline.jsx
 *
 * 排名趋势迷你折线（纯展示，无副作用）。
 * series: [{ date, rank }]，时间升序；rank 越低越好（排名越靠前）。
 * 末位较首位上升/持平时绘绿色，下降绘红色。
 */

/**
 * @param {{series?: Array<{date:string, rank:number}>, width?: number, height?: number, title?: string}} props
 */
export function RankSparkline({ series, width = 56, height = 16, title }) {
  if (!Array.isArray(series) || series.length < 2) return null;
  const ranks = series
    .map((s) => Number(s && s.rank))
    .filter((r) => Number.isFinite(r) && r > 0);
  if (ranks.length < 2) return null;

  const maxR = Math.max(...ranks);
  const minR = Math.min(...ranks);
  const span = Math.max(1, maxR - minR);
  const n = ranks.length;
  const pad = 1.5;

  const pts = ranks
    .map((r, i) => {
      const x = n === 1 ? width / 2 : pad + (i / (n - 1)) * (width - pad * 2);
      // rank 低（好）= 画在上（y 小）
      const y = pad + (1 - (r - minR) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const improving = ranks[n - 1] <= ranks[0];
  const stroke = improving
    ? "oklch(55% 0.18 150)" // 绿：上升/持平
    : "oklch(55% 0.2 25)"; // 红：下降

  const label =
    title || `近 ${n} 次排名趋势：${ranks[0]} → ${ranks[n - 1]}`;

  return (
    <svg
      class="ai-lb-spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        stroke-width="1.5"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
  );
}

export default RankSparkline;
