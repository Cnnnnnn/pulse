/**
 * src/renderer/ai-leaderboard/ModelRow.jsx
 *
 * v3.0 双视角行渲染：
 *  - Arena 视角：排名 / 模型 / 厂商 / ELO / 置信区间
 *  - AA 视角：排名 / 模型 / 厂商 / 智能 / 代码 / Agent / 速度 / 输出价
 */

import { VENDOR_META, ARENA_BOARDS } from "./types.js";
import { fmtScore, fmtIndex, fmtSpeed, fmtPricePer1M, fmtValueRatio } from "./format.js";
import { compareList, toggleCompare } from "./aiLeaderboardStore.js";

export function ModelRow({ model, rank, view, board, dim }) {
  const m = model || {};
  const aa = m.aa || {};
  const vendorLabel =
    (VENDOR_META[m.vendor] && VENDOR_META[m.vendor].label) || m.vendor || "—";

  const inCompare = compareList.value.includes(m.id);
  const compareDisabled = !inCompare && compareList.value.length >= 3;
  const checkboxCell = (
    <td class="ai-lb-td ai-lb-col-check">
      <input
        type="checkbox"
        class="ai-lb-check"
        checked={inCompare}
        disabled={compareDisabled}
        aria-label={`对比 ${m.name}`}
        onChange={() => toggleCompare(m.id)}
      />
    </td>
  );

  if (view === "arena") {
    const boardMeta = ARENA_BOARDS[board] || ARENA_BOARDS.text;
    const arenaSlice = m.arena && m.arena[boardMeta.key];
    const elo = arenaSlice && typeof arenaSlice.score === "number" ? arenaSlice.score : null;
    const ci = arenaSlice && arenaSlice.ci != null ? arenaSlice.ci : null;

    // 排名变动标记
    let deltaEl = null;
    if (m.isNew) {
      deltaEl = <span class="ai-lb-delta ai-lb-delta--new">NEW</span>;
    } else if (typeof m.rankDelta === "number" && m.rankDelta !== 0) {
      const up = m.rankDelta > 0;
      deltaEl = (
        <span class={`ai-lb-delta ${up ? "ai-lb-delta--up" : "ai-lb-delta--down"}`}>
          {up ? "↑" : "↓"}{Math.abs(m.rankDelta)}
        </span>
      );
    }

    return (
      <tr class="ai-lb-row">
        {checkboxCell}
        <td class="ai-lb-td ai-lb-col-rank" scope="row">
          {rank}
          {deltaEl}
        </td>
        <td class="ai-lb-td ai-lb-col-model">
          <span class="ai-lb-model-name">{m.name || "—"}</span>
          {m.isSample && (
            <span class="ai-lb-tag ai-lb-tag--sample" title="示例数据（离线快照）">示例</span>
          )}
        </td>
        <td class="ai-lb-td ai-lb-col-vendor">
          <span class="ai-lb-vendor">{vendorLabel}</span>
        </td>
        <td class="ai-lb-td ai-lb-col-num">{fmtScore(elo)}</td>
        <td class="ai-lb-td ai-lb-col-num">
          {ci != null ? `±${Math.round(ci)}` : "—"}
        </td>
      </tr>
    );
  }

  // AA 视角
  return (
    <tr class="ai-lb-row">
      {checkboxCell}
      <td class="ai-lb-td ai-lb-col-rank" scope="row">{rank}</td>
      <td class="ai-lb-td ai-lb-col-model">
        <span class="ai-lb-model-name">{m.name || "—"}</span>
        {m.isSample && (
          <span class="ai-lb-tag ai-lb-tag--sample" title="示例数据（离线快照）">示例</span>
        )}
      </td>
      <td class="ai-lb-td ai-lb-col-vendor">
        <span class="ai-lb-vendor">{vendorLabel}</span>
      </td>
      <td class={`ai-lb-td ai-lb-col-num${dim === "intelligence" ? " ai-lb-col--active" : ""}`}>
        {fmtIndex(aa.intelligenceIndex)}
      </td>
      <td class={`ai-lb-td ai-lb-col-num${dim === "coding" ? " ai-lb-col--active" : ""}`}>
        {fmtIndex(aa.codingIndex)}
      </td>
      <td class={`ai-lb-td ai-lb-col-num${dim === "agentic" ? " ai-lb-col--active" : ""}`}>
        {fmtIndex(aa.agenticIndex)}
      </td>
      <td class={`ai-lb-td ai-lb-col-num${dim === "speed" ? " ai-lb-col--active" : ""}`}>
        {fmtSpeed(aa.outputTokensPerSec)}
      </td>
      <td class={`ai-lb-td ai-lb-col-num${dim === "price" ? " ai-lb-col--active" : ""}`}>
        {fmtPricePer1M(aa.priceOutputPer1M)}
      </td>
      <td class="ai-lb-td ai-lb-col-num">{fmtValueRatio(aa)}</td>
    </tr>
  );
}

export default ModelRow;
