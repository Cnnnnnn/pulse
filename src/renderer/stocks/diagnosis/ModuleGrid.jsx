import { FundamentalsCard } from "./FundamentalsCard.jsx";
import { ValuationCard } from "./ValuationCard.jsx";
import { CapitalFlowCard } from "./CapitalFlowCard.jsx";
import { TechCard } from "./TechCard.jsx";
import { NewsCard } from "./NewsCard.jsx";
import { RiskCard } from "./RiskCard.jsx";

export function ModuleGrid({ perAngleData, aiResult }) {
  const risks = aiResult?.risks || [];
  return (
    <div class="module-grid">
      <FundamentalsCard data={perAngleData.profitability} />
      <ValuationCard data={perAngleData.valuation} />
      <CapitalFlowCard data={perAngleData.capital_flow} />
      <TechCard data={perAngleData.tech_indicators} />
      <NewsCard data={perAngleData.news_buzz} />
      <RiskCard risks={risks} />
    </div>
  );
}

export default ModuleGrid;
