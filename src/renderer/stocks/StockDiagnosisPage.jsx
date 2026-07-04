import { useEffect } from "preact/hooks";
import { stockDiagnosisCode, diagnosisState, loadDiagnosis } from "./diagnosisStore.js";
import { results } from "./stockStore.js";
import { StockDiagnosisHeader } from "./diagnosis/StockDiagnosisHeader.jsx";
import { VerdictCard } from "./diagnosis/VerdictCard.jsx";
import { DimensionScores } from "./diagnosis/DimensionScores.jsx";
import { ModuleGrid } from "./diagnosis/ModuleGrid.jsx";
import { StockSearchInput } from "./StockSearchInput.jsx";

export function StockDiagnosisPage({ api }) {
  const code = stockDiagnosisCode.value;
  const state = diagnosisState.value;
  const stock = results.value.find((r) => r.code === code) || { code };

  useEffect(() => {
    if (code) loadDiagnosis(api, code);
  }, [code]);

  return (
    <div class="stock-diagnosis-page">
      <StockSearchInput api={api} />
      <StockDiagnosisHeader stock={stock} scores={state.scores} />
      <div class="stock-diagnosis-report">
        {state.status === "loading" && <div class="diagnosis-loading">正在生成诊断报告…</div>}
        {state.status === "error" && (
          <div class="diagnosis-error">
            报告生成失败：{state.error}
            <button onClick={() => loadDiagnosis(api, code)}>重试</button>
          </div>
        )}
        {state.status === "ready" && (
          <>
            <VerdictCard scores={state.scores} aiResult={state.aiResult} />
            <DimensionScores scores={state.scores} />
            <ModuleGrid perAngleData={state.perAngleData} aiResult={state.aiResult} />
            <div class="diagnosis-disclaimer">AI 仅供参考，不构成投资建议</div>
          </>
        )}
      </div>
    </div>
  );
}

export default StockDiagnosisPage;
