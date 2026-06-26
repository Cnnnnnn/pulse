/**
 * src/ai/stock-screener-advisor.js
 *
 * 阶段二: 选股 AI 推荐策略 — 调 LLM 生成 criteria + sortConfig + summary,
 *          走 state.json.aiStockAdviseCache 24h TTL 持久缓存.
 *
 * 复用 chatCompletion (shared-llm.js) + P71 token 预算硬限 + resolvePrompt (prompt-registry.js).
 * 走 IPC: stocks:ai-advise (register-stocks.js) → aiStockAdvise(opts).
 *
 * ponytail: 不重写 LLM 调用, 不自接 API key, 不绕过预算. 只做拼 prompt + 校验 + 缓存.
 */

const crypto = require("crypto");
const stateStore = require("../main/state-store");
const { chatCompletion } = require("./shared-llm");
const { resolvePrompt } = require("./prompt-registry");
const { DEFAULT_SCREENER_CRITERIA } = require("../stocks/stock-constants");

const PROMPT_KEY = "stock_screener_advise";
const CACHE_VERSION = "v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ponytail: 排序键白名单 — 防止 LLM 输出不可识别的 key 把 sortKey signal 写炸
const VALID_SORT_KEYS = new Set([
  "roe", "pe", "pb", "changePct", "marketCap", "turnover", "price", "name", "industry",
]);
const VALID_MARKET_TIERS = new Set(["all", "large", "mid", "small"]);
// ponytail: summary 合规改写 — 命中投资建议关键词时整句替换
const FORBIDDEN_SUMMARY_REGEX = /买入|卖出|加仓|减仓|看多|看空|必涨|必跌|强烈推荐/g;
const SUMMARY_SAFE_REPLACEMENT = "当前市场呈现";
const SUMMARY_MAX_LEN = 120;

// ─────────────────────────────────────────────────────────────────────────
// 公开 API
// ─────────────────────────────────────────────────────────────────────────

/**
 * 计算缓存 key.
 * @param {{intentChip:{id:string}, freeText?:string, marketOverviewHash:string}} opts
 * @returns {string}
 */
function adviseCacheKey(opts) {
  if (!opts || !opts.intentChip || !opts.intentChip.id) return null;
  if (!opts.marketOverviewHash) return null;
  const freeText = (opts.freeText || "").trim();
  return crypto
    .createHash("sha1")
    .update([CACHE_VERSION, opts.intentChip.id, freeText, opts.marketOverviewHash].join("|"))
    .digest("hex")
    .slice(0, 24);
}

/**
 * 拼 messages (system + user) — 走 resolvePrompt 拿 system + rules, user 由 buildPromptUser 拼.
 * @param {{intentChip:{id:string, label:string}, freeText?:string, marketOverview:object, currentCriteria?:object}} opts
 * @returns {Array<{role:string, content:string}>}
 */
