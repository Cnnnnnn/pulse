import { FundamentalsCard } from "./FundamentalsCard.jsx";
import { ValuationCard } from "./ValuationCard.jsx";
import { CapitalFlowCard } from "./CapitalFlowCard.jsx";
import { TechCard } from "./TechCard.jsx";
import { NewsCard } from "./NewsCard.jsx";
import { RiskCard } from "./RiskCard.jsx";
import { EarningsForecastCard } from "./EarningsForecastCard.jsx";
import { ShareholdersCard } from "./ShareholdersCard.jsx";
import { CorporateEventsCard } from "./CorporateEventsCard.jsx";
import { AiNoteLine } from "./AiNoteLine.jsx";

export function ModuleGrid({ perAngleData, aiResult, api, scores, onRefreshAngle, refreshing }) {
  const risks = aiResult?.risks || [];
  const perAngle = (aiResult && aiResult.perAngle) || {};
  const aiReady = !!aiResult;
  const busy = refreshing || new Set();
  const makeRefresh = (k) => onRefreshAngle ? () => onRefreshAngle(k) : null;
  return (
    <div class="module-grid">
      <div class="module-card-wrap">
        {aiReady && perAngle.profitability && (
          <AiNoteLine note={perAngle.profitability} refreshing={busy.has("profitability")} onRefresh={makeRefresh("profitability")} />
        )}
        <FundamentalsCard data={perAngleData.profitability} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.valuation && (
          <AiNoteLine note={perAngle.valuation} refreshing={busy.has("valuation")} onRefresh={makeRefresh("valuation")} />
        )}
        <ValuationCard data={perAngleData.valuation} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.capital_flow && (
          <AiNoteLine note={perAngle.capital_flow} refreshing={busy.has("capital_flow")} onRefresh={makeRefresh("capital_flow")} />
        )}
        <CapitalFlowCard data={perAngleData.capital_flow} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.tech_indicators && (
          <AiNoteLine note={perAngle.tech_indicators} refreshing={busy.has("tech_indicators")} onRefresh={makeRefresh("tech_indicators")} />
        )}
        <TechCard data={perAngleData.tech_indicators} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.news_buzz && (
          <AiNoteLine note={perAngle.news_buzz} refreshing={busy.has("news_buzz")} onRefresh={makeRefresh("news_buzz")} />
        )}
        <NewsCard data={perAngleData.news_buzz} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.earnings_forecast && (
          <AiNoteLine note={perAngle.earnings_forecast} refreshing={busy.has("earnings_forecast")} onRefresh={makeRefresh("earnings_forecast")} />
        )}
        <EarningsForecastCard data={perAngleData.earnings_forecast} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.shareholders && (
          <AiNoteLine note={perAngle.shareholders} refreshing={busy.has("shareholders")} onRefresh={makeRefresh("shareholders")} />
        )}
        <ShareholdersCard data={perAngleData.shareholders} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.corporate_events && (
          <AiNoteLine note={perAngle.corporate_events} refreshing={busy.has("corporate_events")} onRefresh={makeRefresh("corporate_events")} />
        )}
        <CorporateEventsCard data={perAngleData.corporate_events} />
      </div>
      <RiskCard risks={risks} />
    </div>
  );
}

export default ModuleGrid;
