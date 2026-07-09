/**
 * src/renderer/components/SparklineArea.jsx
 *
 * 折线 + 面积填充 + 终点圆点. 复用 Sparkline.jsx 的 SVG 习惯
 * (NaN 过滤, viewBox, padding).
 *
 * ponytail: 不引图表库. 30 点以内 path 性能可忽略.
 *          ceiling: 上 50 点仍 OK, 超 1000 改 canvas.
 */
// P5: 默认颜色走 CSS 变量, 三主题感知一致.
export function SparklineArea({
  closes,
  width = 280,
  height = 80,
  upColor = "var(--accent-green)",
  downColor = "var(--accent-red)",
  flatColor = "var(--accent-gray)",
  showEndpoints = true,
}) {
  if (!Array.isArray(closes) || closes.length < 2) return null;

  const values = closes.map((v) => Number(v));
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length < 2) return null;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const yPad = 4;
  const yH = height - yPad * 2;

  const points = valid.map((v, i) => {
    const x = (i / (valid.length - 1)) * width;
    const y = yPad + yH - ((v - min) / range) * yH;
    return { x, y };
  });

  const first = valid[0];
  const last = valid[valid.length - 1];
  const colorKey = last > first ? "up" : last < first ? "down" : "flat";
  const stroke = colorKey === "up" ? upColor : colorKey === "down" ? downColor : flatColor;

  const baseY = height;
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
  const closedPath = `${linePath} L${points[points.length - 1].x.toFixed(2)},${baseY} L${points[0].x.toFixed(2)},${baseY} Z`;

  const gradId = `sa-grad-${colorKey}`;

  return (
    <svg
      class="stock-sparkline stock-sparkline-area"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="价格走势面积图"
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color={stroke} stop-opacity="0.35" />
          <stop offset="100%" stop-color={stroke} stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d={closedPath} fill={`url(#${gradId})`} stroke="none" />
      <path d={linePath} fill="none" stroke={stroke} stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
      {showEndpoints && (
        <>
          <circle cx={points[0].x} cy={points[0].y} r="2" fill={stroke} />
          <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill={stroke} />
        </>
      )}
    </svg>
  );
}

export default SparklineArea;
