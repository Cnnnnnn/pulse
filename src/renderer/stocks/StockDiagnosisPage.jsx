import { stockDiagnosisCode, diagnosisState, diagnosisStock, loadDiagnosis, refreshAngle, refreshingAngles } from "./diagnosisStore.js";
import { closeDiagnosis } from "./diagnosisStore.js";
import { VerdictCard } from "./diagnosis/VerdictCard.jsx";
import { DimensionScores } from "./diagnosis/DimensionScores.jsx";
import { ModuleGrid } from "./diagnosis/ModuleGrid.jsx";
import { DataGapsIndicator } from "./diagnosis/DataGapsIndicator.jsx";
import { StockSearchInput } from "./StockSearchInput.jsx";

const RATING_LABEL = (s) => (s == null ? "数据不足" : s >= 7.5 ? "强烈" : s >= 6 ? "中性偏强" : s >= 4 ? "中性" : "偏弱");

export function StockDiagnosisPage({ api }) {
  const code = stockDiagnosisCode.value;
  const state = diagnosisState.value;
  const stock = diagnosisStock.value || { code };
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
        // ponytail: 整段报告 + AI 解读放进同一个滚动容器, 跟 hero / toolbar 视觉连续,
        //          没有"上半屏卡住, 下半屏独立滚" 的割裂感. 2026-07-06 合并.
        <div class="diagnosis-report-grid">
          {/* ponytail: 2026-07-07 P0-2 — 顶部条告诉用户"哪几项数据缺口". 整页只
              出现一次, 不在每张 card 上重复 (避免噪声). gaps 为空时不渲染. */}
          <DataGapsIndicator gaps={state.dataGaps} />
          <DimensionScores scores={state.scores} />
          <ModuleGrid
            perAngleData={state.perAngleData}
            aiResult={state.aiResult}
            api={api}
            scores={state.scores}
            onRefreshAngle={(k) => refreshAngle(api, k)}
            refreshing={refreshingAngles.value}
          />
          <VerdictCard
            scores={state.scores}
            aiResult={state.aiResult}
            aiStatus={state.aiStatus}
            errorReason={state.errorReason}
            aiStartedAt={state.aiStartedAt}
            api={api}
            code={code}
          />
        </div>
      )}
      <div class="diagnosis-disclaimer">AI 仅供参考，不构成投资建议</div>
    </div>
  );
}

export default StockDiagnosisPage;
