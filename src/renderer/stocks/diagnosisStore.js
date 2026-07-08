/**
 * 个股诊断报告页 state. Spec: 2026-07-04-stock-diagnosis-redesign-design.md
 *
 * 两个 tab: "screen"(筛选) / "diagnosis"(个股分析) — 照搬世界杯模块 segmented control.
 * stockActiveTab 决定展示哪个 tab; stockDiagnosisCode 是"当前分析股票"(诊断 tab 内容).
 * 筛选 tab 的 ResultTable 行内诊断按钮 + 诊断 tab 顶部搜索框 都调 openDiagnosis(code):
 *   它会同时设 stockDiagnosisCode 并切到 diagnosis tab.
 */
import { signal, computed } from "@preact/signals";
import { computeScores } from "../../stocks/diagnosis-scorer.js";
import { taggedLog } from "../log.js";
import { saveSnapshot } from "./diagnosis/diagnosisHistory.js";

const log = taggedLog("[diagnosis]");

// 诊断维度 (price_trend 价格趋势 / volume_turnover 量能换手 / valuation 估值 /
// profitability 盈利能力 / capital_flow 资金流向 / tech_indicators 技术指标 /
// news_buzz 新闻舆情 / peer_compare 同业对比 / moat_score 护城河 /
// earnings_forecast 业绩预期 / shareholders 股东结构 / corporate_events 股本事件)
// ponytail: 2026-07-07 — 删 industry_momentum (东财 90.BKxxxx 周末永远空) + margin_trading
// (节假日/小盘股经常无数据). 留 12 个里有数据的: 9 基础 + 3 新 (季频/静态).
export const ALL_ANGLES = [
  "price_trend",
  "volume_turnover",
  "valuation",
  "profitability",
  "capital_flow",
  "tech_indicators",
  "news_buzz",
  "peer_compare",
  "moat_score",
  "earnings_forecast",
  "shareholders",
  "corporate_events",
];

// ponytail: 前端不引用后端 angle-registry (那文件带 require,
// 会拖入 http 等 node builtins), 直接把 label 扁平写到这一处, 真值就在
// src/stocks/stock-detail-angles.js 的 ANGLE_DEFS, 增删时同步即可.
export const ANGLE_LABELS = {
  price_trend: "价格趋势",
  volume_turnover: "交易热度",
  valuation: "估值水位",
  profitability: "盈利能力",
  capital_flow: "资金流向",
  tech_indicators: "技术指标",
  news_buzz: "新闻舆情",
  peer_compare: "同业对比",
  moat_score: "护城河",
  earnings_forecast: "业绩预期",
  shareholders: "股东结构",
  corporate_events: "股本事件",
};

// ponytail: 2026-07-07 — 缺口条目带 reason / error, DataGapsIndicator 可渲染 tooltip
//          把"为什么缺"告诉用户 (后端 stock-detail-fetcher.js 已填 reason + error).
//          reasonText 把 reason 码翻成中文, 缺的字段兜底用 error 串.
const GAP_REASON_TEXT = {
  no_industry_data: "该股无行业归属数据, 跳过同业对比",
  fetch_failed: "数据源请求失败",
  parse_failed: "数据源返回格式异常",
  exception: "数据源调用异常",
  unknown: "未知原因",
};
function gapReasonText(gap) {
  const r = gap.reason || "unknown";
  return GAP_REASON_TEXT[r] || `${r}${gap.error ? `: ${gap.error}` : ""}`;
}

function computeDataGaps(perAngleData) {
  const gaps = [];
  for (const k of ALL_ANGLES) {
    const e = perAngleData && perAngleData[k];
    if (!e || e.status !== "ok") {
      gaps.push({
        key: k,
        label: ANGLE_LABELS[k] || k,
        reason: e ? e.reason || "unknown" : "missing",
        error: e ? e.error || null : null,
      });
    }
  }
  return gaps;
}

export { gapReasonText, GAP_REASON_TEXT };

// 当前 tab: "screen"=筛选 / "diagnosis"=个股分析
export const stockActiveTab = signal("screen");

