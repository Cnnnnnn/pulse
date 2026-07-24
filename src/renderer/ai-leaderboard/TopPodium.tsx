/**
 * Top 3 迷你领奖台（对齐 redesign 预览 / UX §2.2 头部高亮区）
 */
import {
  activeView,
  activeBoard,
  activeDim,
  activeLB,
  sortKey,
  columnValue,
} from "./aiLeaderboardStore.js";
import { ARENA_BOARDS, SORT_COLUMN_LABELS, VENDOR_META } from "./types.js";
import {
  fmtScore,
  fmtIndex,
  fmtSpeed,
  fmtPricePer1M,
  fmtLivebench,
  fmtLbCost,
} from "./format.js";

function primaryKeyFor(view) {
  if (sortKey.value) return sortKey.value;
  if (view === "arena") return "elo";
  if (view === "livebench") return activeLB.value;
  return activeDim.value;
}

function formatMetric(view, key, model) {
  const val = columnValue(model, view, key);
  if (val == null || !Number.isFinite(Number(val))) return "—";
  if (key === "elo") return fmtScore(val);
  if (key === "ci") return `±${Math.round(val)}`;
  if (key === "lb_cost") return fmtLbCost(val);
  if (typeof key === "string" && key.startsWith("lb_")) return fmtLivebench(val);
  if (key === "speed") return fmtSpeed(val);
  if (key === "price") return fmtPricePer1M(val);
  if (key === "valueRatio") return Number(val).toFixed(1);
  return fmtIndex(val);
}

export function TopPodium({ rows, view: viewProp }) {
  const view = viewProp || activeView.value;
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return null;

  const pKey = primaryKeyFor(view);
  const metricLabel = SORT_COLUMN_LABELS[pKey] || pKey;
  const top3 = list.slice(0, 3);
  const slots =
    top3.length >= 3
      ? [
          { rank: 2, model: top3[1], place: "second" },
          { rank: 1, model: top3[0], place: "first" },
          { rank: 3, model: top3[2], place: "third" },
        ]
      : top3.map((model, i) => ({
          rank: i + 1,
          model,
          place: i === 0 ? "first" : "other",
        }));

  return (
    <section class="ai-lb-podium" aria-label="前三名">
      <div class="ai-lb-podium__row">
        {slots.map(({ rank, model, place }) => {
          const m = model || {};
          const vendor =
            (VENDOR_META[m.vendor] && VENDOR_META[m.vendor].label) || m.vendor || "—";
          const boardMeta = ARENA_BOARDS[activeBoard.value] || ARENA_BOARDS.text;
          const boardHint = view === "arena" ? boardMeta.label : null;
          return (
            <article
              key={m.id || rank}
              class={`ai-lb-podium__card ai-lb-podium__card--${place}${m.isSample ? " is-sample" : ""}`}
            >
              <span class={`ai-lb-medal g${rank}`} aria-hidden="true">
                {rank}
              </span>
              <h3 class="ai-lb-podium__name">{m.name || "—"}</h3>
              <p class="ai-lb-podium__vendor">{vendor}</p>
              {boardHint && <p class="ai-lb-podium__meta">{boardHint}</p>}
              <p class="ai-lb-podium__metric-label">{metricLabel}</p>
              <p class="ai-lb-podium__metric-value">{formatMetric(view, pKey, m)}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default TopPodium;
