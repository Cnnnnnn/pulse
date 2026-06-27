/**
 * src/main/ipc/register-versions-overview.js
 *
 * Overview 5 个数据源 + command palette 搜索.
 *
 * ponytail: 主进程只能 require CJS / main-side 模块. Renderer selectors (ESM) 不能
 * import. KPI 改成直接读 state.json.apps (renderer 检测完会落盘) — 这是同一个真相,
 * 渲染端用 signal 派生, 主进程这里用磁盘快照派生, 数值一致.
 */
const stateStore = require("../state-store");
const recentActivity = require("../recent-activity");
const { aiOverviewSummary } = require("../../ai/versions-overview-advisor.js");

const TREND_DEFAULT = [0, 0, 0, 0, 0, 0, 0];
const OVERVIEW_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 从 state.json.apps 派生 KPI. 这是 renderer signal (results / appPhases) 的磁盘
 * 镜像; 检测完毕会同步落盘, 最多滞后一次 patchState.
 */
function _computeKpisFromState() {
  const s = stateStore.load();
  const apps = (s && s.apps) || {};
  const names = Object.keys(apps);
  let upgradable = 0;
  let latest = 0;
  let error = 0;
  for (const name of names) {
    const a = apps[name];
    if (!a) continue;
    if (a.status === "error") {
      error++;
      continue;
    }
    if (a.has_update && a.brew_cask) {
      upgradable++;
    } else if (a.status === "up_to_date") {
      latest++;
    }
  }
  return { upgradable, latest, error, total: names.length };
}

function getOverviewKpis() {
  return _computeKpisFromState();
}

function getOverviewTrend() {
  // 后续 task 会接 state-store.trendHistory; 当前没数据源, 返 7 天 0 占位
  return TREND_DEFAULT.slice();
}

function getOverviewWatchlist() {
  const items = stateStore.loadWatchlist() || [];
  return items
    .filter((w) => w && w.type === "app")
    .slice(0, 6)
    .map((w) => ({ name: w.ref, has_update: true }));
}

function getOverviewRecent() {
  const list = recentActivity.list() || [];
  return list.slice(0, 10).map((e) => ({
    kind: e.kind,
    appName: e.ref || "",
    ts: typeof e.ts === "number" ? e.ts : 0,
  }));
}

async function getOverviewAiInsights(ctx) {
  // 1 天内命中缓存 → 直接返
  const cache = stateStore.loadOverviewCache();
  const now = Date.now();
  if (
    cache &&
    now - cache.fetchedAt < OVERVIEW_CACHE_TTL_MS
  ) {
    return { ok: true, text: cache.text, fromCache: true };
  }

  try {
    const summary = await aiOverviewSummary(ctx);
    try {
      stateStore.saveOverviewCache({
        text: summary,
        fetchedAt: Date.now(),
      });
    } catch {
      /* cache write failed → still return fresh summary */
    }
    return { ok: true, text: summary, fromCache: false };
  } catch (e) {
    return {
      ok: false,
      reason: "advisor_failed",
      error: e && e.message ? e.message : String(e),
    };
  }
}

async function commandSearch(_ctx, q) {
  if (!q || typeof q !== "string") return { ok: true, results: [] };
  const lower = q.toLowerCase();
  const results = [];
  if (lower.includes("check") || lower.includes("更新")) {
    results.push({ id: "action-check", label: "检查更新", kind: "action" });
  }
  for (const v of ["overview", "library", "diagnostics", "insights", "settings"]) {
    if (v.startsWith(lower) || lower.includes(v)) {
      results.push({ id: v, label: v, kind: "view" });
    }
  }
  return { ok: true, results: results.slice(0, 10) };
}

function registerVersionsOverviewHandlers(ctx) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;
  safeHandle("versions:overview-kpis", async () => getOverviewKpis());
  safeHandle("versions:overview-trend", async () => getOverviewTrend());
  safeHandle("versions:overview-watchlist", async () => getOverviewWatchlist());
  safeHandle("versions:overview-recent", async () => getOverviewRecent());
  safeHandle("versions:overview-ai-insights", async () =>
    getOverviewAiInsights(ctx),
  );
  safeHandle("versions:command-search", async (_e, { q }) =>
    commandSearch(ctx, q),
  );
}

module.exports = {
  registerVersionsOverviewHandlers,
  getOverviewKpis,
  getOverviewTrend,
  getOverviewWatchlist,
  getOverviewRecent,
  getOverviewAiInsights,
  commandSearch,
};