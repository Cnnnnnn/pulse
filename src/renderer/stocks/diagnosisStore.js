/**
 * 个股诊断报告页 state. Spec: 2026-07-04-stock-diagnosis-redesign-design.md
 * stockDiagnosisCode = null → 选股表格; 有值 → 全屏诊断页.
 */
import { signal, computed } from "@preact/signals";
import { computeScores } from "../../stocks/diagnosis-scorer.js";

export const stockDiagnosisCode = signal(null);

// 诊断页数据状态: { status, perAngleData, scores, aiResult, error }
export const diagnosisState = signal({ status: "idle", perAngleData: {}, scores: null, aiResult: null, error: null });

export function openDiagnosis(code) {
  stockDiagnosisCode.value = code;
}

export function closeDiagnosis() {
  stockDiagnosisCode.value = null;
  diagnosisState.value = { status: "idle", perAngleData: {}, scores: null, aiResult: null, error: null };
}

// 拉数据 + 算分 + AI 解读 (进页自动调用)
export async function loadDiagnosis(api, code) {
  diagnosisState.value = { ...diagnosisState.value, status: "loading", error: null };
  try {
    const ALL_ANGLES = ["price_trend","volume_turnover","valuation","profitability","capital_flow","tech_indicators","news_buzz","peer_compare","moat_score"];
    const resp = await api.stocksDetailAngles({ code, angles: ALL_ANGLES });
    if (!resp || !resp.ok) throw new Error(resp?.reason || "fetch_failed");
    const perAngleData = resp.data || {};
    const scores = computeScores(perAngleData);
    diagnosisState.value = { status: "ready", perAngleData, scores, aiResult: null, error: null };
    // AI 解读 (后台, 不阻塞数据展示)
    try {
      const aiResp = await api.stocksDetailAnalyze({ code, perAngleData, scores });
      if (aiResp && aiResp.ok) {
        diagnosisState.value = { ...diagnosisState.value, aiResult: aiResp.result };
      }
    } catch (aiErr) {
      diagnosisState.value = { ...diagnosisState.value, aiResult: null, error: "ai_failed" };
    }
  } catch (e) {
    diagnosisState.value = { status: "error", perAngleData: {}, scores: null, aiResult: null, error: e.message };
  }
}
