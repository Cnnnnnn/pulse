/**
 * LastDiagnosisBadge — hero 区"上次诊断"徽标 + 跨次对比.
 *
 * ponytail: 2026-07-07 — 历史快照 (overall + 5 维 + 价格) 从 diagnosisHistory 读,
 * 跟当前 scores 比较. 首次诊断 → 不渲染 (零噪声). 变化量按方向着色 (绿/橙/灰).
 */
import { loadLastSnapshot } from "./diagnosisHistory.js";

const DIM_LABELS = {
  fundamental: "基本面",
  valuation: "估值",
  capital: "资金",
  tech: "技术",
  risk: "风险",
};
const DIM_ORDER = ["fundamental", "valuation", "capital", "tech", "risk"];

function formatRelative(ts, now) {
  const diff = now - ts;
  if (diff < 60 * 1000) return "刚刚";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 个月前`;
}

function fmtDelta(delta, digits = 1) {
  if (delta == null) return "—";
  const rounded = Math.round(delta * Math.pow(10, digits)) / Math.pow(10, digits);
  if (rounded === 0) return "0";
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function deltaTone(delta) {
  if (delta == null || delta === 0) return "neutral";
  return delta > 0 ? "up" : "down";
}

export function LastDiagnosisBadge({ code, currentScores, currentPrice }) {
  if (!code || !currentScores) return null;
  const prev = loadLastSnapshot(code);
  if (!prev) return null;
  const overallDelta =
    prev.overall != null && currentScores.overall != null
      ? currentScores.overall - prev.overall
      : null;
  const dims = (currentScores.dimensions) || {};
  const prevDims = prev.dimensions || {};
  const dimChanges = DIM_ORDER.map((k) => ({
    key: k,
    label: DIM_LABELS[k],
    current: dims[k],
    prev: prevDims[k],
    delta: dims[k] != null && prevDims[k] != null ? dims[k] - prevDims[k] : null,
  }));
  const priceDelta =
    currentPrice != null && prev.price != null ? currentPrice - prev.price : null;
  const pricePct =
    priceDelta != null && prev.price ? (priceDelta / prev.price) * 100 : null;
  return (
    <div class="last-dx-badge" data-testid="last-dx-badge">
      <div class="last-dx-head">
        <span class="last-dx-time">{formatRelative(prev.savedAt, Date.now())} 诊断过</span>
        {priceDelta != null && (
          <span class={`last-dx-price last-dx-tone-${deltaTone(priceDelta)}`}>
            ¥{prev.price?.toFixed(2)} → ¥{currentPrice?.toFixed(2)}
            {pricePct != null && ` (${pricePct > 0 ? "+" : ""}${pricePct.toFixed(2)}%)`}
          </span>
        )}
      </div>
      <div class="last-dx-row">
        <span class="last-dx-overall-label">综合分</span>
        <span class="last-dx-overall-prev">{prev.overall?.toFixed(1)}</span>
        <span class="last-dx-arrow">→</span>
        <span class="last-dx-overall-cur">{currentScores.overall?.toFixed(1)}</span>
        <span class={`last-dx-delta last-dx-tone-${deltaTone(overallDelta)}`}>
          {fmtDelta(overallDelta)}
        </span>
      </div>
      <div class="last-dx-dims">
        {dimChanges.map((d) => (
          <span key={d.key} class="last-dx-dim">
            <span class="last-dx-dim-label">{d.label}</span>
            <span class={`last-dx-dim-delta last-dx-tone-${deltaTone(d.delta)}`}>
              {d.prev != null && d.current != null ? fmtDelta(d.delta) : "—"}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default LastDiagnosisBadge;