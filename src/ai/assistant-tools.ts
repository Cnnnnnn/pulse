/**
 * src/ai/assistant-tools.ts
 *
 * 主进程侧 AI 助手工具执行.
 */

import { NAV_REGISTRY } from "../shared/nav-keys";
import { DIGEST_UI_TITLE } from "../shared/digest-labels";
import type { AssistantAction } from "./assistant-prompt";
import { MAIN_PROCESS_TOOLS } from "./assistant-prompt";
import * as stateStore from "../main/state-store";
import * as fundStore from "../main/funds/fund-store";
import {
  zipHoldingsWithNav,
  calcPortfolioTotal,
  calcFundMetrics,
} from "../funds/fundCalc";
import { aggregate } from "../main/digest/aggregate";
import { getLeaderboard } from "../main/ai-leaderboard/index";


export type ToolCardItem = {
  label: string;
  meta?: string;
  action?: AssistantAction;
};

export type ToolResult = {
  tool: string;
  ok: boolean;
  summary: string;
  items?: ToolCardItem[];
};

function fmtPnl(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

function summarizeApps(): ToolResult {
  const state = stateStore.load ? stateStore.load() : null;
  const apps = (state && state.apps) || {};
  const names = Object.keys(apps);
  if (names.length === 0) {
    return {
      tool: "query_apps",
      ok: true,
      summary: "当前没有已监控的应用，或尚未完成首次检查。",
    };
  }
  const counts: Record<string, number> = {
    has_update: 0,
    up_to_date: 0,
    error: 0,
    unknown: 0,
  };
  const updates: ToolCardItem[] = [];
  for (const name of names) {
    const a = apps[name] || {};
    const status = a.status || (a.has_update ? "has_update" : "unknown");
    if (status === "has_update" || a.has_update) {
      counts.has_update++;
      const ver = a.latest_version || a.remote_version || "?";
      updates.push({
        label: name,
        meta: `→ ${ver}`,
        action: {
          tool: "upgrade_app",
          params: { appName: name },
        },
      });
    } else if (status === "up_to_date") {
      counts.up_to_date++;
    } else if (status === "error" || status === "failed") {
      counts.error++;
    } else {
      counts.unknown++;
    }
  }
  const lines = [
    `共监控 ${names.length} 个应用。`,
    `有更新: ${counts.has_update}，已最新: ${counts.up_to_date}，检查失败: ${counts.error}，未知: ${counts.unknown}。`,
  ];
  return {
    tool: "query_apps",
    ok: true,
    summary: lines.join("\n"),
    items: updates.slice(0, 12),
  };
}

function listNav(): ToolResult {
  const items = NAV_REGISTRY.map((e) => ({
    label: e.label,
    meta: e.subtitle,
    action: { tool: "navigate", params: { nav: e.key } },
  }));
  return {
    tool: "list_nav",
    ok: true,
    summary: items.map((i) => `${i.label} — ${i.meta}`).join("\n"),
    items,
  };
}

function getFundNavMap(scheduler: any): Record<string, unknown> {
  if (!scheduler || !scheduler._lastNavMap) return {};
  return { ...scheduler._lastNavMap };
}

function summarizeFunds(scheduler: any): ToolResult {
  const { holdings } = fundStore.loadAll();
  if (!Array.isArray(holdings) || holdings.length === 0) {
    return {
      tool: "query_funds",
      ok: true,
      summary: "当前没有基金持仓。可以说「打开基金页面」去添加。",
    };
  }
  const navMap = getFundNavMap(scheduler);
  const rows = zipHoldingsWithNav(holdings, navMap);
  const total = calcPortfolioTotal(rows);
  const summary = [
    `共 ${holdings.length} 只基金，${total.countWithNav} 只有净值数据。`,
    `总市值 ${total.totalMarketValue.toFixed(2)}，总成本 ${total.totalCost.toFixed(2)}。`,
    `累计盈亏 ${fmtPnl(total.totalProfit)} (${total.totalProfitPct.toFixed(2)}%)，今日 ${fmtPnl(total.todayProfit)}。`,
  ].join("\n");
  const items = holdings.slice(0, 10).map((h: any) => {
    const row = rows.find((r: any) => r.holding && r.holding.code === h.code);
    const m = row ? calcFundMetrics(row.holding, row.navSnap) : null;
    const meta = m && m.marketValue > 0 ? fmtPnl(m.profit) : "净值未拉取";
    return {
      label: `${h.name || h.code} (${h.code})`,
      meta,
      action: {
        tool: "open_search_result",
        params: {
          source: "fund",
          nativeId: h.code,
          payload: { code: h.code },
        },
      },
    };
  });
  return { tool: "query_funds", ok: true, summary, items };
}

function summarizeDigest(): ToolResult {
  const state = stateStore.load ? stateStore.load() : {};
  const result = aggregate(state, { now: new Date() });
  const sections = result.sections || [];
  const date = result.date || "";
  if (sections.length === 0) {
    return {
      tool: "query_digest",
      ok: true,
      summary: `${date || "今天"} 暂无${DIGEST_UI_TITLE}。`,
    };
  }
  const items: ToolCardItem[] = [];
  for (const section of sections) {
    const kind = section.kind || "section";
    for (const it of (section.items || []).slice(0, 4)) {
      const item =
        typeof it === "object" && it !== null
          ? (it as Record<string, unknown>)
          : null;
      const label =
        typeof it === "string"
          ? it
          : item?.title || item?.name || item?.label || JSON.stringify(it).slice(0, 40);
      items.push({ label: String(label), meta: kind });
      if (items.length >= 10) break;
    }
    if (items.length >= 10) break;
  }
  const lineText =
    Array.isArray(result.lines) && result.lines.length > 0
      ? result.lines.join("\n")
      : sections.map((s: any) => s.kind).join("、");
  return {
    tool: "query_digest",
    ok: true,
    summary: `${date}\n${lineText}`,
    items,
  };
}

async function summarizeLeaderboard(
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const category =
    typeof params.category === "string" ? params.category : "text";
  const limit =
    typeof params.limit === "number" && params.limit > 0
      ? Math.min(params.limit, 10)
      : 5;
  try {
    const r = await getLeaderboard({
      category,
      dimension: "elo",
      sources: { arena: true },
      force: false,
    });
    const items = (r && r.items ? r.items : []).slice(0, limit);
    if (items.length === 0) {
      return {
        tool: "query_leaderboard",
        ok: true,
        summary: "暂无榜单数据，请稍后在 AI 榜单页刷新。",
      };
    }
    const cards = items.map((it: any, i: number) => ({
      label: `#${i + 1} ${it.name || it.id}`,
      meta: it.vendor || (it.score != null ? String(it.score) : ""),
      action: { tool: "navigate", params: { nav: "ai-leaderboard" } },
    }));
    const summary = cards
      .map((c: ToolCardItem, i: number) => `${i + 1}. ${c.label}${c.meta ? ` (${c.meta})` : ""}`)
      .join("\n");
    return {
      tool: "query_leaderboard",
      ok: true,
      summary: `AI 榜单 Top ${items.length}（${category}）：\n${summary}`,
      items: cards,
    };
  } catch (err: any) {
    return {
      tool: "query_leaderboard",
      ok: false,
      summary: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runSearch(
  params: Record<string, unknown>,
  searchIndex: any,
): Promise<ToolResult> {
  const q = typeof params.q === "string" ? params.q.trim() : "";
  if (!q) {
    return { tool: "search", ok: false, summary: "缺少搜索关键词 q" };
  }
  const source =
    typeof params.source === "string" ? params.source : null;
  try {
    const r = searchIndex.query(q, { source });
    const results = (r && r.results) || [];
    if (results.length === 0) {
      return { tool: "search", ok: true, summary: `未找到与「${q}」相关的结果。` };
    }
    const items = results.slice(0, 8).map((item: any, i: number) => {
      const title = item.title || item.name || item.id || "?";
      const src = item.source || item.type || "";
      return {
        label: title,
        meta: src,
        action: {
          tool: "open_search_result",
          params: {
            source: src,
            nativeId: item.nativeId || item.id,
            payload: item.payload || {},
          },
        },
      };
    });
    return {
      tool: "search",
      ok: true,
      summary: `找到 ${results.length} 条结果（显示前 ${items.length} 条，点击可跳转）：`,
      items,
    };
  } catch (err: any) {
    return {
      tool: "search",
      ok: false,
      summary: err instanceof Error ? err.message : String(err),
    };
  }
}

function summarizeMetals(): ToolResult {
  const { getTraySnapshot } = require("../main/metal-ipc");
  const { METALS } = require("../metals/metal-config");
  const metalRepo = require("../main/metals/metal-repository");
  const cfg = metalRepo.load();
  const snap = getTraySnapshot();
  const quotes = snap.quotes || {};
  const watched: string[] = Array.isArray(cfg.watchedIds) ? cfg.watchedIds : [];
  const metaById = Object.fromEntries(METALS.map((m: any) => [m.id, m]));
  const lines: string[] = [];
  const items: ToolCardItem[] = [];
  for (const id of watched) {
    const meta = metaById[id];
    if (!meta) continue;
    const q = quotes[id] || {};
    const price = q.price ?? q.last ?? q.close ?? null;
    const chg = q.changePct ?? q.pct ?? q.change ?? null;
    const priceStr =
      price != null ? `${price}${meta.unit ? ` ${meta.unit}` : ""}` : "暂无行情";
    const chgStr = chg != null ? `${Number(chg) >= 0 ? "+" : ""}${chg}%` : "";
    lines.push(`${meta.shortName || meta.name}: ${priceStr}${chgStr ? ` (${chgStr})` : ""}`);
    items.push({
      label: meta.shortName || meta.name,
      meta: chgStr || priceStr,
      action: { tool: "navigate", params: { nav: "invest", tab: "metals" } },
    });
  }
  if (lines.length === 0) {
    return {
      tool: "query_metals",
      ok: true,
      summary: "暂无贵金属行情，请稍后在投资 → 贵金属页刷新。",
    };
  }
  const fetched = snap.fetchedAt
    ? `更新于 ${new Date(snap.fetchedAt).toLocaleTimeString("zh-CN")}`
    : "";
  return {
    tool: "query_metals",
    ok: true,
    summary: [fetched, ...lines].filter(Boolean).join("\n"),
    items,
  };
}

async function summarizeStocks(
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const q = typeof params.q === "string" ? params.q.trim() : "";
  if (!q) {
    return {
      tool: "query_stocks",
      ok: false,
      summary: "请提供股票名称或代码，例如 q=\"贵州茅台\"",
    };
  }
  try {
    const { createStockHttpClient } = require("../main/chromium-http-client");
    const { searchStocks } = require("../stocks/stock-search");
    const http = createStockHttpClient({ timeout: 6000, maxRetries: 0 });
    const results = await searchStocks(q, http);
    if (!results || results.length === 0) {
      return {
        tool: "query_stocks",
        ok: true,
        summary: `未找到与「${q}」相关的股票。`,
      };
    }
    const items = results.slice(0, 8).map((row: any) => ({
      label: `${row.name} (${row.code})`,
      meta: row.industry || "股票",
      action: {
        tool: "open_stock_diagnosis",
        params: { code: row.code, name: row.name },
      },
    }));
    return {
      tool: "query_stocks",
      ok: true,
      summary: `找到 ${results.length} 只股票（显示前 ${items.length} 只）：`,
      items,
    };
  } catch (err: any) {
    return {
      tool: "query_stocks",
      ok: false,
      summary: err instanceof Error ? err.message : String(err),
    };
  }
}

function summarizeGithub(
  pageData?: Record<string, unknown>,
): ToolResult {
  const github = pageData?.github as {
    total?: number;
    withUpdate?: number;
    projects?: Array<{
      name: string;
      owner: string;
      repo: string;
      latest?: string;
      hasUpdate?: boolean;
    }>;
  } | undefined;
  if (!github?.projects || github.projects.length === 0) {
    return {
      tool: "query_github",
      ok: true,
      summary: "暂无收录的 GitHub 项目。可以说「打开 GitHub 页」去添加。",
    };
  }
  const items: ToolCardItem[] = github.projects.slice(0, 10).map((p) => ({
    label: p.name || `${p.owner}/${p.repo}`,
    meta: p.hasUpdate ? `新版本 ${p.latest || "?"}` : p.latest || "",
    action: { tool: "navigate", params: { nav: "github" } },
  }));
  const summary = [
    `共收录 ${github.total ?? github.projects.length} 个 GitHub 项目`,
    github.withUpdate ? `，${github.withUpdate} 个有新 release` : "",
    "：",
    items.map((i) => `${i.label}${i.meta ? ` (${i.meta})` : ""}`).join("；"),
  ].join("");
  return { tool: "query_github", ok: true, summary, items };
}

function summarizeAiUsage(): ToolResult {
  const providers = ["minimax", "glm"] as const;
  const lines: string[] = [];
  const items: ToolCardItem[] = [];
  for (const pid of providers) {
    const snap = stateStore.loadAiUsageSnapshotProvider
      ? stateStore.loadAiUsageSnapshotProvider(pid)
      : null;
    const label = pid === "glm" ? "GLM (智谱)" : "Minimax";
    if (!snap) {
      lines.push(`${label}: 未配置或无数据`);
      continue;
    }
    const w5h = snap.windows?.["5h"];
    const wk = snap.windows?.week || snap.windows?.["7d"];
    const parts: string[] = [];
    if (w5h && typeof w5h.usedPercent === "number") {
      parts.push(`5h ${w5h.usedPercent}%`);
    }
    if (wk && typeof wk.usedPercent === "number") {
      parts.push(`周 ${wk.usedPercent}%`);
    }
    lines.push(`${label}: ${parts.join("，") || "已同步"}`);
    items.push({
      label,
      meta: parts.join(" · ") || "查看详情",
      action: { tool: "navigate", params: { nav: "ai-usage" } },
    });
  }
  return {
    tool: "query_ai_usage",
    ok: true,
    summary: lines.join("\n"),
    items,
  };
}

async function summarizeStockDiagnosis(
  params: Record<string, unknown>,
  pageData?: Record<string, unknown>,
): Promise<ToolResult> {
  const codeParam = typeof params.code === "string" ? params.code.trim() : "";
  const ctxStock = pageData?.currentStock as
    | { code?: string; name?: string }
    | undefined;
  const code = codeParam || ctxStock?.code;
  if (!code) {
    return {
      tool: "query_stock_diagnosis",
      ok: false,
      summary: "请提供股票代码，或先打开某只股票的诊断页。",
    };
  }
  const angles = [
    "price_trend",
    "valuation",
    "profitability",
    "capital_flow",
    "tech_indicators",
  ];
  try {
    const { createStockHttpClient } = require("../main/chromium-http-client");
    const { fetchStockDetailAngles } = require("../../stocks/stock-detail-fetcher");
    const { computeScores } = require("../../stocks/diagnosis-scorer");
    const http = createStockHttpClient({ timeout: 8000, maxRetries: 1 });
    const data = await fetchStockDetailAngles(http, code, angles);
    if (!data || data.fulfilledCount === 0) {
      return {
        tool: "query_stock_diagnosis",
        ok: false,
        summary: `未能获取 ${code} 的诊断数据，请稍后再试。`,
      };
    }
    const scores = computeScores(data.perAngle || {});
    const name = ctxStock?.name || code;
    const dimLabels: Record<string, string> = {
      fundamental: "基本面",
      valuation: "估值",
      technical: "技术",
      capital: "资金",
      sentiment: "情绪",
    };
    const dimLines = Object.entries(scores.dimensions || {})
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${dimLabels[k] || k} ${v}/10`);
    const summary = [
      `${name} (${code}) 诊断`,
      scores.overall != null ? `综合评分 ${scores.overall}/10` : "综合评分: 数据不足",
      dimLines.length > 0 ? dimLines.join("，") : "",
      Array.isArray(scores.rationale) && scores.rationale.length > 0
        ? scores.rationale.join("；")
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      tool: "query_stock_diagnosis",
      ok: true,
      summary,
      items: [
        {
          label: `查看 ${name} 诊断`,
          meta: scores.overall != null ? `${scores.overall}/10` : "",
          action: { tool: "navigate", params: { nav: "invest", tab: "stocks" } },
        },
      ],
    };
  } catch (err: any) {
    return {
      tool: "query_stock_diagnosis",
      ok: false,
      summary: err instanceof Error ? err.message : String(err),
    };
  }
}

function fmtTriggerAt(ms: unknown): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
  try {
    return new Date(ms).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function summarizeReminders(): ToolResult {
  const remindersMod = require("../main/reminders");
  const all: any[] =
    remindersMod && typeof remindersMod.list === "function"
      ? remindersMod.list()
      : [];
  if (!Array.isArray(all) || all.length === 0) {
    return {
      tool: "query_reminders",
      ok: true,
      summary: "当前没有提醒事项。可以说「打开提醒」去添加。",
      items: [
        {
          label: "打开提醒",
          meta: "添加新提醒",
          action: { tool: "open_reminders", params: {} },
        },
      ],
    };
  }
  const pending = all.filter((r) => r && r.status === "pending");
  const items: ToolCardItem[] = pending.slice(0, 10).map((r) => ({
    label: r.title || r.id,
    meta: fmtTriggerAt(r.triggerAt) || r.repeat || "",
    action: { tool: "open_reminders", params: {} },
  }));
  const lines = [
    `共 ${all.length} 条提醒，${pending.length} 条待触发。`,
    pending.length > 0
      ? pending
          .slice(0, 6)
          .map((r) => `• ${r.title}（${fmtTriggerAt(r.triggerAt) || "待定"}）`)
          .join("\n")
      : "暂无待触发提醒。",
  ];
  return {
    tool: "query_reminders",
    ok: true,
    summary: lines.join("\n"),
    items,
  };
}

export async function executeMainTool(
  action: AssistantAction,
  deps: {
    searchIndex?: any;
    fundScheduler?: any;
    pageData?: Record<string, unknown>;
  } = {},
): Promise<ToolResult | null> {
  if (!MAIN_PROCESS_TOOLS.has(action.tool)) return null;
  switch (action.tool) {
    case "query_apps":
      return summarizeApps();
    case "list_nav":
      return listNav();
    case "query_funds":
      return summarizeFunds(deps.fundScheduler);
    case "query_digest":
      return summarizeDigest();
    case "query_leaderboard":
      return summarizeLeaderboard(action.params);
    case "query_metals":
      return summarizeMetals();
    case "query_stocks":
      return summarizeStocks(action.params);
    case "search":
      if (!deps.searchIndex) {
        return { tool: "search", ok: false, summary: "搜索索引未初始化" };
      }
      return runSearch(action.params, deps.searchIndex);
    case "query_github":
      return summarizeGithub(deps.pageData);
    case "query_ai_usage":
      return summarizeAiUsage();
    case "query_stock_diagnosis":
      return summarizeStockDiagnosis(action.params, deps.pageData);
    case "query_reminders":
      return summarizeReminders();
    case "interpret_finance": {
      const { runInterpretFinance } = require("./assistant-interpret-tools");
      return runInterpretFinance(action.params, deps.pageData);
    }
    case "summarize_ithome": {
      const { runSummarizeIthome } = require("./assistant-interpret-tools");
      return runSummarizeIthome(action.params, deps.pageData);
    }
    case "advise_stocks": {
      const { runAdviseStocks } = require("./assistant-interpret-tools");
      return runAdviseStocks(action.params);
    }
    case "query_movies": {
      const { runQueryMovies } = require("./assistant-interpret-tools");
      return runQueryMovies(action.params);
    }
    case "query_concerts": {
      const { runQueryConcerts } = require("./assistant-interpret-tools");
      return runQueryConcerts();
    }
    case "remember_fact": {
      const { addMemory } = require("./assistant-memory");
      const fact =
        typeof action.params.fact === "string" ? action.params.fact.trim() : "";
      if (!fact) {
        return { tool: "remember_fact", ok: false, summary: "缺少要记住的内容" };
      }
      const item = addMemory(fact);
      return item
        ? { tool: "remember_fact", ok: true, summary: `已记住：${item.text}` }
        : { tool: "remember_fact", ok: false, summary: "未能记住（内容为空）" };
    }
    case "forget_fact": {
      const { removeMemory } = require("./assistant-memory");
      const removed = removeMemory({
        id: typeof action.params.id === "string" ? action.params.id : undefined,
        query:
          typeof action.params.query === "string" ? action.params.query : undefined,
        index:
          typeof action.params.index === "number" ? action.params.index : undefined,
      });
      return removed
        ? { tool: "forget_fact", ok: true, summary: "已删除该条记忆" }
        : { tool: "forget_fact", ok: false, summary: "未找到匹配的记忆" };
    }
    case "list_memory": {
      const { listMemory } = require("./assistant-memory");
      const items = listMemory();
      if (items.length === 0) {
        return { tool: "list_memory", ok: true, summary: "目前没有任何长期记忆。" };
      }
      const lines = items.map((it: any, i: number) => `${i + 1}. ${it.text}`);
      return {
        tool: "list_memory",
        ok: true,
        summary: `共 ${items.length} 条长期记忆：\n${lines.join("\n")}`,
        items: items.map((it: any, i: number) => ({
          label: it.text,
          meta: `#${i + 1}`,
        })),
      };
    }
    default:
      return { tool: action.tool, ok: false, summary: "未知工具" };
  }
}

export function splitActions(actions: AssistantAction[]): {
  main: AssistantAction[];
  renderer: AssistantAction[];
} {
  const main: AssistantAction[] = [];
  const renderer: AssistantAction[] = [];
  for (const a of actions) {
    if (MAIN_PROCESS_TOOLS.has(a.tool)) main.push(a);
    else renderer.push(a);
  }
  return { main, renderer };
}

export function toolResultsToCards(
  results: Array<{ tool: string; summary: string; items?: ToolCardItem[] }>,
) {
  return results.map((r) => ({
    tool: r.tool,
    summary: r.summary,
    items: r.items,
  }));
}