function buildAdviseMessages(opts) {
  const { intentChip, freeText, marketOverview, currentCriteria } = opts || {};
  if (!intentChip || !intentChip.id) {
    throw new Error("buildAdviseMessages: intentChip.id 必填");
  }
  if (!marketOverview || !marketOverview.hash) {
    throw new Error("buildAdviseMessages: marketOverview.hash 必填");
  }
  // ponytail: 走 resolvePrompt 让用户在 Settings 里能改 prompt (跟其它 AI 任务一致).
  const def = resolvePrompt(PROMPT_KEY);
  const systemParts = [def.system];
  if (def.rules) systemParts.push(def.rules);
  const system = systemParts.join("\n\n");

  const userLines = [];
  userLines.push(`意图: ${intentChip.id} — ${intentChip.label}`);
  if (freeText && String(freeText).trim()) {
    userLines.push(`补充说明: ${String(freeText).trim()}`);
  }
  userLines.push("");
  userLines.push(`今日市场快照 (${marketOverview.date}):`);
  userLines.push(`  总股票数: ${marketOverview.total || 0}`);
  userLines.push(`  PE 中位数: ${fmtNum(marketOverview.peMedian)}`);
  userLines.push(`  PE 30 分位: ${fmtNum(marketOverview.peP30)}`);
  userLines.push(`  PE 70 分位: ${fmtNum(marketOverview.peP70)}`);
  userLines.push(`  ROE 中位数: ${fmtNum(marketOverview.roeMedian)}%`);
  userLines.push(`  涨幅中位数: ${fmtNumSigned(marketOverview.changePctMedian)}%`);
  userLines.push(`  换手率中位数: ${fmtNum(marketOverview.turnoverMedian)}%`);
  if (currentCriteria && typeof currentCriteria === "object") {
    userLines.push("");
    userLines.push(`当前筛选条件 (供参考, 用户可能基于此微调): ${JSON.stringify(currentCriteria)}`);
  }
  // ponytail: 不发 userId / watchlist / search history — 只有意图 + 市场快照 + 当前 criteria.
  const user = userLines.join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * 解析 LLM 输出 → 结构化 result.
 * @param {string} rawText  LLM 原始返回 (已经过 sanitizeLlmOutput)
 * @returns {null | {criteria:object, sortConfig:object|null, summary:string}}
 */
function parseAndValidateAdvise(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) return null;
  // 找 JSON 块 (LLM 偶尔在 JSON 前后补文字)
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(rawText.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  // criteria: 白名单 + 类型转换 + 丢弃未知字段
  const criteria = sanitizeCriteria(parsed.criteria);
  // sortConfig: 白名单 + 类型
  const sortConfig = sanitizeSortConfig(parsed.sortConfig);
  // summary: 长度限制 + 合规改写
  const summary = sanitizeSummary(parsed.summary);

  return { criteria, sortConfig, summary };
}

/**
 * 主入口 — IPC handler 会调这个.
 *
 * @param {{intentChip:{id:string,label:string}, freeText?:string, marketOverview:object, currentCriteria?:object, statePath?:string}} opts
 * @returns {Promise<{ok:boolean, reason?:string, result?:object, fromCache?:boolean}>}
 */
async function aiStockAdvise(opts) {
  const safeOpts = opts || {};
  const { intentChip, freeText, marketOverview, currentCriteria, statePath } = safeOpts;

  if (!intentChip || !intentChip.id) {
    return { ok: false, reason: "invalid_args" };
  }
  if (!marketOverview || !marketOverview.hash) {
    return { ok: false, reason: "missing_market_overview" };
  }

  const cacheKey = adviseCacheKey({
    intentChip,
    freeText,
    marketOverviewHash: marketOverview.hash,
  });
  if (!cacheKey) return { ok: false, reason: "invalid_cache_key" };

  // 1. 缓存查
  const state = stateStore.load(statePath);
  const cacheMap = (state && state.aiStockAdviseCache) || {};
  const entry = cacheMap[cacheKey];
  if (
    entry &&
    entry.result &&
    typeof entry.fetchedAt === "number" &&
    Date.now() - entry.fetchedAt < CACHE_TTL_MS
  ) {
    return { ok: true, result: entry.result, fromCache: true };
  }

  // 2. 调 LLM
  let messages;
  try {
    messages = buildAdviseMessages({ intentChip, freeText, marketOverview, currentCriteria });
  } catch (e) {
    return { ok: false, reason: "build_prompt_failed", error: e && e.message };
  }
  const llm = await chatCompletion(messages);
  if (!llm.ok) {
    // ponytail: chatCompletion 已经走预算硬限 (返 reason=budget_exceeded)
    return { ok: false, reason: llm.reason || "llm_failed", error: llm.error };
  }

  // 3. 解析校验
  const parsed = parseAndValidateAdvise(llm.text);
  if (!parsed) {
    return { ok: false, reason: "parse_failed" };
  }

  // 4. 写缓存
  const nextCache = { ...cacheMap };
  nextCache[cacheKey] = {
    result: parsed,
    fetchedAt: Date.now(),
  };
  stateStore.patchState(
    (st) => {
      st.aiStockAdviseCache = nextCache;
    },
    statePath,
  );

  return { ok: true, result: parsed, fromCache: false };
}

// ─────────────────────────────────────────────────────────────────────────
// 内部 helpers (export 给测试用)
// ─────────────────────────────────────────────────────────────────────────

function sanitizeCriteria(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return cloneDefaultCriteria();
  // 数值字段: 范围 [null, 数字]
  const numericFields = ["peMin", "peMax", "pbMin", "pbMax", "roeMin",
    "dividendYieldMin", "turnoverMin", "turnoverMax", "change5dMin"];
  for (const f of numericFields) {
    const v = raw[f];
    if (v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[f] = n;
    // ponytail: 类型不对 → 静默丢弃 + 不打 warn (避免 LLM 良性抖动刷日志)
  }
  // marketCapTier
  if (typeof raw.marketCapTier === "string" && VALID_MARKET_TIERS.has(raw.marketCapTier)) {
    out.marketCapTier = raw.marketCapTier;
  } else if (raw.marketCapTier == null) {
    // 保持 default
  } else {
    // 非法值丢弃
  }
  // industries: 数组 + 字符串
  if (Array.isArray(raw.industries)) {
    out.industries = raw.industries.filter((s) => typeof s === "string" && s.length > 0).slice(0, 50);
  }
  // ponytail: 合并默认值, 避免 UI 读 undefined.industries 报错.
  return Object.assign(cloneDefaultCriteria(), out);
}

function sanitizeSortConfig(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.key !== "string" || !VALID_SORT_KEYS.has(raw.key)) return null;
  const dir = raw.dir === "asc" ? "asc" : "desc";
  return { key: raw.key, dir };
}

function sanitizeSummary(raw) {
  let s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "当前市场呈现中性估值水平, 可结合自身偏好微调筛选条件。";
  // 合规改写
  s = s.replace(FORBIDDEN_SUMMARY_REGEX, SUMMARY_SAFE_REPLACEMENT);
  // 长度限制
  if (s.length > SUMMARY_MAX_LEN) {
    s = s.slice(0, SUMMARY_MAX_LEN - 1) + "…";
  }
  return s;
}

function cloneDefaultCriteria() {
  return {
    peMin: DEFAULT_SCREENER_CRITERIA.peMin,
    peMax: DEFAULT_SCREENER_CRITERIA.peMax,
    pbMin: DEFAULT_SCREENER_CRITERIA.pbMin,
    pbMax: DEFAULT_SCREENER_CRITERIA.pbMax,
    roeMin: DEFAULT_SCREENER_CRITERIA.roeMin,
    dividendYieldMin: DEFAULT_SCREENER_CRITERIA.dividendYieldMin,
    turnoverMin: DEFAULT_SCREENER_CRITERIA.turnoverMin,
    turnoverMax: DEFAULT_SCREENER_CRITERIA.turnoverMax,
    change5dMin: DEFAULT_SCREENER_CRITERIA.change5dMin,
    marketCapTier: DEFAULT_SCREENER_CRITERIA.marketCapTier,
    industries: [...DEFAULT_SCREENER_CRITERIA.industries],
  };
}

function fmtNum(v) {
  if (v == null) return "—";
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return String(v);
}

function fmtNumSigned(v) {
  if (v == null) return "—";
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v >= 0 ? `+${v}` : String(v);
}

module.exports = {
  // 主入口
  aiStockAdvise,
  // 给测试/外部用
  adviseCacheKey,
  buildAdviseMessages,
  parseAndValidateAdvise,
  // 常量 (测试断言)
  CACHE_TTL_MS,
  CACHE_VERSION,
  PROMPT_KEY,
  VALID_SORT_KEYS,
  VALID_MARKET_TIERS,
  SUMMARY_MAX_LEN,
  // 内部 (测试用)
  sanitizeCriteria,
  sanitizeSortConfig,
  sanitizeSummary,
};