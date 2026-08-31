/**
 * src/renderer/assistant/page-context.ts
 *
 * 收集当前页面上下文，注入 AI 助手 system prompt.
 */
import { activeNav, investPrimary } from "../nav/navStore.ts";
import { currentRoute } from "../store/route-store.ts";
import { apps, results } from "../store/check-store.ts";
import {
  diagnosisStock,
  stockDiagnosisCode,
  diagnosisState,
} from "../stocks/diagnosisStore.ts";
import { holdings, totalMetrics } from "../funds/fundStore.ts";
import {
  activeView,
  activeBoard,
  items as leaderboardItems,
} from "../ai-leaderboard/aiLeaderboardStore.ts";
import {
  githubProjects,
  hasGithubUpdate,
} from "../store/github-projects-store.ts";
import {
  digestSections,
  digestDate,
  digestLines,
} from "../digest/digest-store.ts";
import { DIGEST_UI_TITLE } from "../../shared/digest-labels.ts";
import { financeSelectedId, financeList } from "../finance/financeStore.ts";
import {
  moviesNowPlaying,
  moviesComing,
  moviesSelectedId,
} from "../movies/store.ts";
import {
  ithomeSelectedArticleId,
} from "../ithome/store.ts";
import { newsSubTab } from "../news/newsStore.ts";
import {
  buildPageContextEntities,
  formatPageEntitiesForPrompt,
  type PageEntitySelection,
  type PageVisibleMovie,
} from "../../shared/page-context-structured.ts";
import {
  concertsWatches,
  concertsSnapshots,
} from "../concerts/store.ts";

export type PageContextSnapshot = {
  activeNav: string;
  route: string;
  investTab?: string;
  currentStock?: { code: string; name?: string };
  stockDiagnosis?: { overall?: number; status?: string };
  fundsSummary?: {
    count: number;
    marketValue?: number;
    profit?: number;
    profitPct?: number;
  };
  leaderboard?: { view: string; board: string; top: string[] };
  digestPreview?: { date?: string; headlines: string[] };
  github?: {
    total: number;
    withUpdate: number;
    projects: Array<{
      name: string;
      owner: string;
      repo: string;
      latest?: string;
      hasUpdate: boolean;
    }>;
  };
  appsSummary?: { total: number; hasUpdate: number; samples: string[] };
  visibleApps?: Array<{ name: string; status: string; latest?: string }>;
  financeArticle?: { id: string; title?: string };
  ithomeArticle?: { id: string; title?: string };
  newsSubTab?: string;
  selection?: PageEntitySelection;
  visibleMovies?: PageVisibleMovie[];
  moviesPreview?: { nowPlaying: string[]; coming: string[] };
  concertsPreview?: string[];
};

