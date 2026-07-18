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
  return article && Number.isFinite(article.commentsFetchedAt) && article.commentsFetchedAt > 0;
}

async function fetchAndAttachComments(opts) {
  const id = opts && opts.id;
  if (!id || typeof id !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  const statePath = opts.statePath;
  // renderer 传进来的是完整 URL（id 即 link），fetcher 不再依赖 state 中是否
  // 已缓存该文章；只有当 state 已有缓存时短路返回，避免重复请求。
  const stateArticle = newsStore.getArticle(id, statePath);
  let article = stateArticle;
  if (!article) {
    // renderer signal 里有这个 id 但 main 进程 state 没有（renderer 没触发过
    // fetchDay 落盘、或用户首次点评论）。创建一个 minimal article stub 让后续
    // attachArticleComments 可以写入。
    article = {
      id,
      link: id,
      title: "",
      dateKey: "",
      fetchedAt: 0,
      updatedAt: 0,
      excerpt: "",
      body: "",
      bodyFetchedAt: 0,
      comments: [],
      commentsFetchedAt: 0,
      readAt: 0,
    };
  }
  if (_isLoaded(article)) {
    return {
      ok: true,
      reason: "already_loaded",
      comments: Array.isArray(article.comments) ? article.comments : [],
    };
  }

  const http = opts.http || _defaultHttp();
  const articleUrl = (article && article.link) || id;
  let page;
  try {
    page = await http.get(articleUrl, {
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