export const stockDiagnosisCode = signal(null);

// 当前诊断股票信息 { code, name, industry, price?, changePct? } — 搜索选中时存完整信息,
// 不依赖筛选结果列表 (搜索诊断时 results 为空, 之前 hero 拿不到 name).
export const diagnosisStock = signal(null);

// 诊断页数据状态:
//   status: idle|loading|ready|error (数据拉取)
//   aiStatus: idle|loading|ready|error (AI 解读, 手动触发)
//   errorReason: 后端 reason 透出 (timeout / parse_failed / llm_failed / budget_exceeded / api_key_missing / auth_401 ...)
//   aiStartedAt: loading 起算时间戳 (ms), 前端用于显示已等待秒数, 避免"卡住"的体感
export const diagnosisState = signal({
  status: "idle",
  perAngleData: {},
  scores: null,
  aiResult: null,
  aiStatus: "idle",
  error: null,
  errorReason: null,
  aiStartedAt: null,
  // ponytail: 2026-07-07 P0-2 — 显式列出"哪几项数据拉不到", AI 解读前/中/后都可
  // 显示. 由前端现算 (用 ALL_ANGLES + perAngleData), 跟 aiResult.dataGaps 互补:
  // 这里是结构性缺口 (整条 angle 没拉到), aiResult.dataGaps 是"LLM 看到但没数据".
  dataGaps: [],
});

// ponytail: 2026-07-07 P1-1 — 核心数据 (perAngle + scores) 和 AI 解读不再串行.
// loadDiagnosis 只 fetch 数据 + 算分. AI 解读由用户在 VerdictCard 点「生成解读」手动触发,
// 避免一进诊断页就打 LLM 浪费 token. aiStatus 默认 idle (不主动跑), aiResult 为 null.
let _aiPromise = null;

// 开启诊断: 设 stock 信息 + 切 tab + 立即拉数据.
// stock 是 { code, name, industry? } (搜索联想项) 或 { code, name, price, changePct, ... } (筛选行).
export function openDiagnosis(api, stock) {
  const code = typeof stock === "string" ? stock : stock && stock.code;
  if (!code) return;
  diagnosisStock.value = typeof stock === "string" ? { code } : stock;
  stockDiagnosisCode.value = code;
  stockActiveTab.value = "diagnosis";
  if (api) {
    // 取消旧请求 (如果有) — 避免快速切换股票时旧 AI 覆盖新 AI
    _aiPromise = null;
    // ponytail: 2026-07-07 — token 必须等于 _runDiagnosisFlow 返回的 promise, 而
    // _runDiagnosisFlow 同步部分第一行拿到的 myToken 也是这个 promise. 但因为
    // _aiPromise = _runDiagnosisFlow(...) 这一行 = (进入函数同步部分) → (函数返回
    // promise 后赋值) — 同步部分第一行 myToken = _aiPromise 时 _aiPromise 还是 null.
    // 修法: 用占位 sentinel, 函数拿到 sentinel, 最后把它替换成真 promise.
    const token = Symbol("diagnosis-flow-token");
    _aiPromise = token; // 先占位, 函数能拿到同一引用
    const p = _runDiagnosisFlow(api, code, token);
    _aiPromise = p; // 立即替换成真 promise
  }
}

export function closeDiagnosis() {
  // 只切回筛选 tab, 保留 stockDiagnosisCode 当"最近分析过的股票"语义
  // (诊断 tab 顶部搜索框可重新选股覆盖它).
  stockActiveTab.value = "screen";
  // ponytail: 2026-07-07 — 清失败闪烁 + 排队 timer, 避免退出/重开后旧 timer 误触
  failedAngles.value = new Set();
  for (const t of _failedTimers.values()) clearTimeout(t);
  _failedTimers.clear();
  diagnosisState.value = {
    status: "idle",
    perAngleData: {},
    scores: null,
    aiResult: null,
    aiStatus: "idle",
    error: null,
    errorReason: null,
    aiStartedAt: null,
    dataGaps: [],
  };
}

