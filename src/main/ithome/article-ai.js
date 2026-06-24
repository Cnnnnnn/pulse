/**
 * src/main/ithome/article-ai.js
 *
 * IT之家文章 AI 摘要 (共用 Pulse AI 配置)
 */

const crypto = require("crypto");
const { chatCompletion } = require("../../ai/shared-llm");
const { resolvePrompt } = require("../../ai/prompt-registry");
const { sanitizeLlmOutput } = require("../../ai/sanitize-llm-output");
const newsStore = require("./news-store");
const {
  fetchAndAttachBody,
  needsBodyFetch,
} = require("./article-page-fetcher");
const { mainLog } = require("../log");
const {
  parseArticleSummary,
  enrichSummaryEntry,
} = require("./article-summary-parse");

const PROMPT_BODY_LIMIT = 5000;
const MIN_USEFUL_BODY_CHARS = 200;

function summaryResponse(entry, cached) {
  const fields = enrichSummaryEntry(entry);
  return {
    ok: true,
    text: entry.text,
    abstract: fields.abstract,
    keywords: fields.keywords,
    domain: fields.domain,
    impact: fields.impact,
    cached,
    id: entry.id,
  };
}

function contentHash(article) {
  const body = (article && article.body) || "";
  const base = `${article.title || ""}\n${article.excerpt || ""}\n${body}`;
  return crypto.createHash("sha256").update(base).digest("hex").slice(0, 16);
}

function buildMessages(article) {
  const body = (article.body || "").trim();
  const excerpt = (article.excerpt || "").trim();
  let primary;
  let label;
  if (body.length >= MIN_USEFUL_BODY_CHARS) {
    primary = body.slice(0, PROMPT_BODY_LIMIT);
    label = "正文：";
  } else if (excerpt) {
    primary = excerpt.slice(0, PROMPT_BODY_LIMIT);
    label = "正文摘录：";
  } else {
    primary = "(无原文正文，请根据标题给出简短说明，并注明信息可能不完整)";
    label = "正文：";
  }
  const prompt = resolvePrompt("ithome_summary");
  return [
    {
      role: "system",
      content: `${prompt.system}\n${prompt.rules}`,
    },
    {
      role: "user",
      content: [
        "请总结以下 IT之家文章的主要内容：",
        `标题：${article.title || ""}`,
        "",
        label,
        primary,
      ].join("\n"),
    },
  ];
}

/**
 * @param {{ id: string, force?: boolean, http?: object, statePath?: string }} opts
 */
async function summarizeArticle(opts) {
  const id = opts && opts.id;
  if (!id || typeof id !== "string") {
    return { ok: false, reason: "invalid_args" };
  }

  const statePath = opts && opts.statePath;
  const article = newsStore.getArticle(id, statePath);
  if (!article) {
    return { ok: false, reason: "article_not_found" };
  }

  // 1) 如果 excerpt 偏短，按需抓详情页正文 (用 fetcher 落盘)
  if (needsBodyFetch(article)) {
    try {
      const r = await fetchAndAttachBody({
        id,
        statePath,
        http: opts && opts.http,
      });
      if (r && r.ok && r.body) {
        article.body = r.body;
      } else {
        mainLog.warn("[ithome/article-ai] body fetch skipped", {
          id,
          reason: r && r.reason,
        });
      }
    } catch (err) {
      mainLog.warn("[ithome/article-ai] body fetch threw", {
        id,
        msg: err && err.message,
      });
    }
  }

  // 2) 算 hash + 命中缓存
  const hash = contentHash(article);
  const loaded = newsStore.loadAll(statePath);
  const cached = loaded.summaries && loaded.summaries[id];
  if (!opts.force && cached && cached.contentHash === hash && cached.text) {
    return summaryResponse(
      { ...cached, text: sanitizeLlmOutput(cached.text), id },
      true,
    );
  }

  // 3) 调 LLM
  const llm = await chatCompletion(buildMessages(article));
  if (!llm.ok) {
    mainLog.warn("[ithome/article-ai] llm failed", {
      id,
      reason: llm.reason,
    });
    return { ok: false, reason: llm.reason || "llm_failed", error: llm.error };
  }

  const cleanText = sanitizeLlmOutput(llm.text);
  const fields = parseArticleSummary(cleanText);
  const entry = {
    text: cleanText,
    abstract: fields.abstract,
    keywords: fields.keywords,
    domain: fields.domain,
    impact: fields.impact,
    contentHash: hash,
    generatedAt: Date.now(),
    provider: "shared",
  };
  newsStore.saveSummary(id, entry, statePath);
  return summaryResponse({ ...entry, id }, false);
}

module.exports = {
  summarizeArticle,
  contentHash,
  buildMessages,
  parseArticleSummary,
  enrichSummaryEntry,
};
