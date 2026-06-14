/**
 * src/main/ithome/article-page-fetcher.js
 *
 * 按需拉取 IT之家文章详情页正文并写入 state.json.ithome_news.articles[id].body
 * —— 由 article-ai 在 excerpt 太短时触发，避免 LLM 只看到标题而编"原文缺失"。
 */

const { HttpClient } = require("../http-client");
const {
  parseIthomeArticlePage,
  hasArticleContent,
} = require("./article-page-parser");
const newsStore = require("./news-store");
const { mainLog } = require("../log");

const FETCH_TIMEOUT_MS = 20000;
const MIN_USEFUL_BODY_CHARS = 200;
const MAX_USEFUL_BODY_CHARS = 12000;

function _defaultHttp() {
  return new HttpClient({
    timeout: FETCH_TIMEOUT_MS,
    maxBodyBytes: 3 * 1024 * 1024,
  });
}

function _clip(s) {
  if (!s) return "";
  return s.length > MAX_USEFUL_BODY_CHARS
    ? s.slice(0, MAX_USEFUL_BODY_CHARS)
    : s;
}

function needsBodyFetch(article) {
  if (!article) return false;
  const body = (article.body || "").trim();
  if (body.length >= MIN_USEFUL_BODY_CHARS) return false;
  const excerpt = (article.excerpt || "").trim();
  if (excerpt.length >= MIN_USEFUL_BODY_CHARS) return false;
  return true;
}

/**
 * @param {{ id: string, statePath?: string, http?: { get: Function } }} opts
 */
async function fetchAndAttachBody(opts) {
  const id = opts && opts.id;
  if (!id || typeof id !== "string") {
    return { ok: false, reason: "invalid_args", body: "" };
  }
  const statePath = opts.statePath;
  const article = newsStore.getArticle(id, statePath);
  if (!article) {
    return { ok: false, reason: "article_not_found", body: "" };
  }
  if (!needsBodyFetch(article)) {
    return {
      ok: true,
      reason: "already_loaded",
      body: _clip(article.body || article.excerpt || ""),
    };
  }

  const http = opts.http || _defaultHttp();
  const link = article.link || id;
  let r;
  try {
    r = await http.get(link, {
      timeout: FETCH_TIMEOUT_MS,
      headers: {
        Accept: "text/html",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });
  } catch (err) {
    mainLog.warn("[ithome/article-page-fetcher] http threw", {
      id,
      msg: err && err.message,
    });
    return { ok: false, reason: "fetch_failed", body: "" };
  }
  if (!r || r.status !== 200 || !r.body) {
    return { ok: false, reason: "fetch_failed", body: "" };
  }
  const parsed = parseIthomeArticlePage(r.body);
  if (!hasArticleContent(parsed)) {
    return {
      ok: false,
      reason: "parse_failed",
      body: "",
      detail: parsed.reason,
    };
  }
  const body = _clip(parsed.body);
  newsStore.attachArticleBody(id, body, statePath);
  return { ok: true, reason: "fetched", body };
}

module.exports = {
  fetchAndAttachBody,
  needsBodyFetch,
  MIN_USEFUL_BODY_CHARS,
  MAX_USEFUL_BODY_CHARS,
};