async function _runDiagnosisFlow(api, code, token) {
  // ponytail: 2026-07-07 — token 从 openDiagnosis 传入 (Symbol 占位 → 真 promise),
  // 不再用 _aiPromise 捕获 (那时还是 null, 永远 mismatched).
  const myToken = token;
  diagnosisState.value = {
    ...diagnosisState.value,
    status: "loading",
    error: null,
    errorReason: null,
    aiStatus: "idle",
    aiStartedAt: null,
    dataGaps: [],
  };
  let perAngleData, scores;
  try {
    const resp = await api.stocksDetailAngles({ code, angles: ALL_ANGLES });
    if (!resp || !resp.ok) throw new Error(resp?.reason || "fetch_failed");
    perAngleData = (resp.data && resp.data.perAngle) || {};
    scores = computeScores(perAngleData);
  } catch (e) {
    if (_aiPromise !== myToken) return; // 已被新诊断取代
    diagnosisState.value = {
      ...diagnosisState.value,
      status: "error",
      perAngleData: {},
      scores: null,
      aiResult: null,
      aiStatus: "idle",
      error: e.message,
    };
    return;
  }
  // 同一 tick: 写回 ready. AI 解读不再自动 — 等用户在 VerdictCard 点「生成解读」按钮再触发,
  // 避免每次进诊断页就先打 LLM 浪费 token.
  commitReady(code, perAngleData, scores);
}

// ponytail: 2026-07-07 — "写 ready + 存历史快照" 抽出来, openDiagnosis / loadDiagnosis
//          (重试按钮) 都走同一处. 快照存 overall + 5 维 + 价格, 给 hero 徽标跨次对比用.
//          失败 / 缺 scores → 不存 (避免半成品写进历史).
function commitReady(code, perAngleData, scores) {
  diagnosisState.value = {
    ...diagnosisState.value,
    status: "ready",
    perAngleData,
    scores,
    dataGaps: computeDataGaps(perAngleData),
  };
  if (scores && scores.overall != null) {
    const stock = diagnosisStock.value;
    saveSnapshot(code, {
      overall: scores.overall,
      dimensions: scores.dimensions || {},
      price: stock && stock.price != null ? stock.price : null,
      signal: null,
    });
  }
}

// 拉数据 + 算分 (用于单点重拉, 不触发 AI). AI 由 openDiagnosis 触发.
export async function loadDiagnosis(api, code) {
  diagnosisState.value = {
    ...diagnosisState.value,
    status: "loading",
    error: null,
  };
  try {
    const resp = await api.stocksDetailAngles({ code, angles: ALL_ANGLES });
    if (!resp || !resp.ok) throw new Error(resp?.reason || "fetch_failed");
    const perAngleData = (resp.data && resp.data.perAngle) || {};
    const scores = computeScores(perAngleData);
    commitReady(code, perAngleData, scores);
  } catch (e) {
    diagnosisState.value = {
      ...diagnosisState.value,
      status: "error",
      error: e.message,
    };
  }
}

