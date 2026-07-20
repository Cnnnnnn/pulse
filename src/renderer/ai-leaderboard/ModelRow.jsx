/**
 * src/renderer/ai-leaderboard/ModelRow.jsx
 *
 * 表格单行：排名 / 模型 / 厂商 / 主维度分 / 智能 / 代码 / 数学 / 速度 / $/1M。
 * 主维度分随 dimension 高亮（与 LeaderboardTable 的 SECONDARY_ACTIVE 同源）。
 * 纯展示 + 纯函数格式化，无网络出口。
 */

import { VENDOR_META, CATEGORY_META } from "./types.js";
import {
  primaryValue,
  formatPrimary,
  fmtIndex,
  fmtSpeed,
  fmtPricePer1M,
} from "./format.js";

// 维度 → 需高亮的次要列（与 LeaderboardTable.SECONDARY_ACTIVE 保持一致）
// v2.83: math → agentic (实际有数据)
const SECONDARY = {
  intelligence: "intelligence",
  coding: "coding",
  agentic: "agentic",
};

export function ModelRow({ model, rank, dimension, category }) {
  const m = model || {};
  const aa = m.aa || {};
  const vendorLabel =
    (VENDOR_META[m.vendor] && VENDOR_META[m.vendor].label) || m.vendor || "—";

  const primary = primaryValue(m, dimension, category);
  const primaryText = formatPrimary(primary, dimension);
  const sec = SECONDARY[dimension];

  return (
    <tr class="ai-lb-row">
      <td class="ai-lb-td ai-lb-col-rank" scope="row">
        {rank}
      </td>
      <td class="ai-lb-td ai-lb-col-model">
        <span class="ai-lb-model-name">{m.name || "—"}</span>
        {m.isSample && (
          <span class="ai-lb-tag ai-lb-tag--sample" title="示例数据（离线快照）">
            示例
          </span>
        )}
      </td>
      <td class="ai-lb-td ai-lb-col-vendor">
        <span class="ai-lb-vendor">{vendorLabel}</span>
      </td>
      <td class="ai-lb-td ai-lb-col-num ai-lb-col--active">{primaryText}</td>
      <td
        class={`ai-lb-td ai-lb-col-num${sec === "intelligence" ? " ai-lb-col--active" : ""}`}
      >
        {fmtIndex(aa.intelligenceIndex)}
      </td>
      <td
        class={`ai-lb-td ai-lb-col-num${sec === "coding" ? " ai-lb-col--active" : ""}`}
      >
        {fmtIndex(aa.codingIndex)}
      </td>
      <td
        class={`ai-lb-td ai-lb-col-num${sec === "agentic" ? " ai-lb-col--active" : ""}`}
      >
        {fmtIndex(aa.agenticIndex)}
      </td>
      <td class="ai-lb-td ai-lb-col-num">{fmtSpeed(aa.outputTokensPerSec)}</td>
      <td class="ai-lb-td ai-lb-col-num">{fmtPricePer1M(aa.priceOutputPer1M)}</td>
    </tr>
  );
}

export default ModelRow;
