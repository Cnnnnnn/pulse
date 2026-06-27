/**
 * src/ai/stock-detail-advisor.js
 *
 * 阶段四: 个股 AI 分析 — 调 LLM 解读用户选中的角度数据.
 * 复用品类 advisor 的: prompt-registry + shared-llm + P71 预算 + 24h 持久化缓存.
 *
 * ponytail: 不重写 LLM, 不自接 key, 不绕预算. 只做拼 prompt + 校验 + 缓存.
 */
const crypto = require("crypto");
const stateStore = require("../main/state-store");
const { chatCompletion } = require("./shared-llm");
const { resolvePrompt } = require("./prompt-registry");
const { getAngle } = require("../stocks/stock-detail-angles");

const PROMPT_KEY = "stock_detail_analyze";
const CACHE_VERSION = "v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const VALID_SIGNALS = new Set(["positive", "neutral", "cautious"]);
const FORBIDDEN_SUMMARY_REGEX = /买入|卖出|加仓|减仓|看多|看空|必涨|必跌|强烈推荐/g;
const SUMMARY_SAFE_REPLACEMENT = "当前市场呈现";
const SUMMARY_MAX_LEN = 200;
// ponytail: PII 安全 — LLM 输出里偶尔会出现 user id / 自选股 / 搜索历史 等敏感 token,
// 整段静默替换 (不暴露原 token), 避免渲染端或日志侧意外泄漏.
const PII_REGEX = /\b(userId|watchlist|searchHistory|search_history|selfSelect|self_select)\b/gi;

function dataHash(perAngleData) {
  return crypto.createHash("sha1")
    .update(JSON.stringify(perAngleData || {}))
    .digest("hex")
    .slice(0, 12);
}

function adviseCacheKey(opts) {
  if (!opts || !opts.code) return null;
  const angles = (opts.angles || []).slice().sort();
  const hash = dataHash(opts.perAngleData);
  return crypto.createHash("sha1")
    .update([CACHE_VERSION, opts.code, angles.join(","), opts.freeText || "", hash].join("|"))
    .digest("hex")
    .slice(0, 24);
}

function buildAnalyzeMessages(opts) {
  const { code, angles, perAngleData, freeText } = opts || {};
  if (!code) throw new Error("buildAnalyzeMessages: code 必填");
  const def = resolvePrompt(PROMPT_KEY);
  const system = [def.system, def.rules, def.fewShot].filter(Boolean).join("\n\n");
  const lines = [];
  lines.push(`股票: ${code}`);
  if (Array.isArray(angles) && angles.length > 0) {
    lines.push("选中的分析角度:");
    for (const k of angles) {
      const ang = getAngle(k);
      const label = ang ? ang.label : k;
      const entry = (perAngleData || {})[k];
      if (entry && entry.status === "ok" && entry.data) {
        lines.push(`- ${label} (${k}): ${JSON.stringify(entry.data)}`);
      } else {
        lines.push(`- ${label} (${k}): 数据缺失`);
      }
    }
  }
  if (freeText && String(freeText).trim()) {
    lines.push("");
    lines.push(`补充说明: ${String(freeText).trim()}`);
  }
  const user = lines.join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function parseAndValidateAnalyze(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) return null;
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed;
  try { parsed = JSON.parse(rawText.slice(start, end + 1)); }
  catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;
  let summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  if (!summary) summary = "暂无总结";
  summary = summary.replace(PII_REGEX, "[REDACTED]");
  summary = summary.replace(FORBIDDEN_SUMMARY_REGEX, SUMMARY_SAFE_REPLACEMENT);
  if (summary.length > SUMMARY_MAX_LEN) summary = summary.slice(0, SUMMARY_MAX_LEN - 1) + "…";
  const perAngle = (parsed.perAngle && typeof parsed.perAngle === "object") ? parsed.perAngle : {};
  const risks = Array.isArray(parsed.risks) ? parsed.risks.filter((s) => typeof s === "string") : [];
  const signal = VALID_SIGNALS.has(parsed.signal) ? parsed.signal : "neutral";
  return { summary, perAngle, risks, signal };
}

async function aiStockDetailAnalyze(opts) {
  const safeOpts = opts || {};
  const { code, angles, perAngleData, freeText } = safeOpts;
  if (!code) return { ok: false, reason: "invalid_args" };

  const cacheKey = adviseCacheKey({ code, angles, perAngleData, freeText });
  if (!cacheKey) return { ok: false, reason: "invalid_cache_key" };

  const state = stateStore.load();
  const cacheMap = (state && state.stockDetailCache) || {};
  const entry = cacheMap[cacheKey];
  if (entry && entry.result && typeof entry.fetchedAt === "number" &&
      Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, result: entry.result, fromCache: true };
  }

  let messages;
  try {
    messages = buildAnalyzeMessages({ code, angles, perAngleData, freeText });
  } catch (e) {
    return { ok: false, reason: "build_prompt_failed", error: e && e.message };
  }
  const llm = await chatCompletion(messages);
  if (!llm.ok) {
    return { ok: false, reason: llm.reason || "llm_failed", error: llm.error };
  }

  const parsed = parseAndValidateAnalyze(llm.text);
  if (!parsed) return { ok: false, reason: "parse_failed" };

  const nextCache = { ...cacheMap };
  nextCache[cacheKey] = { result: parsed, fetchedAt: Date.now() };
  stateStore.patchState((st) => { st.stockDetailCache = nextCache; });

  return { ok: true, result: parsed, fromCache: false };
}

module.exports = {
  aiStockDetailAnalyze,
  adviseCacheKey,
  buildAnalyzeMessages,
  parseAndValidateAnalyze,
  CACHE_TTL_MS,
  CACHE_VERSION,
  PROMPT_KEY,
  VALID_SIGNALS,
  SUMMARY_MAX_LEN,
};