export function collectPageContext(): PageContextSnapshot {
  const nav = activeNav.value;
  const ctx: PageContextSnapshot = {
    activeNav: nav,
    route: currentRoute.value,
    selection: {},
  };

  if (nav === "news") {
    ctx.newsSubTab = newsSubTab.value;
  }

  if (nav === "invest") {
    ctx.investTab = investPrimary.value;
    if (investPrimary.value === "funds") {
      const list = holdings.value || [];
      const m = totalMetrics.value;
      if (list.length > 0) {
        ctx.fundsSummary = {
          count: list.length,
          marketValue: m?.totalMarketValue,
          profit: m?.totalProfit,
          profitPct: m?.totalProfitPct,
        };
      }
    }
    if (investPrimary.value === "stocks") {
      const stock = diagnosisStock.value as { code?: string; name?: string } | null;
      const code = stockDiagnosisCode.value || (stock && stock.code);
      if (code) {
        ctx.currentStock = {
          code: String(code),
          name: stock && stock.name ? String(stock.name) : undefined,
        };
        ctx.selection!.stock = {
          code: String(code),
          name: stock && stock.name ? String(stock.name) : undefined,
        };
        const ds = diagnosisState.value as {
          status?: string;
          scores?: { overall?: number } | null;
        };
        if (ds?.scores?.overall != null || ds?.status) {
          ctx.stockDiagnosis = {
            overall: ds.scores?.overall ?? undefined,
            status: ds.status,
          };
        }
      }
    }
  }

  if (nav === "ai-leaderboard") {
    const top = (leaderboardItems.value || [])
      .slice(0, 5)
      .map((it: any) => it?.name || it?.id || "?")
      .filter(Boolean);
    ctx.leaderboard = {
      view: activeView.value,
      board: activeBoard.value,
      top,
    };
  }

  if (nav === "news") {
    const headlines: string[] = [];
    for (const sec of digestSections.value || []) {
      for (const it of (sec.items || []).slice(0, 3)) {
        const label =
          typeof it === "string"
            ? it
            : (it as { title?: string; name?: string }).title ||
              (it as { title?: string; name?: string }).name;
        if (label) headlines.push(String(label));
        if (headlines.length >= 6) break;
      }
      if (headlines.length >= 6) break;
    }
    if (headlines.length === 0 && digestLines.value?.length) {
      headlines.push(...digestLines.value.slice(0, 6));
    }
    if (headlines.length > 0 || digestDate.value) {
      ctx.digestPreview = {
        date: digestDate.value || undefined,
        headlines,
      };
    }
    const fid = financeSelectedId.value;
    if (fid) {
      const art = (financeList.value || []).find(
        (a: { id?: string }) => a?.id === fid,
      ) as { id?: string; title?: string } | undefined;
      ctx.financeArticle = {
        id: String(fid),
        title: art?.title ? String(art.title) : undefined,
      };
      ctx.selection!.financeArticle = ctx.financeArticle;
    }
    const iid = ithomeSelectedArticleId.value;
    if (iid) {
      ctx.ithomeArticle = { id: String(iid) };
      ctx.selection!.ithomeArticle = ctx.ithomeArticle;
    }
  }

  if (nav === "movies") {
    const allMovies = [
      ...(moviesNowPlaying.value || []),
      ...(moviesComing.value || []),
    ];
    const now = (moviesNowPlaying.value || [])
      .slice(0, 6)
      .map((m: { title?: string; name?: string }) =>
        String(m?.title || m?.name || ""),
      )
      .filter(Boolean);
    const coming = (moviesComing.value || [])
      .slice(0, 6)
      .map((m: { title?: string; name?: string }) =>
        String(m?.title || m?.name || ""),
      )
      .filter(Boolean);
    if (now.length > 0 || coming.length > 0) {
      ctx.moviesPreview = { nowPlaying: now, coming };
    }
    ctx.visibleMovies = (moviesNowPlaying.value || [])
      .slice(0, 10)
      .map((m: { id?: string; title?: string; name?: string }, i: number) => ({
        id: String(m?.id ?? ""),
        title: String(m?.title || m?.name || ""),
        index: i + 1,
      }))
      .filter((m) => m.id && m.title);
    const selId = moviesSelectedId.value;
    if (selId) {
      const hit = allMovies.find(
        (m: { id?: string }) => String(m?.id) === String(selId),
      ) as { id?: string; title?: string; name?: string } | undefined;
      ctx.selection!.movie = {
        id: String(selId),
        title: hit?.title || hit?.name ? String(hit.title || hit.name) : undefined,
      };
    }
  }

  if (nav === "concerts") {
    const titles = (concertsWatches.value || [])
      .slice(0, 6)
      .map((w: { id?: string }) => {
        const snap = w?.id ? concertsSnapshots.value?.[w.id] : null;
        return snap?.title ? String(snap.title) : w?.id ? String(w.id) : "";
      })
      .filter(Boolean);
    if (titles.length > 0) {
      ctx.concertsPreview = titles;
    }
  }

  // ponytail: GitHub 项目存 renderer localStorage — 始终注入供 query_github 使用
  const ghList = githubProjects.value || [];
  if (ghList.length > 0) {
    const projects = ghList.slice(0, 12).map((p: any) => ({
      name: p.name || `${p.owner}/${p.repo}`,
      owner: p.owner || "",
      repo: p.repo || "",
      latest: p.latestVersion || undefined,
      hasUpdate: hasGithubUpdate(p),
    }));
    ctx.github = {
      total: ghList.length,
      withUpdate: projects.filter((p) => p.hasUpdate).length,
      projects,
    };
  }

  if (nav === "versions" || nav === "home") {
    const list = apps.value || [];
    const resMap = results.value;
    let hasUpdate = 0;
    const updates: string[] = [];
    const visible: PageContextSnapshot["visibleApps"] = [];
    for (const app of list.slice(0, 20)) {
      const name = app && (app as { name?: string }).name;
      if (!name) continue;
      const r = resMap instanceof Map ? resMap.get(name) : undefined;
      const row = r as {
        status?: string;
        has_update?: boolean;
        latest_version?: string;
        remote_version?: string;
      } | undefined;
      const status = row?.status || (row?.has_update ? "has_update" : "unknown");
      const latest = row?.latest_version || row?.remote_version;
      visible.push({
        name,
        status: String(status),
        latest: latest ? String(latest) : undefined,
      });
      if (row && (row.has_update || status === "has_update")) {
        hasUpdate++;
        if (updates.length < 8) updates.push(name);
      }
    }
    ctx.appsSummary = {
      total: list.length,
      hasUpdate,
      samples: updates,
    };
    if (nav === "versions") {
      ctx.visibleApps = visible.slice(0, 12);
    }
  }

  return ctx;
}

