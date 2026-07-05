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

// 诊断维度 (price_trend 价格趋势 / volume_turnover 量能换手 / valuation 估值 /
// profitability 盈利能力 / capital_flow 资金流向 / tech_indicators 技术指标 /
// news_buzz 新闻舆情 / peer_compare 同业对比 / moat_score 护城河)
export const ALL_ANGLES = ["price_trend","volume_turnover","valuation","profitability","capital_flow","tech_indicators","news_buzz","peer_compare","moat_score"];

// 当前 tab: "screen"=筛选 / "diagnosis"=个股分析
export const stockActiveTab = signal("screen");

export const stockDiagnosisCode = signal(null);

// 诊断页数据状态: { status, perAngleData, scores, aiResult, error }
export const diagnosisState = signal({ status: "idle", perAngleData: {}, scores: null, aiResult: null, error: null });

// 开启诊断: 设 code + 切 tab + 立即拉数据 (调用方传 api).
// 不依赖 page 的 useEffect 响应 signal (signal+effect 在某些时序下会漏触发),
// 改为调用方直接触发 loadDiagnosis, 最可靠.
export function openDiagnosis(api, code) {
  stockDiagnosisCode.value = code;
  stockActiveTab.value = "diagnosis";
  if (api && code) loadDiagnosis(api, code);
}

export function closeDiagnosis() {
  // 只切回筛选 tab, 保留 stockDiagnosisCode 当"最近分析过的股票"语义
  // (诊断 tab 顶部搜索框可重新选股覆盖它).
  stockActiveTab.value = "screen";
  diagnosisState.value = { status: "idle", perAngleData: {}, scores: null, aiResult: null, error: null };
}

// 拉数据 + 算分 + AI 解读 (进页自动调用)
export async function loadDiagnosis(api, code) {
  diagnosisState.value = { ...diagnosisState.value, status: "loading", error: null };
  try {
    const resp = await api.stocksDetailAngles({ code, angles: ALL_ANGLES });
    if (!resp || !resp.ok) throw new Error(resp?.reason || "fetch_failed");
    // resp.data 结构: { perAngle: {angle: {status,data}}, fulfilledCount, totalCount }
    // computeScores / ModuleGrid 需要的是 perAngle 这个 angle map
    const perAngleData = (resp.data && resp.data.perAngle) || {};
    const scores = computeScores(perAngleData);
    diagnosisState.value = { status: "ready", perAngleData, scores, aiResult: null, error: null };
    // AI 解读 (后台, 不阻塞数据展示)
    try {
      const aiResp = await api.stocksDetailAnalyze({ code, perAngleData, scores });
      if (aiResp && aiResp.ok) {
        diagnosisState.value = { ...diagnosisState.value, aiResult: aiResp.result };
      } else {
        diagnosisState.value = { ...diagnosisState.value, aiResult: null, error: "ai_failed" };
      }
    } catch (aiErr) {
      diagnosisState.value = { ...diagnosisState.value, aiResult: null, error: "ai_failed" };
    }
  } catch (e) {
    diagnosisState.value = { status: "error", perAngleData: {}, scores: null, aiResult: null, error: e.message };
  }
}
