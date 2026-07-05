/**
 * VerdictCard — AI 解读卡 (左列, 用户手动触发).
 * 数据/评分自动加载; AI 解读需用户点「生成」按钮 (不自动触发, 省 token + 用户可控).
 */
import { requestAiSummary } from "../diagnosisStore.js";

export function VerdictCard({ scores, aiResult, aiStatus, api, code }) {
  return (
    <div class="verdict-card">
      <div class="verdict-title">🤖 AI 解读</div>
      {aiStatus === "idle" && (
        <button type="button" class="verdict-generate-btn" onClick={() => requestAiSummary(api, code)}>
          生成 AI 解读
        </button>
      )}
      {aiStatus === "loading" && <div class="verdict-summary verdict-loading-text">AI 解读生成中…</div>}
      {aiStatus === "ready" && <div class="verdict-summary">{aiResult?.summary || "暂无解读"}</div>}
      {aiStatus === "error" && (
        <div class="verdict-summary">
          解读生成失败
          <button type="button" class="verdict-retry" onClick={() => requestAiSummary(api, code)}>重试</button>
        </div>
      )}
    </div>
  );
}

export default VerdictCard;
