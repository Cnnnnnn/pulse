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
// bump v2→v3: 2026-07-07 prompt 重大重设 — 加 highlights / blindspots, summary 改
// 80 字以内更短的结论, perAngle 要求方向词. 旧缓存版本已不能让 LLM 出新格式,
// 这里 v3 是为了让旧 summary 缓存 (只 200 字不带 highlight) 整体失效.
const CACHE_VERSION = "v3";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const VALID_SIGNALS = new Set(["positive", "neutral", "cautious"]);
const FORBIDDEN_SUMMARY_REGEX =
  /买入|卖出|加仓|减仓|看多|看空|必涨|必跌|强烈推荐/g;
const SUMMARY_SAFE_REPLACEMENT = "当前市场呈现";
const SUMMARY_MAX_LEN = 200;
// ponytail: PII 安全 — LLM 输出里偶尔会出现 user id / 自选股 / 搜索历史 等敏感 token,
// 整段静默替换 (不暴露原 token), 避免渲染端或日志侧意外泄漏.
const PII_REGEX =
  /\b(userId|watchlist|searchHistory|search_history|selfSelect|self_select)\b/gi;

// ponytail: highlights / blindspots / perAngle 都加同样的脱敏 + 长度上限.
// 不再依赖别的字段过滤 (summary 已经做了), 这里只兜底防 LLM 越界.
const FIELD_ITEM_MAX_LEN = 120;

function dataHash(perAngleData) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(perAngleData || {}))
    .digest("hex")
    .slice(0, 12);
}