export function formatPageContextForPrompt(ctx: PageContextSnapshot): string {
  const lines = [`activeNav=${ctx.activeNav}`, `route=${ctx.route}`];
  if (ctx.investTab) lines.push(`investTab=${ctx.investTab}`);
  if (ctx.fundsSummary) {
    const f = ctx.fundsSummary;
    const profitStr =
      f.profit != null
        ? `${f.profit >= 0 ? "+" : ""}${f.profit.toFixed(2)}`
        : "?";
    const pctStr =
      f.profitPct != null ? ` (${f.profitPct >= 0 ? "+" : ""}${f.profitPct.toFixed(2)}%)` : "";
    lines.push(
      `funds: ${f.count}只, 市值${f.marketValue?.toFixed(2) ?? "?"}, 盈亏${profitStr}${pctStr}`,
    );
  }
  if (ctx.currentStock) {
    lines.push(
      `currentStock=${ctx.currentStock.name || ctx.currentStock.code} (${ctx.currentStock.code})`,
    );
  }
  if (ctx.stockDiagnosis?.overall != null) {
    lines.push(`stockDiagnosisScore=${ctx.stockDiagnosis.overall}/10`);
  }
  if (ctx.leaderboard) {
    lines.push(
      `leaderboard: view=${ctx.leaderboard.view}, board=${ctx.leaderboard.board}` +
        (ctx.leaderboard.top.length > 0
          ? `, top: ${ctx.leaderboard.top.join(", ")}`
          : ""),
    );
  }
  if (ctx.digestPreview) {
    const d = ctx.digestPreview;
    lines.push(
      `${DIGEST_UI_TITLE}${d.date ? `(${d.date})` : ""}: ${d.headlines.slice(0, 4).join("；") || "无"}`,
    );
  }
  if (ctx.github) {
    lines.push(
      `github: ${ctx.github.total}个项目, ${ctx.github.withUpdate}个有新release` +
        (ctx.github.projects.filter((p) => p.hasUpdate).length > 0
          ? ` (${ctx.github.projects
              .filter((p) => p.hasUpdate)
              .map((p) => p.name)
              .join(", ")})`
          : ""),
    );
  }
  if (ctx.appsSummary) {
    lines.push(
      `apps: 共${ctx.appsSummary.total}个, ${ctx.appsSummary.hasUpdate}个有更新` +
        (ctx.appsSummary.samples.length > 0
          ? `, 待更新: ${ctx.appsSummary.samples.join(", ")}`
          : ""),
    );
  }
  if (ctx.visibleApps && ctx.visibleApps.length > 0) {
    const brief = ctx.visibleApps
      .map((a) => `${a.name}[${a.status}${a.latest ? `→${a.latest}` : ""}]`)
      .join("; ");
    lines.push(`visibleApps: ${brief}`);
  }
  if (ctx.financeArticle) {
    lines.push(
      `financeArticle: ${ctx.financeArticle.title || ctx.financeArticle.id} (id=${ctx.financeArticle.id})`,
    );
  }
  if (ctx.moviesPreview) {
    const m = ctx.moviesPreview;
    if (m.nowPlaying.length > 0) {
      lines.push(`moviesNow: ${m.nowPlaying.slice(0, 4).join("、")}`);
    }
    if (m.coming.length > 0) {
      lines.push(`moviesComing: ${m.coming.slice(0, 4).join("、")}`);
    }
  }
  if (ctx.concertsPreview && ctx.concertsPreview.length > 0) {
    lines.push(`concertsWatch: ${ctx.concertsPreview.slice(0, 4).join("、")}`);
  }
  if (ctx.newsSubTab) {
    lines.push(`newsSubTab=${ctx.newsSubTab}`);
  }
  if (ctx.ithomeArticle) {
    lines.push(`ithomeArticle: id=${ctx.ithomeArticle.id}`);
  }
  const entities = buildPageContextEntities({
    activeNav: ctx.activeNav,
    route: ctx.route,
    investTab: ctx.investTab,
    newsSubTab: ctx.newsSubTab,
    selection: ctx.selection || {},
    visibleMovies: ctx.visibleMovies,
  });
  lines.push(formatPageEntitiesForPrompt(entities));
  return lines.join("\n");
}

