/**
 * src/renderer/funds/FundSparkline.jsx
 *
 * 2026-07-14 计划 §2 — KPI 卡里用的小型 sparkline.
 * 与 FundCardSparkline 同源 (viewBox + vector-effect=non-scaling-stroke),
 * 但接受任意 values 数组 (而不是从 navHistoryCache 拉).
 *
 * ponytail: FundCardSparkline 仍保留 (跟 FundCardGrid 耦合), 这里只是
 *   给 FundDashboard KPI 卡用, 不复用以免一个组件两套 props.
 */

function buildPoints(values, w, h, pad) {
  if (!values || values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * (w - pad * 2),
    y: h - pad - ((v - min) / span) * (h - pad * 2),
  }));
}

export function FundSparkline({ values, width = 120, height = 32, emptyHint = "—" }) {
  const v = Array.isArray(values) ? values.filter(Number.isFinite) : [];
  if (v.length < 2) {
    // 2026-07-14: 缺数据时给个 "—" 占位 — 之前返回空 div, 用户不知道是 bug 还是真的没数据
    return (
      <div
        class="fund-kpi-spark fund-kpi-spark-empty"
        role="img"
        aria-label="净值数据加载中"
        title="净值数据加载中"
      >
        <span class="fund-kpi-spark-empty-text">{emptyHint}</span>
      </div>
    );
  }
  const pts = buildPoints(v, width, height, 2);
  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const up = v[v.length - 1] >= v[0];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      class="fund-kpi-spark"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke={up ? "var(--color-up)" : "var(--color-down)"}
        stroke-width="1.5"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  );
}

export default FundSparkline;