/**
 * src/ai/ai-errors.js
 *
 * AI 模块统一错误中文化. A1 changelog-summary / A2 upgrade-advice / A7 daily digest 共用.
 * 字典 + humanizeAiError(reason, errorMessage?) 导出.
 */

const REASON_LABELS = {
  api_key_missing: "需先在 AI 配置里填 API Key",
  llm_failed: "AI 服务没响应,稍后重试",
  timeout: "AI 响应超时,稍后重试",
  parse_failed: "AI 返回无法解析,点重试",
  app_not_found: "应用状态已变,刷新后重试",
  no_update: "当前没有可升级版本",
  invalid_args: "参数错误",
};

const REASON_HINT = {
  api_key_missing: "去 AI 配置",
  parse_failed: "重试",
  timeout: "重试",
  llm_failed: "重试",
};

function truncate(s, n) {
  if (typeof s !== "string") return "";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * @param {string} reason  错误 reason (e.g. "llm_failed")
 * @param {string} [errorMessage]  LLM 原始 error message (reason 没命中时透出)
 * @returns {{ label: string, hint: string|null, raw: string }}
 */
function humanizeAiError(reason, errorMessage) {
  const raw = reason || errorMessage || "unknown";
  let label;
  if (reason && REASON_LABELS[reason]) {
    label = REASON_LABELS[reason];
  } else if (typeof errorMessage === "string" && errorMessage.trim()) {
    label = truncate(errorMessage, 60);
  } else {
    label = "未知错误";
  }
  const hint = (reason && REASON_HINT[reason]) || null;
  return { label, hint, raw };
}

module.exports = { humanizeAiError, REASON_LABELS };
