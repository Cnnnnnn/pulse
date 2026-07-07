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

// ponytail: 2026-07-07 — peer_compare 没有自己的 card (PE/PB 跟 ValuationCard 重复),
//          把行业分位条直接注入到 ValuationCard 和 FundamentalsCard.
//          peerCompare 拿不到时 (failed) 两张 card 退化为现状.
function extractPeerCompare(perAngleData) {
  const e = perAngleData && perAngleData.peer_compare;
  if (!e || e.status !== "ok") return null;
  return e.data || null;
}

export function ModuleGrid({ perAngleData, aiResult, api, scores, onRefreshAngle, refreshing, failed }) {
  const risks = aiResult?.risks || [];
  const perAngle = (aiResult && aiResult.perAngle) || {};
  const aiReady = !!aiResult;
  const busy = refreshing || new Set();
  const failedSet = failed || new Set();
  const makeRefresh = (k) => onRefreshAngle ? () => onRefreshAngle(k) : null;
  const peerCompare = extractPeerCompare(perAngleData);
  return (
    <div class="module-grid">
      <div class="module-card-wrap">
        {aiReady && perAngle.profitability && (
          <AiNoteLine note={perAngle.profitability} refreshing={busy.has("profitability")} onRefresh={makeRefresh("profitability")} failed={failedSet.has("profitability")} />
        )}
        <FundamentalsCard data={perAngleData.profitability} peerCompare={peerCompare} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.valuation && (
          <AiNoteLine note={perAngle.valuation} refreshing={busy.has("valuation")} onRefresh={makeRefresh("valuation")} failed={failedSet.has("valuation")} />
        )}
        <ValuationCard data={perAngleData.valuation} peerCompare={peerCompare} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.capital_flow && (
          <AiNoteLine note={perAngle.capital_flow} refreshing={busy.has("capital_flow")} onRefresh={makeRefresh("capital_flow")} failed={failedSet.has("capital_flow")} />
        )}
        <CapitalFlowCard data={perAngleData.capital_flow} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.tech_indicators && (
          <AiNoteLine note={perAngle.tech_indicators} refreshing={busy.has("tech_indicators")} onRefresh={makeRefresh("tech_indicators")} failed={failedSet.has("tech_indicators")} />
        )}
        <TechCard data={perAngleData.tech_indicators} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.news_buzz && (
          <AiNoteLine note={perAngle.news_buzz} refreshing={busy.has("news_buzz")} onRefresh={makeRefresh("news_buzz")} failed={failedSet.has("news_buzz")} />
        )}
        <NewsCard data={perAngleData.news_buzz} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.earnings_forecast && (
          <AiNoteLine note={perAngle.earnings_forecast} refreshing={busy.has("earnings_forecast")} onRefresh={makeRefresh("earnings_forecast")} failed={failedSet.has("earnings_forecast")} />
        )}
        <EarningsForecastCard data={perAngleData.earnings_forecast} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.shareholders && (
          <AiNoteLine note={perAngle.shareholders} refreshing={busy.has("shareholders")} onRefresh={makeRefresh("shareholders")} failed={failedSet.has("shareholders")} />
        )}
        <ShareholdersCard data={perAngleData.shareholders} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.corporate_events && (
          <AiNoteLine note={perAngle.corporate_events} refreshing={busy.has("corporate_events")} onRefresh={makeRefresh("corporate_events")} failed={failedSet.has("corporate_events")} />
        )}
        <CorporateEventsCard data={perAngleData.corporate_events} />
      </div>
      <RiskCard risks={risks} />
    </div>
  );
}

export default ModuleGrid;