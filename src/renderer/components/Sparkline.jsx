/**
 * src/renderer/components/Sparkline.jsx
 *
 * 纯 SVG 迷你折线图. 接受 closes 数组, 画 polyline + 起点/终点 circle.
 * 颜色按 closes[0] vs closes[n-1] 涨/跌/平 三态.
 *
 * ponytail: 不引图表库. 30 点以内 polyline 性能可忽略.
 *          不做 hover/tooltip/animation/平滑曲线 — sparkline 的价值是一眼.
 */
export function Sparkline({
  closes,
  width = 100,
  height = 30,
  upColor = "#34c759",
  downColor = "#ff3b30",
  flatColor = "#8e8e93",
}) {
  if (!Array.isArray(closes) || closes.length === 0) return null;

  // 单点 → 1 个 circle, 无 polyline
  if (closes.length === 1) {
    const cy = height / 2;
    return (
      <svg
        class="stock-sparkline"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label="价格走势迷你图"
      >
        <circle cx={width / 2} cy={cy} r={1.5} fill={flatColor} />
      </svg>
    );
  }

  const values = closes.map((v) => Number(v));
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length < 2) return null;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const yPad = 2;
  const yH = height - yPad * 2;

  // X 等分: 用 valid 的索引重映射, NaN 不会画到 SVG 上.
  const points = valid
    .map((v, i) => {
      const x = (i / (valid.length - 1)) * width;
      const y = yPad + yH - ((v - min) / range) * yH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const first = valid[0];
  const last = valid[valid.length - 1];
  const stroke = last > first ? upColor : last < first ? downColor : flatColor;

  return (
    <svg
      class="stock-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="价格走势迷你图"
    >
      <polyline points={points} stroke={stroke} stroke-width="1.5" fill="none" />
      <circle cx={0} cy={yPad + yH - ((first - min) / range) * yH} r={1.5} fill={stroke} />
      <circle
        cx={width}
        cy={yPad + yH - ((last - min) / range) * yH}
        r={1.5}
        fill={stroke}
      />
    </svg>
  );
}

export default Sparkline;
