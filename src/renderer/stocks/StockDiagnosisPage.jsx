import { stockDiagnosisCode, diagnosisState, loadDiagnosis } from "./diagnosisStore.js";
import { results } from "./stockStore.js";
import { closeDiagnosis } from "./diagnosisStore.js";
import { VerdictCard } from "./diagnosis/VerdictCard.jsx";
import { DimensionScores } from "./diagnosis/DimensionScores.jsx";
import { ModuleGrid } from "./diagnosis/ModuleGrid.jsx";
import { StockSearchInput } from "./StockSearchInput.jsx";

const RATING_LABEL = (s) => (s == null ? "数据不足" : s >= 7.5 ? "强烈" : s >= 6 ? "中性偏强" : s >= 4 ? "中性" : "偏弱");

export function StockDiagnosisPage({ api }) {
  const code = stockDiagnosisCode.value;
  const state = diagnosisState.value;
  const stock = results.value.find((r) => r.code === code) || { code };
  const overall = state.scores?.overall;

  return (
    <div class="stock-diagnosis-page">
      {/* 顶部搜索条: 返回 + 搜索框 (紧凑一行) */}
      <div class="diagnosis-toolbar">
        <button type="button" class="diagnosis-back" data-testid="diagnosis-back" onClick={closeDiagnosis}>
          ← 选股
        </button>
        <StockSearchInput api={api} />
      </div>

      {/* Hero 横幅: 股票信息 + 评级徽标 (撑满宽) */}
      <div class="diagnosis-hero">
        <div class="diagnosis-hero-info">
          <div class="diagnosis-hero-title">
            {stock?.name || code} <span class="diagnosis-hero-code">{code}</span>
          </div>
          {stock?.price != null && (
            <div class={`diagnosis-hero-price ${stock.changePct >= 0 ? "up" : "down"}`}>
              ¥{stock.price} {stock.changePct >= 0 ? "+" : ""}{stock.changePct}%
            </div>
          )}
        </div>
        {overall != null && (
          <div class="diagnosis-rating-box">
            <div class="diagnosis-rating-num">{overall}<span class="diagnosis-rating-max">/10</span></div>
            <div class="diagnosis-rating-label">{RATING_LABEL(overall)}</div>
          </div>
        )}
      </div>

      {/* 报告区: 双列 — 左 AI解读+评分, 右 数据模块 */}
      {state.status === "loading" && <div class="diagnosis-loading">正在生成诊断报告…</div>}
      {state.status === "error" && (
        <div class="diagnosis-error">
          报告生成失败：{state.error}
          <button onClick={() => loadDiagnosis(api, code)}>重试</button>
        </div>
      )}
      {state.status === "ready" && (
        <>
          <div class="diagnosis-report-grid">
            <DimensionScores scores={state.scores} />
            <ModuleGrid perAngleData={state.perAngleData} aiResult={state.aiResult} />
          </div>
          <VerdictCard scores={state.scores} aiResult={state.aiResult} aiStatus={state.aiStatus} api={api} code={code} />
        </>
      )}
      <div class="diagnosis-disclaimer">AI 仅供参考，不构成投资建议</div>
    </div>
  );
}

export default StockDiagnosisPage;
