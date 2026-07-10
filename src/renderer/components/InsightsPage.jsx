/**
 * src/renderer/components/InsightsPage.jsx
 *
 * AI 洞察页 (版本检查 4-tab 容器中的 "洞察" tab).
 *
 * 三块内容:
 *   1. KPI 行 — 从 results signal 派生 可升级 / 最新 / 出错 / 总数
 *   2. AI 总览摘要 — mount 时触发 versionsOverviewAiInsights (之前没有调用方),
 *      复用 overview-store 的 aiInsights signal + AIInsightsBlock 渲染.
 *   3. 可升级 app 列表 — 每行展开后用 ChangelogSummary 按 app 拉取 "本版要点".
 *
 * 数据源:
 *   - results (check-store): name -> result, 派生 KPI + 可升级列表
 *   - api.versionsOverviewAiInsights(): 整体 AI 总览 (带 24h 缓存)
 *   - ChangelogSummary({ appName }): per-app changelog AI 摘要
 */
import { useEffect, useMemo, useState } from "preact/hooks";
import { results } from "../store.js";
import { aiInsights, setAiInsights } from "../overview-store.js";
import { api } from "../api.js";
import { navigateTo } from "../route-store.js";
import { PageHeader } from "./PageHeader.jsx";
import { AIInsightsBlock } from "./AIInsightsBlock.jsx";
import { ChangelogSummary } from "./ChangelogSummary.jsx";
import { AppAvatar } from "./AppAvatar.jsx";
import { DrawerEmpty } from "./EmptyState.jsx";
import { IconSparkles, IconArrowUp, IconRefresh } from "./icons.jsx";

export function InsightsPage() {
  // ── 1. 从 results 派生 KPI + 可升级列表 ──────────────────
  const { upgradable, latest, error, total, upgradableApps } = useMemo(() => {
    const list = Array.from(results.value.values()).filter(Boolean);
    return {
      upgradable: list.filter((r) => r.has_update && r.brew_cask).length,
      latest: list.filter((r) => r.status === "up_to_date").length,
      error: list.filter((r) => r.status === "error").length,
      total: list.length,
      upgradableApps: list
        .filter((r) => r.has_update)
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    };
  }, [results.value]);

  // ── 2. mount 时触发一次整体 AI 总览摘要 ──────────────────
  // 之前 codebase 里没有任何地方调 versionsOverviewAiInsights, 导致
  // AIInsightsBlock 永远停在 idle. 这里补上拉取触发.
  useEffect(() => {
    if (!api.versionsOverviewAiInsights) return undefined;
    let cancelled = false;
    async function pull() {
      setAiInsights({ status: "loading", text: "", fromCache: false });
      try {
        const r = await api.versionsOverviewAiInsights();
        if (cancelled) return;
        if (r && r.ok) {
          setAiInsights({ status: "ready", text: r.text, fromCache: !!r.fromCache });
        } else {
          setAiInsights({ status: "error", text: "", fromCache: false });
        }
      } catch {
        if (!cancelled) setAiInsights({ status: "error", text: "", fromCache: false });
      }
    }
    pull();
    return () => { cancelled = true; };
  }, []);

  const retryAi = () => {
    if (api.versionsOverviewAiInsights) api.versionsOverviewAiInsights();
  };

  const aiState = aiInsights.value;

  return (
    <div class="insights-page">
      <PageHeader title="AI 洞察" subtitle="更新总览 · AI 摘要 · 本版要点">
        <button type="button" class="btn btn-sm" onClick={retryAi}>
          <IconRefresh size={14} /> 刷新 AI 摘要
        </button>
        <button type="button" class="btn btn-ghost btn-sm" onClick={() => navigateTo("library")}>
          ← 应用列表
        </button>
      </PageHeader>

      <div class="insights-content">
        {/* ── KPI 行 ─────────────────────────────── */}
        <div class="insights-kpi-row">
          <KpiPill label="可升级" value={upgradable} tone={upgradable > 0 ? "warn" : "ok"} />
          <KpiPill label="最新" value={latest} tone="ok" />
          <KpiPill label="出错" value={error} tone={error > 0 ? "danger" : "ok"} />
          <KpiPill label="总数" value={total} tone="neutral" />
        </div>

        {/* ── AI 总览摘要 ────────────────────────── */}
        <section class="insights-card insights-card--ai">
          <div class="insights-card__title-row">
            <span class="insights-card__title"><IconSparkles size={14} /> 更新总览</span>
          </div>
          {aiState.status === "loading" && (
            <div class="insights-ai-loading">AI 分析中…</div>
          )}
          {aiState.status === "ready" && (
            <div class="insights-ai-text">
              {aiState.fromCache && <span class="insights-ai-cache">缓存</span>}
              {aiState.text || "暂无摘要"}
            </div>
          )}
          {aiState.status === "error" && (
            <div class="insights-ai-error">
              AI 暂不可用
              <button type="button" class="btn btn-ghost btn-sm" onClick={retryAi}>重试</button>
            </div>
          )}
          {aiState.status === "idle" && (
            <div class="insights-ai-idle">—</div>
          )}
        </section>

        {/* ── 可升级 app 列表 + 本版要点 ─────────── */}
        <section class="insights-card insights-card--updates">
          <div class="insights-card__title-row">
            <span class="insights-card__title"><IconArrowUp size={14} /> 有更新的 App ({upgradableApps.length})</span>
          </div>
          {upgradableApps.length === 0 ? (
            <DrawerEmpty
              message="当前没有待更新的 App"
              hint="所有受监控的应用都已是最新版本"
              className="insights-empty"
            />
          ) : (
            <ul class="insights-update-list">
              {upgradableApps.map((r) => (
                <InsightUpdateRow key={r.name} result={r} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * 单个可升级 app 行: avatar + 版本箭头 + 展开 AI 摘要.
 */
function InsightUpdateRow({ result }) {
  const [open, setOpen] = useState(false);
  const bundle = result.bundle || "";
  const installed = result.installed_version || "—";
  const latest = result.latest_version || "—";

  return (
    <li class="insight-update-row">
      <button
        type="button"
        class="insight-update-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <AppAvatar bundle={bundle} name={result.name} />
        <span class="insight-update-name">{result.name}</span>
        <span class="insight-update-versions">
          <span class="insight-update-installed">{installed}</span>
          <span class="insight-update-arrow">→</span>
          <span class="insight-update-latest">{latest}</span>
        </span>
        {result.release_url && (
          <a
            class="insight-update-link"
            href={result.release_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            Release Notes
          </a>
        )}
      </button>
      {open && (
        <div class="insight-update-detail">
          <ChangelogSummary appName={result.name} />
        </div>
      )}
    </li>
  );
}

function KpiPill({ label, value, tone }) {
  return (
    <div class={`insights-kpi insights-kpi--${tone}`}>
      <div class="insights-kpi__value">{value}</div>
      <div class="insights-kpi__label">{label}</div>
    </div>
  );
}

export default InsightsPage;