// 注: cache key 不含 scores — scores 由 computeScores(perAngleData) 确定性派生,
// 同 perAngleData 必同 scores, 故 perAngleData 的 hash 已隐式覆盖 scores.
// 若 scorer 未来引入非 perAngleData 输入 (如市场状态), 需把 scores 纳入 key 或 bump CACHE_VERSION.
function adviseCacheKey(opts) {
  if (!opts || !opts.code) return null;
  const angles = (opts.angles || []).slice().sort();
  const hash = dataHash(opts.perAngleData);
  return crypto
    .createHash("sha1")
    .update(
      [
        CACHE_VERSION,
        opts.code,
        angles.join(","),
        opts.freeText || "",
        hash,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 24);
}

// ponytail: 2026-07-07 P0-1 — 把"这只 vs 行业 vs 历史"的三向对比直接拼进
// system-context. LLM 不需要盲猜"偏高 30%"到哪合理 — 三向 raw 数字 + 状态标签
// 都给它, 解读自然有锚点. 同时显式列出空缺维度, 让 LLM 在写盲点时能引用.
//
// 返回 string, 没有就 null (避免在 prompt 里出现空块).
function _formatBenchmarkBlock(perAngleData) {
  if (!perAngleData || typeof perAngleData !== "object") return null;
  const lines = ["对比基准 (这只 vs 行业 vs 历史):"];

  // 估值 (peer_compare) — PE/PB 这只 + 历史分位 + 行业中位 + 估值状态
  const peer =
    perAngleData.peer_compare && perAngleData.peer_compare.status === "ok"
      ? perAngleData.peer_compare.data
      : null;
  if (peer) {
    const peBits = [];
    if (peer.pe != null) peBits.push(`${peer.pe.toFixed(1)} 倍`);
    if (peer.pePercentile != null)
      peBits.push(`历史 ${peer.pePercentile.toFixed(0)} 分位`);
    if (peer.peValuationStatus) peBits.push(`状态 ${peer.peValuationStatus}`);
    if (peer.industry) peBits.push(`行业: ${peer.industry}`);
    if (peBits.length > 0) lines.push(`- PE: ${peBits.join(" / ")}`);

    const pbBits = [];
    if (peer.pb != null) pbBits.push(`${peer.pb.toFixed(2)} 倍`);
    if (peer.pbPercentile != null)
      pbBits.push(`历史 ${peer.pbPercentile.toFixed(0)} 分位`);
    if (peer.pbValuationStatus) pbBits.push(`状态 ${peer.pbValuationStatus}`);
    if (pbBits.length > 0) lines.push(`- PB: ${pbBits.join(" / ")}`);

    if (peer.roeIndustryMedian != null)
      lines.push(`- 行业 ROE 中位: ${peer.roeIndustryMedian.toFixed(1)}%`);
    if (peer.grossMarginIndustryMedian != null)
      lines.push(
        `- 行业毛利率中位: ${peer.grossMarginIndustryMedian.toFixed(1)}%`,
      );
  }
  // 估值历史分位 (若只有 valuation 没 peer, 拿这里的)
  const val =
    perAngleData.valuation && perAngleData.valuation.status === "ok"
      ? perAngleData.valuation.data
      : null;
  if (val && val.pePercentile3y != null) {
    const exists = lines.some((l) => l.startsWith("- PE:"));
    if (!exists)
      lines.push(`- PE 历史 3 年分位: ${val.pePercentile3y.toFixed(0)}%`);
  }

  // 盈利能力 vs 行业 — 没 peer 时只有自己的 ROE/毛利率
  const prof =
    perAngleData.profitability && perAngleData.profitability.status === "ok"
      ? perAngleData.profitability.data
      : null;
  if (prof) {
    if (prof.roe != null) lines.push(`- ROE: ${prof.roe.toFixed(1)}%`);
    if (prof.grossMargin != null)
      lines.push(`- 毛利率: ${prof.grossMargin.toFixed(1)}%`);
    if (prof.netMargin != null)
      lines.push(`- 净利率: ${prof.netMargin.toFixed(1)}%`);
  }

  // 价格趋势历史幅度 (只这只, 但用区间最低/最高 + 涨跌幅给锚点)
  const pt =
    perAngleData.price_trend && perAngleData.price_trend.status === "ok"
      ? perAngleData.price_trend.data
      : null;
  if (pt && Array.isArray(pt.closes) && pt.closes.length > 0) {
    const first = pt.closes[0];
    const last = pt.closes[pt.closes.length - 1];
    if (first) {
      const periodPct = (((last - first) / first) * 100).toFixed(2);
      lines.push(
        `- 近 ${pt.closes.length} 日涨幅: ${periodPct}% (区间 [${Math.min(...pt.closes).toFixed(2)}, ${Math.max(...pt.closes).toFixed(2)}])`,
      );
    }
  }

  // ponytail: 2026-07-07 — 删 industry_momentum + margin_trading 两块 (周末永远空, 没数据
  // 喂 LLM 只是徒增 token). 行业景气 留待数据源稳定后再加.

  if (lines.length <= 1) return null;
  return lines.join("\n");
}

function _formatGapBlock(perAngleData, angles) {
  // ponytail: 2026-07-07 P0-2 — 数据缺口显式列出, 让 LLM 知道"哪些维度无法判断",
  // 也让前端读取这份列表在 UI 上提示用户.
  if (!Array.isArray(angles) || angles.length === 0) return null;
  const missing = [];
  for (const k of angles) {
    const ang = getAngle(k);
    const label = ang ? ang.label : k;
    const e = (perAngleData || {})[k];
    if (!e || e.status !== "ok") {
      missing.push(label);
    } else if (!ang || typeof ang.summarizeForAi !== "function") {
      missing.push(`${label}(无 AI 摘要)`);
    } else {
      const summary = ang.summarizeForAi(e.data || {});
      if (!summary || summary === "数据缺失") missing.push(label);
    }
  }
  if (missing.length === 0) return null;
  return `数据缺口 (这些维度无法可靠判断): ${missing.join("、")}`;
}

function buildAnalyzeMessages(opts) {
  const { code, angles, perAngleData, freeText, scores } = opts || {};
  if (!code) throw new Error("buildAnalyzeMessages: code 必填");
  const def = resolvePrompt(PROMPT_KEY);
  const system = [def.system, def.rules, def.fewShot]
    .filter(Boolean)
    .join("\n\n");
  const lines = [];
  lines.push(`股票: ${code}`);
  // ── scores 块 (规则评分, AI 只解读不打分) ──
  // Task 2: scores 由规则确定性算出 (diagnosis-scorer), AI 收到后基于此写解读, 不重新打分.
  // 缺失时整段跳过, 保持向后兼容.
  if (scores && typeof scores === "object") {
    const dim = scores.dimensions || {};
    const dimText = [
      ["fundamental", "基本面"],
      ["valuation", "估值"],
      ["capital", "资金"],
      ["tech", "技术"],
      ["risk", "风险"],
    ]
      .map(
        ([k, l]) =>
          `${l}=${dim[k] === null || dim[k] === undefined ? "数据不足" : dim[k]}`,
      )
      .join("，");
    lines.push(
      `综合评级: ${scores.overall == null ? "数据不足" : scores.overall}/10 (${dimText})`,
    );
    if (Array.isArray(scores.rationale) && scores.rationale.length) {
      lines.push(`评分依据: ${scores.rationale.join("；")}`);
    }
    lines.push(
      `【重要】以上评级由规则给出, 你的任务是基于此评分写解读, 不要重新打分.`,
    );
  }
  // ponytail: 2026-07-07 P0-1 — 对比基准块 (这只 vs 行业 vs 历史).
  const benchmark = _formatBenchmarkBlock(perAngleData);
  if (benchmark) lines.push(benchmark);
  // ponytail: 2026-07-07 P0-2 — 数据缺口块, 显式列出无法判断的维度.
  const gap = _formatGapBlock(perAngleData, angles);
  if (gap) lines.push(gap);
  if (Array.isArray(angles) && angles.length > 0) {
    lines.push("选中的分析角度:");
    for (const k of angles) {
      const ang = getAngle(k);
      const label = ang ? ang.label : k;
      const entry = (perAngleData || {})[k];
      if (entry && entry.status === "ok" && entry.data) {
        let body;
        if (ang && typeof ang.summarizeForAi === "function") {
          const summarized = ang.summarizeForAi(entry.data);
          body = summarized || "数据缺失";
        } else {
          body = JSON.stringify(entry.data);
        }
        lines.push(`- ${label} (${k}): ${body}`);
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

// ponytail: 字符串数组清洗 (PII 脱敏 + 长度截断 + forbidden 替换), 用于 highlights /
// blindspots / risks / perAngle 字符串值. 数组保留前 4 条, 每条截到 FIELD_ITEM_MAX_LEN.
function cleanStringField(s) {
  if (typeof s !== "string") return null;
  let t = s.trim();
  if (!t) return null;
  t = t.replace(PII_REGEX, "[REDACTED]");
  t = t.replace(FORBIDDEN_SUMMARY_REGEX, SUMMARY_SAFE_REPLACEMENT);
  if (t.length > FIELD_ITEM_MAX_LEN)
    t = t.slice(0, FIELD_ITEM_MAX_LEN - 1) + "…";
  return t;
}

// ponytail 2026-07-08 — LLM 偶尔输出非纯 JSON (前言/后语/多段/触发截断). 之前用
// indexOf("{")/lastIndexOf("}") 简单截 — 假如 LLM 写了 "Here's the JSON: {...}"
// 加前面一段 "Note: ..." 含另一对 {}, 会拿错段 (跨段被吞了).
// ponytail fix: 用 stack 找**平衡**的 {...} 段, 选最长的 (覆盖嵌套完整 JSON).
// 仍抓不到 → 返 null, 不强行解析.
function _extractBalancedJson(text) {
  if (typeof text !== "string" || !text) return null;
  let best = null;
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") stack.push(i);
    else if (ch === "}") {
      if (stack.length === 0) continue;
      const start = stack.pop();
      if (stack.length === 0) {
        const candidate = text.slice(start, i + 1);
        if (!best || candidate.length > best.length) best = candidate;
      }
    }
  }
  return best;
}

function parseAndValidateAnalyze(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) return null;
  const candidate = _extractBalancedJson(rawText);
  if (!candidate) return null;
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  let summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  if (!summary) summary = "暂无总结";
  summary = summary.replace(PII_REGEX, "[REDACTED]");
  summary = summary.replace(FORBIDDEN_SUMMARY_REGEX, SUMMARY_SAFE_REPLACEMENT);
  if (summary.length > SUMMARY_MAX_LEN)
    summary = summary.slice(0, SUMMARY_MAX_LEN - 1) + "…";

  // 新版字段 (2026-07-07): highlights / blindspots. 数组, 1-2 条.
  const highlightsRaw = Array.isArray(parsed.highlights)
    ? parsed.highlights.filter((s) => typeof s === "string")
    : [];
  const highlights = highlightsRaw
    .map(cleanStringField)
    .filter(Boolean)
    .slice(0, 2);

  const blindspotsRaw = Array.isArray(parsed.blindspots)
    ? parsed.blindspots.filter((s) => typeof s === "string")
    : [];
  const blindspots = blindspotsRaw
    .map(cleanStringField)
    .filter(Boolean)
    .slice(0, 2);

  // perAngle: 每条用 cleanStringField 过滤 (脱敏 + 截断), 值是字符串.
  const perAngleRaw =
    parsed.perAngle && typeof parsed.perAngle === "object"
      ? parsed.perAngle
      : {};
  const perAngle = {};
  for (const [k, v] of Object.entries(perAngleRaw)) {
    const cleaned = cleanStringField(v);
    if (cleaned) perAngle[k] = cleaned;
  }

  const risksRaw = Array.isArray(parsed.risks)
    ? parsed.risks.filter((s) => typeof s === "string")
    : [];
  const risks = risksRaw.map(cleanStringField).filter(Boolean).slice(0, 3);

  const signal = VALID_SIGNALS.has(parsed.signal) ? parsed.signal : "neutral";
  return { summary, highlights, blindspots, perAngle, risks, signal };
}

// ponytail: 2026-07-07 P0-2 — 在 LLM 拿到 prompt 前就显式算出"无法判断的维度",
// 一起返回, 让前端 UI 直接展示缺口. 不依赖 LLM 是否遵守规则.
function computeDataGaps(angles, perAngleData) {
  if (!Array.isArray(angles)) return [];
  const gaps = [];
  for (const k of angles) {
    const ang = getAngle(k);
    const label = ang ? ang.label : k;
    const e = (perAngleData || {})[k];
    let missing = false;
    if (!e || e.status !== "ok") missing = true;
    else if (ang && typeof ang.summarizeForAi === "function") {
      const s = ang.summarizeForAi(e.data || {});
      if (!s || s === "数据缺失") missing = true;
    }
    if (missing) gaps.push({ key: k, label });
  }
  return gaps;
}

// ponytail: 2026-07-07 P1-2 — 单条 angle 的本地快速解读. 不调 LLM, 直接读
// perAngleData + 这个 angle 的 dim score, 用规则合成一句"带方向的观察".
// 用途: 用户对某条 angle 的 LLM 解读不满意, 点 card 上的"换一句"按钮, 0.05s 出新句
// (10 种模板随机抽 + 反向锚点替换), 不消耗 token, 不等网络.
//
// 局限: 模板句比 LLM 短, 不会引用行业 / 历史分位等对比数据 — 那些需要 LLM 介入.
// 升级路径: 真要"深度重生成"应当跑 LLM (可在 UI 加第二种"AI 重生成"按钮).
const LOCAL_TEMPLATES = {
  // tone = 偏强 / 偏弱 / 中性 — 每条带 1 个 {token} 引用 perAngle 数据
  price_trend: {
    positive: [
      "近 {period} 累涨 {pct}%, 趋势偏强",
      "区间 [{lo}, {hi}] 重心抬升, 偏强",
      "短期 {period} +{pct}%, 偏强运行",
    ],
    neutral: [
      "近 {period} 累计 {pct}%, 区间整理",
      "区间 [{lo}, {hi}] 窄幅震荡, 中性",
      "短期 {period} {pct}%, 方向待选",
    ],
    cautious: [
      "近 {period} 累跌 {pct}%, 趋势偏弱",
      "区间 [{lo}, {hi}] 重心下移, 偏弱",
      "短期 {period} {pct}%, 偏弱",
    ],
  },
  valuation: {
    positive: ["PE 偏低, 估值有安全垫", "估值水位合理, 修复空间存在"],
    neutral: [
      "PE 处于行业中位附近, 估值中性",
      "PE 历史分位 50% 上下, 估值无明显优势",
    ],
    cautious: [
      "PE 偏贵, 估值天花板明显",
      "PE 高于行业中位, 进一步抬升空间有限",
    ],
  },
  profitability: {
    positive: ["ROE {roe}% 维持高位, 盈利质量优", "毛利率领先, 偏强"],
    neutral: ["ROE {roe}% 处于行业中位附近", "盈利能力中性, 无明显短板"],
    cautious: ["ROE 偏弱, 盈利质量待改善", "盈利能力下行, 需关注"],
  },
  volume_turnover: {
    positive: ["量能边际放大, 交投活跃", "换手率提升, 资金参与度上升"],
    neutral: ["量能平稳, 换手率中性", "交投不温不火, 中性"],
    cautious: ["量能萎缩, 关注持续性", "换手率走弱, 资金参与度下降"],
  },
  capital_flow: {
    positive: ["主力近 5 日净流入, 资金偏积极", "资金面偏正面"],
    neutral: ["资金面中性, 多空均衡", "主力资金观望, 净流入不明显"],
    cautious: ["主力近 5 日净流出, 资金离场", "资金面偏负面, 持续性待观察"],
  },
  tech_indicators: {
    positive: ["MACD 红柱, 均线多头排列, 偏强", "技术面修复中, 偏强"],
    neutral: ["技术面中性, 等待方向", "MACD 接近零轴, 方向待选"],
    cautious: ["MACD 绿柱, 均线空头排列, 偏弱", "技术面偏弱, 关注支撑"],
  },
  news_buzz: {
    positive: ["近期舆情偏正面, 关注度上升", "新闻情绪改善"],
    neutral: ["舆情中性, 无明显催化", "新闻热度一般"],
    cautious: ["舆情偏负面, 关注度下降", "新闻情绪转弱, 留意"],
  },
  peer_compare: {
    positive: ["行业相对位置靠前, 优于同业", "PE 较行业中位偏低, 估值有优势"],
    neutral: ["行业相对位置中游, 与同业相当", "估值与行业中位接近"],
    cautious: ["行业相对位置靠后, 跑输同业", "PE 较行业中位偏高, 估值不占优"],
  },
  moat_score: {
    positive: ["护城河 7+/9, 龙头属性强", "ROIC + 毛利率双优势, 偏强"],
    neutral: ["护城河中等, 中性", "护城河优势不突出"],
    cautious: ["护城河偏弱, 关注竞争压力", "行业壁垒不高, 警惕份额回落"],
  },
  // ponytail: 2026-07-07 加 5 个新 angle 模板 (业绩预期/股东结构/股本事件/行业景气/融资融券)
  // ponytail: 不用 placeholder (各 angle 字段结构差异大, 通用模板够用 — 反正 refresh 是
  // 给你看"另一种说法"的小成本操作, 不必绑死数字).
  earnings_forecast: {
    positive: ["业绩预增, 趋势向好", "业绩持续向好, 趋势确认", "盈利动能上行"],
    neutral: ["业绩平稳, 同比变化温和", "业绩预告中性", "盈利节奏稳定"],
    cautious: [
      "业绩预减, 趋势承压",
      "业绩转弱, 关注下修风险",
      "盈利拐点待观察",
    ],
  },
  shareholders: {
    positive: [
      "股东集中度提升, 机构加仓",
      "股东人数环比下降, 筹码集中",
      "主力态度偏积极",
    ],
    neutral: ["股东结构稳定, 无明显变化", "持仓格局平稳", "筹码未现明显迁移"],
    cautious: [
      "股东人数环比上升, 筹码分散",
      "机构持仓环比下降, 主力观望",
      "散户化倾向增强",
    ],
  },
  corporate_events: {
    positive: [
      "高分红预案, 回报明确",
      "分红 + 送股, 股本回报积极",
      "现金回报确认",
    ],
    neutral: ["近期无重大股本事件", "股本结构平稳", "暂无新事件"],
    cautious: [
      "近期解禁压力存在",
      "股本事件偏负面, 关注稀释",
      "股本变化需警惕",
    ],
  },
};

// 把一个数字 n 截到小数后 d 位再格式化.
function _fmt(n, d) {
  if (n == null || !Number.isFinite(n)) return "—";
  return Number(n).toFixed(d);
}

// 用 score (0-10) 推 tone. 7+ → positive, 4-6 → neutral, 0-3 → cautious, 缺数据 → null.
function _toneFromScore(score) {
  if (score == null) return null;
  if (score >= 7) return "positive";
  if (score <= 3) return "cautious";
  return "neutral";
}

// 用 perAngleData 内字段做模板替换. 缺字段时整段 fallback 文字.
function _fillTemplate(tpl, perAngleData, scores) {
  const a = perAngleData || {};
  const pt =
    a.price_trend && a.price_trend.status === "ok" ? a.price_trend.data : null;
  const val =
    a.valuation && a.valuation.status === "ok" ? a.valuation.data : null;
  const prof =
    a.profitability && a.profitability.status === "ok"
      ? a.profitability.data
      : null;
  const ptCloses = pt && Array.isArray(pt.closes) ? pt.closes : null;
  return tpl
    .replace(
      "{period}",
      ptCloses && ptCloses.length > 0 ? `${ptCloses.length} 日` : "短期",
    )
    .replace(
      "{pct}",
      ptCloses && ptCloses.length > 1 && ptCloses[0]
        ? _fmt(
            ((ptCloses[ptCloses.length - 1] - ptCloses[0]) / ptCloses[0]) * 100,
            2,
          )
        : "—",
    )
    .replace(
      "{lo}",
      ptCloses && ptCloses.length > 0 ? _fmt(Math.min(...ptCloses), 2) : "—",
    )
    .replace(
      "{hi}",
      ptCloses && ptCloses.length > 0 ? _fmt(Math.max(...ptCloses), 2) : "—",
    )
    .replace("{roe}", prof && prof.roe != null ? _fmt(prof.roe, 1) : "—")
    .replace("{pe}", val && val.pe != null ? _fmt(val.pe, 1) : "—");
}

// ponytail: 2026-07-07 P1-2 — 单条 angle 的本地刷新. 不调 LLM, 不消耗 token.
// 1) 用 score 推 tone; 2) 抽模板; 3) 替换占位符; 4) 截 50 字内.
// 返回 null 时表示"该 angle 缺数据, 没法本地生成" — 调用方应显示"数据缺失".
function refreshAngleLocally({ angleKey, perAngleData, scores, seed }) {
  // ponytail: 不依赖 getAngle (它还会拖入 fetcher 等重依赖). LOCAL_TEMPLATES 是
  // 闭包内硬编码, angle key 不在 map 里直接返 null (说明该 angle 没本地模板).
  if (!LOCAL_TEMPLATES[angleKey]) return null;
  const e = perAngleData && perAngleData[angleKey];
  if (!e || e.status !== "ok") return null;
  // ponytail: 优先用"已有 aiResult.perAngle[key]"做 tone (那是 LLM 视角), 缺则用
  // scores.dimensions[对应 dim]. 单 angle 经常对应 1 个 dim key; 没映射时 fallback.
  const DIM_TO_ANGLE = {
    fundamental: "profitability",
    valuation: "valuation",
    capital: "capital_flow",
    tech: "tech_indicators",
    risk: "valuation",
  };
  // ponytail: scores.dimensions 的 key 是 dim 名 (fundamental/valuation/...),
  // angle key 不一定跟 dim key 一一对应. DIM_TO_ANGLE[dim] = angle, 反查:
  // 1) 直接拿 scores.dimensions[angleKey] (若 dim == angle)
  // 2) 遍历 dim, 找 DIM_TO_ANGLE[dim] == angleKey
  let tone = null;
  if (scores && scores.dimensions) {
    if (scores.dimensions[angleKey] != null) {
      tone = _toneFromScore(scores.dimensions[angleKey]);
    } else {
      for (const [dk, ak] of Object.entries(DIM_TO_ANGLE)) {
        if (ak === angleKey && scores.dimensions[dk] != null) {
          tone = _toneFromScore(scores.dimensions[dk]);
          break;
        }
      }
    }
  }
  if (!tone) return null;
  const group = LOCAL_TEMPLATES[angleKey] || LOCAL_TEMPLATES.profitability;
  const list = (group && group[tone]) || group.neutral || [];
  if (list.length === 0) return null;
  const idx =
    (((seed != null ? seed : Math.floor(Math.random() * 1e6)) % list.length) +
      list.length) %
    list.length;
  const tpl = list[idx];
  let out = _fillTemplate(tpl, perAngleData, scores);
  if (out.length > 50) out = out.slice(0, 49) + "…";
  return out;
}

// ponytail: 2026-07-07 — LLM 偶尔输出非纯 JSON (markdown fence / 多余文本 / 触发截断
// 缺失尾部 }), 1 次 parse_failed 用户体感差. 这里加 1 次"前向 parse 失败 → 再请一次
// LLM 重出" 的轻循环. 仅 parse 失败触发 (网络 / llm 错误已由 http-client 层 retry 覆盖),
// 总重试上限 1 次, 避免 token 浪费 / 死循环.
// ponytail 2026-07-08 — 用户报告所有股票 AI 解读都报 "AI 返回格式异常", 怀疑是 provider/
// model 行为导致高频 JSON 污染. 升级:
//   1. retry 总数 1→2 (3 次机会)
//   2. 每次 parse 失败, 把 LLM 原始输出前 500 字符记日志, 方便贴给开发者排查
//   3. 全部 retry 后仍失败 → 走 _fallbackProseExtract, 从 LLM 输出里抠 summary 段,
//      至少展示一段文字, 而不是直接报 parse_failed (让用户至少读到一段 prose).
const PARSE_RETRY_MAX = 2;

// ponytail 2026-07-08: 解析失败的兜底. 在 LLM 输出里搜 "summary" 字段 (markdown 形式
//   "summary: <text>" / "**summary**: <text>" / '"summary":"<text>"'), 抠出来
//   当 summary 展示. 找得到就当 ok=true 但带 degrade 标记 (前端可读 fromCache=false
//   + attempts>1 走降级渲染). 找不到才返 parse_failed.
function _fallbackProseExtract(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) return null;
  // 1) 找 "summary" 后面跟的引号内容 (大模型常输出 "summary":"..." 或 'summary':'...')
  const quoted = rawText.match(
    /["']summary["']\s*:\s*["']([^"'\n]{10,200})["']/,
  );
  if (quoted) {
    return {
      summary: quoted[1].trim().replace(PII_REGEX, "[REDACTED]"),
      highlights: [],
      blindspots: [],
      perAngle: {},
      risks: [],
      signal: "neutral",
      _degraded: true,
    };
  }
  // 2) 找 "summary: <text>" (大模型常见 markdown 写法)
  const md = rawText.match(/(?:^|\n)\s*(?:\*\*)?summary(?:\*\*)?\s*[:：]\s*([^\n#*]{10,200})/i);
  if (md) {
    return {
      summary: md[1].trim().replace(PII_REGEX, "[REDACTED]"),
      highlights: [],
      blindspots: [],
      perAngle: {},
      risks: [],
      signal: "neutral",
      _degraded: true,
    };
  }
  // 3) 找第一段 > 30 字的中文段落当 summary
  const prose = rawText.match(/[\u4e00-\u9fa5][\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef，。！？、；:0-9A-Za-z]{29,200}/);
  if (prose) {
    return {
      summary: prose[0].trim().replace(PII_REGEX, "[REDACTED]"),
      highlights: [],
      blindspots: [],
      perAngle: {},
      risks: [],
      signal: "neutral",
      _degraded: true,
    };
  }
  return null;
}

async function aiStockDetailAnalyze(opts) {
  const safeOpts = opts || {};
  const { code, angles, perAngleData, freeText, scores } = safeOpts;
  if (!code) return { ok: false, reason: "invalid_args" };
  // ponytail 2026-07-08: 整体耗时起点 (parse 失败日志需要 elapsed)
  const t0 = Date.now();

  const cacheKey = adviseCacheKey({ code, angles, perAngleData, freeText });
  if (!cacheKey) return { ok: false, reason: "invalid_cache_key" };

  const state = stateStore.load();
  const cacheMap = (state && state.stockDetailCache) || {};
  const entry = cacheMap[cacheKey];
  // ponytail: 2026-07-07 P0-2 — 数据缺口独立于 LLM 缓存, 因为 perAngleData 可能没变
  // (同股票同角度), 而 result 可能来自缓存. 永远基于"本次入参"现算, 不缓存.
  const dataGaps = computeDataGaps(angles, perAngleData);
  if (
    entry &&
    entry.result &&
    typeof entry.fetchedAt === "number" &&
    Date.now() - entry.fetchedAt < CACHE_TTL_MS
  ) {
    return {
      ok: true,
      result: { ...entry.result, dataGaps },
      fromCache: true,
    };
  }

  let messages;
  try {
    messages = buildAnalyzeMessages({
      code,
      angles,
      perAngleData,
      freeText,
      scores,
    });
  } catch (e) {
    return { ok: false, reason: "build_prompt_failed", error: e && e.message };
  }

  // ponytail: 第一轮正常 prompt. parse 失败时, 临时在 user 段尾追加纠错提示,
  // 让 LLM 知道上轮输错, 重出严格 JSON. 不重 buildAnalyzeMessages (system/rules/fewShot 不变).
  // ponytail 2026-07-08 — 每次 parse 失败把 LLM 原文前 500 字符记日志 (console.warn → stderr),
  //   用户跑 "查看日志" 或开发者看 Electron 主进程 stderr 都能看到. 不引新 logger 依赖.
  let lastRaw = null;
  for (let attempt = 0; attempt <= PARSE_RETRY_MAX; attempt++) {
    const askMessages =
      attempt === 0
        ? messages
        : [
            messages[0], // system
            {
              role: "user",
              content:
                messages[1].content +
                "\n\n[系统提醒] 上一轮输出无法被解析为 JSON. 请严格按规则: " +
                "只输出一个 JSON 对象, 不要 markdown 围栏 (```) / 不要 'Here is the JSON:' " +
                "等前言 / 不要换行后再写第二段. 6 个 key: summary, highlights, blindspots, " +
                "perAngle, risks, signal. 整段只 1 个 {} 块.",
            },
          ];

    const llm = await chatCompletion(askMessages);
    if (!llm.ok) {
      return {
        ok: false,
        reason: llm.reason || "llm_failed",
        error: llm.error,
      };
    }

    lastRaw = llm.text;
    const parsed = parseAndValidateAnalyze(llm.text);
    if (parsed) {
      // ponytail 2026-07-08 — 降级抽取的结果 (_degraded=true) 不缓存, 下次换数据再重试严格格式
      if (!parsed._degraded) {
        const nextCache = { ...cacheMap };
        nextCache[cacheKey] = { result: parsed, fetchedAt: Date.now() };
        stateStore.patchState((st) => {
          st.stockDetailCache = nextCache;
        });
      }
      return {
        ok: true,
        result: { ...parsed, dataGaps },
        fromCache: false,
        attempts: attempt + 1,
      };
    }
    // parse 失败: 记录 LLM 原始输出 (前 500 字符) 便于排查
     
    console.warn(
      `[stock-detail-advisor] AI parse failed: code=${code} attempt=${attempt + 1}/${PARSE_RETRY_MAX + 1} ` +
      `elapsed=${Date.now() - t0}ms text_head=${(llm.text || "").slice(0, 500).replace(/\n/g, "⏎")}`,
    );
  }

  // 全部 retry 仍失败 → 走 _fallbackProseExtract 兜底, 至少展示一段 prose
  const fallback = _fallbackProseExtract(lastRaw || "");
  if (fallback) {
     
    console.warn(
      `[stock-detail-advisor] AI parse degrade: code=${code} 用兜底 prose 提取 (无结构化字段)`,
    );
    return {
      ok: true,
      result: { ...fallback, dataGaps },
      fromCache: false,
      attempts: PARSE_RETRY_MAX + 1,
      degraded: true,
    };
  }

  return {
    ok: false,
    reason: "parse_failed",
    error: `LLM 输出连续 ${PARSE_RETRY_MAX + 1} 次解析失败, 且未找到可用 prose`,
  };
}

module.exports = {
  aiStockDetailAnalyze,
  adviseCacheKey,
  buildAnalyzeMessages,
  parseAndValidateAnalyze,
  refreshAngleLocally,
  CACHE_TTL_MS,
  CACHE_VERSION,
  PROMPT_KEY,
  VALID_SIGNALS,
  SUMMARY_MAX_LEN,
};