const NAV_LABELS: Record<string, string> = {
  home: "首页",
  versions: "版本检查",
  invest: "投资",
  news: "资讯",
  github: "GitHub",
  concerts: "演出",
  movies: "电影",
  "ai-leaderboard": "AI 榜单",
  "ai-usage": "AI 用量",
};

const INVEST_TAB_LABELS: Record<string, string> = {
  funds: "基金",
  metals: "贵金属",
  stocks: "股票",
};

/** 输入区旁展示的简短页面上下文标签 */
export function formatPageContextBadge(ctx: PageContextSnapshot): string {
  const nav = NAV_LABELS[ctx.activeNav] || ctx.activeNav;
  if (ctx.activeNav === "invest" && ctx.investTab) {
    const tab = INVEST_TAB_LABELS[ctx.investTab] || ctx.investTab;
    return `${nav} · ${tab}`;
  }
  if (ctx.activeNav === "news" && ctx.route) {
    return `${nav} · ${ctx.route}`;
  }
  return nav;
}

/** 插入输入框的页面上下文一行摘要 */
export function formatPageContextSnippet(ctx: PageContextSnapshot): string {
  const parts = [formatPageContextBadge(ctx)];
  if (ctx.appsSummary && ctx.appsSummary.hasUpdate > 0) {
    parts.push(`${ctx.appsSummary.hasUpdate} 个应用待更新`);
  }
  if (ctx.fundsSummary && ctx.fundsSummary.count > 0) {
    parts.push(`持仓 ${ctx.fundsSummary.count} 只基金`);
  }
  if (ctx.currentStock?.name || ctx.currentStock?.code) {
    parts.push(
      `股票 ${ctx.currentStock.name || ctx.currentStock.code}`,
    );
  }
  if (ctx.digestPreview?.headlines?.length) {
    parts.push(`${DIGEST_UI_TITLE} ${ctx.digestPreview.headlines[0]}`);
  }
  return `[当前页面：${parts.join("，")}]`;
}
