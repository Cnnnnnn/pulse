/**
 * src/ai/finance-news-interpret.ts
 *
 * 财经新闻 AI 解读 — 复用全局 chatCompletion / prompt-registry / token-budget，
 * 不新建 provider / 设置页 / 预算逻辑。镜像 changelog-summary.ts。
 *
 * 输出严格 JSON：summary / highlights / sentiment / impact / extracted，
 * prompt 强制禁止任何投资建议。缓存落盘到独立 sidecar finance_ai.json
 * （与 state.json 同目录），彻底避开 state-store 的 PRESERVE_FIELDS 静默丢弃陷阱。
 */

import { chatCompletion, resolveSharedAiConfig } from "./shared-llm";
import { resolvePrompt } from "./prompt-registry";
import crypto from "node:crypto";
// ponytail: state-store / news-store / finance-files 是 CJS 例外, 用 require 保持 any.
const stateStore: any = require("../main/state-store.js");
const newsStore: any = require("../main/finance/news-store.js");
const financeFiles: any = require("../main/finance/finance-files.js");

const SENTIMENT_LABELS = ["bullish", "bearish", "neutral"];
const IMPACT_DIRS = ["positive", "negative", "mixed"];
const IMPACT_MAGS = ["strong", "moderate", "weak"];

export function buildInterpretMessages(article: any) {
  const prompt = resolvePrompt("finance_news_interpret");
  const body = (article.body || article.summary || "").slice(0, 1500);
  const userLines = [
    "请解读以下财经新闻：",
    `标题：${article.title || ""}`,
    `来源：${article.source || ""}`,
    `分类：${article.category || ""}`,
    `正文：${body}`,
    "",
  ];
  if (prompt.fewShot && prompt.fewShot.trim()) {
    userLines.unshift(`【参考示例】\n${prompt.fewShot.trim()}\n`);
  }
  return [
    { role: "system", content: `${prompt.system}\n${prompt.rules}` },
    { role: "user", content: userLines.join("\n") },
  ];
}

export function parseInterpretResponse(text: any) {
  if (typeof text !== "string" || !text.trim()) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let p: any;
  try {
    p = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!p || typeof p !== "object") return null;
  const summary = typeof p.summary === "string" ? p.summary.trim() : "";
  if (!summary) return null;
  const sentimentLabel = SENTIMENT_LABELS.includes(p.sentiment?.label)
    ? p.sentiment.label
    : "neutral";
  const sentimentScore =
    typeof p.sentiment?.score === "number"
      ? Math.max(0, Math.min(1, p.sentiment.score))
      : 0.5;
  const impact = p.impact
    ? {
        sectors: Array.isArray(p.impact.sectors)
          ? p.impact.sectors
              .filter((x: any) => typeof x === "string" && x.trim())
              .map((x: any) => x.trim())
              .slice(0, 5)
          : [],
        direction: IMPACT_DIRS.includes(p.impact.direction)
          ? p.impact.direction
          : "mixed",
        magnitude: IMPACT_MAGS.includes(p.impact.magnitude)
          ? p.impact.magnitude
          : "moderate",
      }
    : undefined;
  const extracted = {
    tickers: Array.isArray(p.extracted?.tickers)
      ? p.extracted.tickers
          .filter((x: any) => typeof x === "string" && x.trim())
          .map((x: any) => x.trim())
          .slice(0, 8)
      : [],
    events: Array.isArray(p.extracted?.events)
      ? p.extracted.events
          .filter((x: any) => typeof x === "string" && x.trim())
          .map((x: any) => x.trim())
          .slice(0, 5)
      : [],
    figures: Array.isArray(p.extracted?.figures)
      ? p.extracted.figures
          .filter((x: any) => typeof x === "string" && x.trim())
          .map((x: any) => x.trim())
          .slice(0, 8)
      : [],
  };
  return {
    summary,
    highlights: Array.isArray(p.highlights)
      ? p.highlights
          .filter((x: any) => typeof x === "string" && x.trim())
          .map((x: any) => x.trim())
          .slice(0, 3)
      : [],
    sentiment: { label: sentimentLabel, score: sentimentScore },
    impact,
    extracted,
    disclaimer: true,
  };
}

function contentHash(article: any): string {
  const base = [
    article.id || "",
    article.title || "",
    article.body || "",
    article.source || "",
  ].join("\n");
  return crypto.createHash("sha256").update(base).digest("hex").slice(0, 16);
}

function loadCached(id: string, statePath?: any) {
  const state = financeFiles.readAiState(statePath);
  const all = state && typeof state === "object" ? state : {};
  return all[id] || null;
}

function saveCached(entry: any, statePath?: any) {
  const state = financeFiles.readAiState(statePath);
  const all = state && typeof state === "object" ? state : {};
  all[entry.id] = entry;
  financeFiles.writeAiState(all, statePath);
}

function clearCachedEntry(id: string, statePath?: any) {
  const state = financeFiles.readAiState(statePath);
  const all = state && typeof state === "object" ? state : {};
  if (!(id in all)) return;
  delete all[id];
  financeFiles.writeAiState(all, statePath);
}

