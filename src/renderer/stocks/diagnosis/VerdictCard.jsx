/**
 * VerdictCard — AI 解读卡 (诊断页底部一段).
 *
 * ponytail: 2026-07-07 重设 — 老版本只显示 summary 一段文字, 没用到 perAngle /
 * risks / signal 等结构化产出. 现在展示:
 *   - signal 标签 (positive / neutral / cautious)
 *   - summary 核心结论
 *   - highlights (1-2 条亮点)
 *   - blindspots (1-2 条盲点)
 *   - risks 折叠到 RiskCard (跟 ModuleGrid 的 RiskCard 复用)
 *
 * 2026-07-07 二次改进 — loading 加 elapsed 时间显示, error 透出后端 reason
 * (parse_failed / timeout / budget_exceeded / auth_*...), 给用户针对性重试线索.
 *
 * AI 解读仍用户手动触发.
 */
import { useEffect, useState } from "preact/hooks";
import { requestAiSummary } from "../diagnosisStore.js";
import { IconSparkles, IconWand, IconCheck, IconAlert } from "../../components/icons.jsx";

const SIGNAL_META = {
  positive: { label: "整体偏积极", tone: "positive" },
  neutral: { label: "中性观察", tone: "neutral" },
  cautious: { label: "整体偏谨慎", tone: "cautious" },
};

// ponytail: 把后端 reason 转成用户能看懂的提示 (不再笼统 "解读生成失败").
// 跟 AiAdviseDrawer 的 ERROR_REASON_TEXT 同样思路.
const REASON_TEXT = {
  budget_exceeded: "今日 token 预算已用完, 明天再试或去设置加预算",
  api_key_missing: "AI Key 缺失, 请去 AI 设置补充 Provider Key",
  config_missing: "AI 未配置, 请去 AI 设置配置 Provider",
  unsupported_provider: "当前 Provider 不支持, 请去 AI 设置切换",
  model_missing: "Model 未配置, 请去 AI 设置填写 model 名",
  auth_401: "API Key 无效 (401), 请检查 AI 设置",
  auth_403: "API Key 无权限 (403), 请检查 AI 设置",
  timeout: "AI 调用超时 (单次最长 120s), 网络或 Provider 慢所致",
  network: "网络异常, 已自动重试一次仍失败, 检查网络或稍后再试",
  parse_failed: "AI 返回格式异常, 已尝试重新生成仍失败, 可手动重试一次",
  llm_failed: "AI 调用失败, 可手动重试一次",
  build_prompt_failed: "Prompt 构建异常 (代码 bug)",
  internal_error: "IPC 调用异常, 可手动重试一次",
  unknown: "未知错误",
};

function formatReason(reason) {
  if (!reason) return REASON_TEXT.unknown;
  return REASON_TEXT[reason] || `${REASON_TEXT.unknown} (${reason})`;
}

function LoadingElapsed({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((now - since) / 1000));
  return <span class="verdict-loading-elapsed">已等待 {sec}s</span>;
}

export function VerdictCard({ scores, aiResult, aiStatus, errorReason, aiStartedAt, api, code }) {
  const meta = SIGNAL_META[aiResult?.signal] || SIGNAL_META.neutral;
  return (
    <div class="verdict-card">
      <div class="verdict-title">
        <IconSparkles size={14} /> AI 解读
      </div>

      {aiStatus === "idle" && (
        <button
          type="button"
          class="verdict-generate-btn"
          onClick={() => requestAiSummary(api, code)}
        >
          <IconWand size={14} /> 基于当前评分生成解读
        </button>
      )}

      {aiStatus === "loading" && (
        <div class="verdict-summary verdict-loading-text">
          AI 解读生成中…
          {aiStartedAt && <LoadingElapsed since={aiStartedAt} />}
        </div>
      )}

      {aiStatus === "error" && (
        <div class="verdict-error">
          <div class="verdict-error-msg">{formatReason(errorReason)}</div>
          <button
            type="button"
            class="verdict-retry"
            onClick={() => requestAiSummary(api, code)}
          >
            重试
          </button>
        </div>
      )}

      {aiStatus === "ready" && (
        <div class="verdict-body">
          {aiResult?.summary && (
            <div class={`verdict-summary verdict-summary-tone-${meta.tone}`}>
              <span class={`verdict-signal verdict-signal-${meta.tone}`}>
                {meta.label}
              </span>
              <span class="verdict-summary-text">{aiResult.summary}</span>
            </div>
          )}

          {Array.isArray(aiResult?.highlights) && aiResult.highlights.length > 0 && (
            <ul class="verdict-section verdict-section-highlights">
              {aiResult.highlights.map((h, i) => (
                <li key={i}>
                  <IconCheck size={12} class="verdict-icon-positive" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}

          {Array.isArray(aiResult?.blindspots) && aiResult.blindspots.length > 0 && (
            <ul class="verdict-section verdict-section-blindspots">
              {aiResult.blindspots.map((b, i) => (
                <li key={i}>
                  <IconAlert size={12} class="verdict-icon-cautious" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          {(Array.isArray(aiResult?.highlights) &&
            aiResult.highlights.length === 0 &&
            Array.isArray(aiResult?.blindspots) &&
            aiResult.blindspots.length === 0) && (
            <div class="verdict-empty">无显著特征, 维持现状观察即可.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default VerdictCard;
