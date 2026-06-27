import { PageHeader } from "./PageHeader.jsx";
import { AIInsightsBlock } from "./AIInsightsBlock.jsx";

export function InsightsPage() {
  return (
    <div class="insights-page">
      <PageHeader title="AI 洞察" subtitle="AI 总结 + Release Notes" />
      <div class="insights-content">
        <AIInsightsBlock />
        <p>TODO: Release Notes in-place widget</p>
      </div>
    </div>
  );
}

export default InsightsPage;