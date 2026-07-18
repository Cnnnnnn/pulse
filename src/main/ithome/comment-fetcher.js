const { HttpClient } = require("../http-client");
const { mainLog } = require("../log");
const newsStore = require("./news-store");
const {
  extractCommentParams,
  parseCommentResponse,
} = require("./comment-parser");

const FETCH_TIMEOUT_MS = 20000;
const COMMENTS_URL = "https://cmt.ithome.com/api/webcomment/getnewscomment";

function _defaultHttp() {
  return new HttpClient({
    timeout: FETCH_TIMEOUT_MS,
    maxBodyBytes: 2 * 1024 * 1024,
  });
}

function _isLoaded(article) {
  return article && Number.isFinite(article.commentsFetchedAt);
}

async function fetchAndAttachComments(opts) {
  const id = opts && opts.id;
  if (!id || typeof id !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  const statePath = opts.statePath;
  const article = newsStore.getArticle(id, statePath);
  if (!article) return { ok: false, reason: "article_not_found" };
  if (_isLoaded(article)) {
    return {
      ok: true,
      reason: "already_loaded",
      comments: Array.isArray(article.comments) ? article.comments : [],
    };
  }

  const http = opts.http || _defaultHttp();
  let page;
  try {
    page = await http.get(article.link || id, {
      timeout: FETCH_TIMEOUT_MS,
      headers: {
        Accept: "text/html",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });
  } catch (err) {
    mainLog.warn("[ithome/comment-fetcher] article page failed", {
      id,
      msg: err && err.message,
    });
    return { ok: false, reason: "fetch_failed" };
  }
  if (!page || page.status !== 200 || !page.body) {
    return { ok: false, reason: "fetch_failed" };
  }

  const params = extractCommentParams(page.body);
  if (!params.ok) return params;
  const url = `${COMMENTS_URL}?sn=${encodeURIComponent(params.sn)}&cid=0&isInit=true&appver=900`;
  let response;
  try {
    response = await http.get(url, {
      timeout: FETCH_TIMEOUT_MS,
      headers: {
        Accept: "application/json",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });
  } catch (err) {
    mainLog.warn("[ithome/comment-fetcher] comments request failed", {
      id,
      msg: err && err.message,
    });
    return { ok: false, reason: "fetch_failed" };
  }
  if (!response || response.status !== 200 || !response.body) {
    return { ok: false, reason: "fetch_failed" };
  }

  const parsed = parseCommentResponse(response.body);
  if (!parsed.ok) return parsed;
  const saved = newsStore.attachArticleComments(id, parsed.comments, statePath);
  if (!saved.ok) return saved;
  return { ok: true, reason: "fetched", comments: parsed.comments };
}

module.exports = {
  COMMENTS_URL,
  fetchAndAttachComments,
};
