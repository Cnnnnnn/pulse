// @deprecated since v2.50 — v2.49 错位 (Overview 不用). 保留供 Insights 页后续复用. 不要在 OverviewPage 引用.
/**
 * src/renderer/components/TrendSparkline.jsx
 *
 * ponytail: 纯函数 SVG 路径生成, 不引 chart 库. 7 个点 → 直线折线 (M…L…),
 *          不上 bezier 平滑, 7 点肉眼分不出差别, 减少代码.
 *          ceiling: 若点数 > 50 或需要平滑曲线, 升级到 d3-shape.
 */
export function TrendSparkline({ data, width = 200, height = 40 }) {
  if (!data || data.length === 0) return <svg width={width} height={height} />;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = width / Math.max(1, data.length - 1);

  const points = data.map((v, i) => [
    i * stepX,
    height - ((v - min) / range) * height,
  ]);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export default TrendSparkline;