export async function fetchFinanceInterpret(opts: any) {
  const id = opts && opts.id;
  if (!id || typeof id !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  const statePath = opts && opts.statePath;
  const article = newsStore.getArticle(statePath, id);
  if (!article) return { ok: false, reason: "article_not_found" };

  const hash = contentHash(article);
  if (!opts || !opts.force) {
    const cached = loadCached(id, statePath);
    if (cached && cached.contentHash === hash) {
      return { ok: true, cached: true, ...cached };
    }
  }

  const messages = buildInterpretMessages(article);
  const llm = await chatCompletion(messages, opts && opts.llmOpts);
  if (!llm.ok) {
    return { ok: false, reason: llm.reason || "llm_failed", error: llm.error };
  }

  const parsed = parseInterpretResponse(llm.text);
  if (!parsed) return { ok: false, reason: "parse_failed" };

  let model = "";
  try {
    const rc = resolveSharedAiConfig();
    if (rc && rc.ok) model = rc.model || "";
  } catch {
    /* 模型名仅用于展示，失败忽略 */
  }

  const entry = {
    id,
    contentHash: hash,
    generatedAt: Date.now(),
    model,
    ...parsed,
  };
  saveCached(entry, statePath);
  return { ok: true, cached: false, ...entry };
}

export function clearFinanceInterpret(id: string, statePath?: any) {
  if (!id || typeof id !== "string") return false;
  try {
    clearCachedEntry(id, statePath);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// P2：跨新闻聚合（基于近期 N 条本地文章，不外发）
// ─────────────────────────────────────────────────────────────

const AGGREGATE_MAX = 12;
const AGGREGATE_HORIZONS = ["short", "medium", "long"];

function aggregateKey(scope: string): string {
  return `aggregate__${scope || "all"}`;
}

export function buildAggregateMessages(pool: any[], scope: string) {
  const prompt = resolvePrompt("finance_news_aggregate");
  const items = (pool || [])
    .slice(0, AGGREGATE_MAX)
    .map((a: any, i: number) => {
      const body = (a.body || a.summary || "").slice(0, 360);
      return `${i + 1}. [${a.source || "未知源"}/${a.category || "未分类"}] ${
        a.title || ""
      }\n   ${body}`;
    })
    .join("\n");
  const scopeText =
    scope && scope !== "all" ? `分类：${scope}` : "全部分类";
  const userLines = [
    `以下是近期财经新闻（${scopeText}，共 ${pool ? pool.length : 0} 条）：`,
    "",
    items,
    "",
    "请基于以上新闻做跨新闻聚合分析，输出严格 JSON。",
  ];
  return [
    { role: "system", content: `${prompt.system}\n${prompt.rules}` },
    { role: "user", content: userLines.join("\n") },
  ];
}

export function parseAggregateResponse(text: any) {
  if (typeof text !== "string" || !text.trim()) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let p: any;
  try {
    p = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!p || typeof p !== "object") return null;
  const summary = typeof p.summary === "string" ? p.summary.trim() : "";
  if (!summary) return null;
  const strArr = (arr: any, max: number) =>
    Array.isArray(arr)
      ? arr
          .filter((x: any) => typeof x === "string" && x.trim())
          .map((x: any) => x.trim())
          .slice(0, max)
      : [];
  return {
    summary,
    themes: strArr(p.themes, 6),
    consensus: strArr(p.consensus, 4),
    conflicts: strArr(p.conflicts, 4),
    watchSignals: strArr(p.watchSignals, 4),
    affectedSectors: strArr(p.affectedSectors, 6),
    horizon: AGGREGATE_HORIZONS.includes(p.horizon) ? p.horizon : "medium",
    disclaimer: true,
  };
}

function aggregateHash(pool: any[], scope: string): string {
  const joined = (pool || [])
    .map((a) => [a && a.id, a && a.title, a && a.body].join("\n"))
    .join("\n");
  const base = [scope || "all", joined].join("\n");
  return crypto.createHash("sha256").update(base).digest("hex").slice(0, 16);
}

export async function fetchFinanceAggregate(opts: any) {
  const scope = (opts && opts.category) || "all";
  const statePath = opts && opts.statePath;
  const poolRaw = newsStore.getFiltered(statePath, {
    category: scope,
    sort: "time",
  });
  const pool = Array.isArray(poolRaw) ? poolRaw : [];
  if (pool.length === 0) return { ok: false, reason: "no_articles" };

  const hash = aggregateHash(pool, scope);
  const key = aggregateKey(scope);
  if (!opts || !opts.force) {
    const cached = loadCached(key, statePath);
    if (cached && cached.contentHash === hash) {
      return { ok: true, cached: true, ...cached };
    }
  }

  const llm = await chatCompletion(
    buildAggregateMessages(pool, scope),
    opts && opts.llmOpts,
  );
  if (!llm.ok) {
    return { ok: false, reason: llm.reason || "llm_failed", error: llm.error };
  }

  const parsed = parseAggregateResponse(llm.text);
  if (!parsed) return { ok: false, reason: "parse_failed" };

  let model = "";
  try {
    const rc = resolveSharedAiConfig();
    if (rc && rc.ok) model = rc.model || "";
  } catch {
    /* 模型名仅用于展示，失败忽略 */
  }

  const entry = {
    id: key,
    contentHash: hash,
    generatedAt: Date.now(),
    model,
    scope,
    ...parsed,
  };
  saveCached(entry, statePath);
  return { ok: true, cached: false, ...entry };
}
