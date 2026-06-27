/**
 * src/renderer/components/OverviewPage.jsx
 *
 * 默认路由 /versions/overview. KPI 立即渲染, 其他 4 个 lazy 加载.
 *
 * IPC 响应形状 (实测, 跟 plan 略有不同):
 *   versionsOverviewKpis       → { upgradable, latest, error, total }
 *   versionsOverviewTrend      → number[]  (7 天, 直接是数组)
 *   versionsOverviewWatchlist  → Array<{ name, has_update }>
 *   versionsOverviewRecent     → Array<{ kind, appName, ts }>
 *   versionsOverviewAiInsights → { ok: true, text, fromCache } | { ok: false, reason, error }
 */
import { useEffect } from "preact/hooks";
import { PageHeader } from "./PageHeader.jsx";
import { KPICard } from "./KPICard.jsx";
import { TrendSparkline } from "./TrendSparkline.jsx";
import { WatchlistQuick } from "./WatchlistQuick.jsx";
import { RecentTimeline } from "./RecentTimeline.jsx";
import { AIInsightsBlock } from "./AIInsightsBlock.jsx";
import {
  kpis, trend,
  setKpis, setTrend, setWatchlistQuick, setRecentActivity, setAiInsights,
} from "../overview-store.js";
import { api } from "../api.js";

export function OverviewPage() {
  const k = kpis.value;
  const t = trend.value;

  useEffect(() => {
    // KPI instant
    if (api.versionsOverviewKpis) {
      api.versionsOverviewKpis().then((r) => { if (r) setKpis(r); });
    }
    // Trend lazy 100ms
    const t1 = setTimeout(() => {
      if (!api.versionsOverviewTrend) return;
      api.versionsOverviewTrend().then((arr) => { if (Array.isArray(arr)) setTrend(arr); });
    }, 100);
    // Watchlist lazy 200ms
    const t2 = setTimeout(() => {
      if (!api.versionsOverviewWatchlist) return;
      api.versionsOverviewWatchlist().then((arr) => { if (Array.isArray(arr)) setWatchlistQuick(arr); });
    }, 200);
    // Recent lazy 300ms
    const t3 = setTimeout(() => {
      if (!api.versionsOverviewRecent) return;
      api.versionsOverviewRecent().then((arr) => { if (Array.isArray(arr)) setRecentActivity(arr); });
    }, 300);
    // AI insights lazy 500ms
    const t4 = setTimeout(() => {
      if (!api.versionsOverviewAiInsights) return;
      setAiInsights({ status: "loading", text: "", fromCache: false });
      api.versionsOverviewAiInsights().then((r) => {
        if (r && r.ok) setAiInsights({ status: "ready", text: r.text || "", fromCache: !!r.fromCache });
        else setAiInsights({ status: "error", text: "", fromCache: false });
      });
    }, 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  return (
    <div class="overview-page">
      <PageHeader title="总览" subtitle={`${k.total} 个 app · ${k.upgradable} 个可升级`} />
      <div class="kpi-grid">
        <KPICard label="可升级" value={k.upgradable} variant="warning" />
        <KPICard label="最新" value={k.latest} variant="success" />
        <KPICard label="出错" value={k.error} variant="danger" />
        <KPICard label="总监控" value={k.total} variant="default" />
      </div>
      <div class="overview-section">
        <h3 class="overview-section-title">过去 7 天趋势</h3>
        <div class="trend-sparkline">
          <TrendSparkline data={t} />
        </div>
      </div>
      <div class="overview-grid">
        <WatchlistQuick />
        <RecentTimeline />
      </div>
      <AIInsightsBlock />
    </div>
  );
}

export default OverviewPage;