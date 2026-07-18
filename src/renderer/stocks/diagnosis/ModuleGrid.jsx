import { FundamentalsCard } from "./FundamentalsCard.jsx";
import { ValuationCard } from "./ValuationCard.jsx";
import { CapitalFlowCard } from "./CapitalFlowCard.jsx";
import { TechCard } from "./TechCard.jsx";
import { NewsCard } from "./NewsCard.jsx";
import { RiskCard } from "./RiskCard.jsx";
import { EarningsForecastCard } from "./EarningsForecastCard.jsx";
import { ShareholdersCard } from "./ShareholdersCard.jsx";
import { CorporateEventsCard } from "./CorporateEventsCard.jsx";
import { PeerCompareCard } from "./PeerCompareCard.jsx";
import { AiNoteLine } from "./AiNoteLine.jsx";
import { computeBasicRisks } from "../../../stocks/diagnosis-scorer.js";

// ponytail: 2026-07-07 — peer_compare 现在独立成 PeerCompareCard (用户反馈"看不到同业对比").
// 还在 FundamentalsCard / ValuationCard 留 sub-section (本股 PE/PB / ROE/毛利率 vs 行业中位,
//  跟具体 card 的上下文相关). peerCompare 拿不到时 (failed) 两张 card 退化为无对比条.
function extractPeerCompare(perAngleData) {
  const e = perAngleData && perAngleData.peer_compare;
  if (!e || e.status !== "ok") return null;
  return e.data || null;
}

// ponytail: 2026-07-07 — AI 解读改手动后, RiskCard 不再等 LLM. 基础风险清单由
// computeBasicRisks 规则版给出 (估值/资金/业绩/舆情/解禁); AI 跑了之后再把 aiResult.risks
// 合并 (去重), 避免 LLM 重复出基础项. 都没信号 → 空 (走老 "暂无明显风险信号" 兜底).
function mergeRisks(basic, ai) {
  const aiRisks = Array.isArray(ai) ? ai : [];
  if (aiRisks.length === 0) return basic;
  // 简单去重: 包含子串算重复. LLM 通常用词比规则版长, 包含关系是常见形态.
  const seen = new Set();
  const out = [];
  for (const r of [...basic, ...aiRisks]) {
    if (!r || typeof r !== "string") continue;
    const norm = r.replace(/\s+/g, "").toLowerCase();
    let dup = false;
    for (const s of seen) {
      if (s.includes(norm) || norm.includes(s)) { dup = true; break; }
    }
    if (!dup) { seen.add(norm); out.push(r); }
  }
  return out;
}

// ponytail 2026-07-18 P0-1 T8: 9 张诊断卡统一传 angle (= perAngleData[k]) +
//   onRefresh (= () => onRefreshAngle(k)). ModuleCard 已经接这两 prop,
//   DataHealthPill 会自动渲 4 态 + failed retry 按钮. 改 keep 不新增 prop 总数.
export function ModuleGrid({ perAngleData, aiResult, api, scores, onRefreshAngle, refreshing, failed }) {
  const basicRisks = computeBasicRisks(perAngleData || {});
  const risks = mergeRisks(basicRisks, aiResult?.risks);
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
        <FundamentalsCard data={perAngleData.profitability} angle={perAngleData.profitability} onRefresh={makeRefresh("profitability")} peerCompare={peerCompare} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.valuation && (
          <AiNoteLine note={perAngle.valuation} refreshing={busy.has("valuation")} onRefresh={makeRefresh("valuation")} failed={failedSet.has("valuation")} />
        )}
        <ValuationCard data={perAngleData.valuation} angle={perAngleData.valuation} onRefresh={makeRefresh("valuation")} peerCompare={peerCompare} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.peer_compare && (
          <AiNoteLine note={perAngle.peer_compare} refreshing={busy.has("peer_compare")} onRefresh={makeRefresh("peer_compare")} failed={failedSet.has("peer_compare")} />
        )}
        <PeerCompareCard data={perAngleData.peer_compare} angle={perAngleData.peer_compare} onRefresh={makeRefresh("peer_compare")} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.capital_flow && (
          <AiNoteLine note={perAngle.capital_flow} refreshing={busy.has("capital_flow")} onRefresh={makeRefresh("capital_flow")} failed={failedSet.has("capital_flow")} />
        )}
        <CapitalFlowCard data={perAngleData.capital_flow} angle={perAngleData.capital_flow} onRefresh={makeRefresh("capital_flow")} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.tech_indicators && (
          <AiNoteLine note={perAngle.tech_indicators} refreshing={busy.has("tech_indicators")} onRefresh={makeRefresh("tech_indicators")} failed={failedSet.has("tech_indicators")} />
        )}
        <TechCard data={perAngleData.tech_indicators} angle={perAngleData.tech_indicators} onRefresh={makeRefresh("tech_indicators")} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.news_buzz && (
          <AiNoteLine note={perAngle.news_buzz} refreshing={busy.has("news_buzz")} onRefresh={makeRefresh("news_buzz")} failed={failedSet.has("news_buzz")} />
        )}
        <NewsCard data={perAngleData.news_buzz} angle={perAngleData.news_buzz} onRefresh={makeRefresh("news_buzz")} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.earnings_forecast && (
          <AiNoteLine note={perAngle.earnings_forecast} refreshing={busy.has("earnings_forecast")} onRefresh={makeRefresh("earnings_forecast")} failed={failedSet.has("earnings_forecast")} />
        )}
        <EarningsForecastCard data={perAngleData.earnings_forecast} angle={perAngleData.earnings_forecast} onRefresh={makeRefresh("earnings_forecast")} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.shareholders && (
          <AiNoteLine note={perAngle.shareholders} refreshing={busy.has("shareholders")} onRefresh={makeRefresh("shareholders")} failed={failedSet.has("shareholders")} />
        )}
        <ShareholdersCard data={perAngleData.shareholders} angle={perAngleData.shareholders} onRefresh={makeRefresh("shareholders")} />
      </div>
      <div class="module-card-wrap">
        {aiReady && perAngle.corporate_events && (
          <AiNoteLine note={perAngle.corporate_events} refreshing={busy.has("corporate_events")} onRefresh={makeRefresh("corporate_events")} failed={failedSet.has("corporate_events")} />
        )}
        <CorporateEventsCard data={perAngleData.corporate_events} angle={perAngleData.corporate_events} onRefresh={makeRefresh("corporate_events")} />
      </div>
      <RiskCard risks={risks} />
    </div>
  );
}

export default ModuleGrid;