// 手动触发 AI 解读 (用户点「生成 AI 解读」按钮).
// ponytail: 2026-07-07 — 后端 reason 透出到前端 (避免笼统 "ai_failed"), 用户看到具体原因
// (网络超时 / parse 失败 / 预算超限 / 缺 key 等) 可以针对性重试. 同时记日志便于排查.
// ponytail: 2026-07-07 P1-1 — 接受 override 入参, 允许调用方在 store 写回 ready 之前就
// 启动 AI 解读 (真并行); override 缺省时回退到读 store.
export async function requestAiSummary(api, code, override) {
  const perAngleData =
    (override && override.perAngleData) || diagnosisState.value.perAngleData;
  const scores = (override && override.scores) || diagnosisState.value.scores;
  if (!perAngleData || !scores) return;
  const t0 = Date.now();
  diagnosisState.value = {
    ...diagnosisState.value,
    aiStatus: "loading",
    error: null,
    errorReason: null,
    aiStartedAt: t0,
  };
  try {
    const aiResp = await api.stocksDetailAnalyze({
      code,
      angles: ALL_ANGLES,
      perAngleData,
      scores,
    });
    if (aiResp && aiResp.ok) {
      diagnosisState.value = {
        ...diagnosisState.value,
        aiResult: aiResp.result,
        aiStatus: "ready",
        error: null,
        errorReason: null,
        aiStartedAt: null,
      };
    } else {
      const reason = (aiResp && aiResp.reason) || "unknown";
      const detail = (aiResp && aiResp.error) || null;
      log.warn(
        `AI analyze failed: code=${code} reason=${reason} elapsed=${Date.now() - t0}ms`,
        detail || "",
      );
      diagnosisState.value = {
        ...diagnosisState.value,
        aiResult: null,
        aiStatus: "error",
        error: reason,
        errorReason: reason,
        aiStartedAt: null,
      };
    }
  } catch (aiErr) {
    log.warn(
      `AI analyze exception: code=${code} elapsed=${Date.now() - t0}ms`,
      aiErr,
    );
    diagnosisState.value = {
      ...diagnosisState.value,
      aiResult: null,
      aiStatus: "error",
      error: "internal_error",
      errorReason: "internal_error",
      aiStartedAt: null,
    };
  }
}

// ponytail: 2026-07-07 P1-2 — 单条 angle 的本地重解读, 不调 LLM. 把新 note 写回
// aiResult.perAngle[angleKey], 0.05s 出新句. refreshingAngles 单独 signal, 避免
// 触发整个 diagnosisState 的订阅.
export const refreshingAngles = signal(new Set());

// ponytail: 2026-07-07 — 失败闪烁: 跟 refreshingAngles 互斥 (失败时才进).
//          2 秒后自动清, 给按钮闪一下红 + 一行 toast 类提示 (AiNoteLine 内部渲染).
export const failedAngles = signal(new Set());

export async function refreshAngle(api, angleKey) {
  const { perAngleData, aiResult, scores } = diagnosisState.value;
  if (!api || !angleKey) return;
  const next = new Set(refreshingAngles.value);
  next.add(angleKey);
  refreshingAngles.value = next;
  try {
    const resp = await api.stocksAngleRefresh({
      angleKey,
      perAngleData,
      scores,
      seed: Date.now() % 1e9,
    });
    if (resp && resp.ok && resp.note) {
      const cur = diagnosisState.value.aiResult || aiResult || {};
      const nextPerAngle = { ...(cur.perAngle || {}), [angleKey]: resp.note };
      diagnosisState.value = {
        ...diagnosisState.value,
        aiResult: { ...cur, perAngle: nextPerAngle },
      };
    } else {
      // ponytail: 后端返 ok=false 时也算失败 (用户视角: 没拿到新句). reason 透出日志.
      log.warn(
        `refreshAngle ${angleKey} no-note: reason=${(resp && resp.reason) || "unknown"}`,
      );
      markAngleFailed(angleKey);
    }
  } catch (e) {
    log.warn(`refreshAngle ${angleKey} failed`, e);
    markAngleFailed(angleKey);
  } finally {
    const done = new Set(refreshingAngles.value);
    done.delete(angleKey);
    refreshingAngles.value = done;
  }
}

// ponytail: 失败闪烁的 setTimeout 句柄, 切换股票 / 快速重试时清理掉旧 timer
//          (否则会"已经成功 5 秒了又被旧 timer 改回 failed").
const _failedTimers = new Map();
function markAngleFailed(angleKey) {
  const failed = new Set(failedAngles.value);
  failed.add(angleKey);
  failedAngles.value = failed;
  if (_failedTimers.has(angleKey)) clearTimeout(_failedTimers.get(angleKey));
  const t = setTimeout(() => {
    const cur = new Set(failedAngles.value);
    if (cur.delete(angleKey)) failedAngles.value = cur;
    _failedTimers.delete(angleKey);
  }, 2000);
  _failedTimers.set(angleKey, t);
}
