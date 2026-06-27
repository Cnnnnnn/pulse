/**
 * src/renderer/components/AIInsightsBlock.jsx
 *
 * AI 摘要状态机 — idle/loading/ready/error. error 时 "重试" 按钮
 * 调用 api.versionsOverviewAiInsights (带 guard 防 IPC 未注册).
 */
import { aiInsights } from "../overview-store.js";
import { api } from "../api.js";
import { IconSparkles } from "./icons.jsx";

export function AIInsightsBlock() {
  const state = aiInsights.value;
  return (
    <div class="ai-insights">
      <h3 class="ai-insights-title">
        <IconSparkles size={14} /> AI 摘要
      </h3>
      {state.status === "loading" && (
        <div class="ai-insights-loading">AI 分析中...</div>
      )}
      {state.status === "ready" && (
        <div class="ai-insights-text">
          {state.fromCache && <span class="ai-insights-cache">缓存</span>}
          {state.text}
        </div>
      )}
      {state.status === "error" && (
        <div class="ai-insights-error">
          AI 暂不可用
          <button type="button" onClick={() => api.versionsOverviewAiInsights && api.versionsOverviewAiInsights()}>
            重试
          </button>
        </div>
      )}
      {state.status === "idle" && (
        <div class="ai-insights-idle">—</div>
      )}
    </div>
  );
}

export default AIInsightsBlock;