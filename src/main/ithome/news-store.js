/**
 * src/main/ithome/news-store.js
 *
 * IT之家新闻缓存 — state.json.ithome_news
 */

const fs = require("fs");
const stateStore = require("../state-store");
const { HttpClient } = require("../http-client");
const { parseIthomeRss } = require("./rss-parser");
const { parseIthomeListPage } = require("./list-parser");
const {
  assertFetchableDate,
  isInCurrentMonth,
  todayShanghaiDateKey,
  listPageUrl,
} = require("./date-bounds");
const { mainLog } = require("../log");
const { enrichSummaryEntry } = require("./article-summary-parse");

const RSS_URL = "https://www.ithome.com/rss/";
const FETCH_TIMEOUT_MS = 20000;
/** 按自然日独立保留，避免全局上限挤掉已拉取日期的文章 */
const MAX_ARTICLES_PER_DAY = 400;

let _http = null;

// A3: 搜索索引引用 (setter 注入). 写盘成功后 upsert 单条 doc.
let _searchIndex = null;
function setSearchIndex(si) {
  _searchIndex = si;
}

/**
 * A3: 从单条 article + summary 构造搜索 Doc 并 upsert.
 * 复用 build-docs.js 的字段拼装逻辑 (单条版).
 */
function _upsertNewsDoc(id, news) {
  if (!_searchIndex || !id) return;
  try {
    const articles = (news && news.articles) || {};
    const summaries = (news && news.summaries) || {};
    const favorites = (news && news.favorites) || {};
    // favorites 优先 (含 summary 快照)
    const fav = favorites[id];
    const art = (fav && fav.article) || articles[id];
    if (!art) return;
    const sum = (fav && fav.summary) || summaries[id] || {};
    const searchText = [
      art.title, art.excerpt, art.body, sum.abstract,
      Array.isArray(sum.keywords) ? sum.keywords.join(" ") : "",
      sum.domain, sum.impact,
    ].filter(Boolean).join(" ");
    _searchIndex.upsert({
      id: `news:${id}`,
      source: "news",
      nativeId: id,
      title: art.title || id,
      snippet: art.excerpt || (sum.abstract ? sum.abstract.slice(0, 60) : ""),
      searchText,
      payload: {
        navTarget: "ithome",
        dateMs: art.fetchedAt || (fav && fav.favoritedAt) || 0,
        dateKey: art.dateKey,
      },
    });
  } catch {
    /* noop — 搜索索引 upsert 失败不影响主功能 */
  }
}

/**
 * A3: 删除单条 news doc (取消收藏且 articles 无此条时).
 */
function _removeNewsDoc(id) {
  if (!_searchIndex || !id) return;
  try {
    _searchIndex.remove(`news:${id}`);
  } catch {
    /* noop */
  }
}
function http() {
  if (!_http) {
    _http = new HttpClient({
      timeout: FETCH_TIMEOUT_MS,
      maxBodyBytes: 3 * 1024 * 1024,
    });
  }
  return _http;
}

function _readStateRaw(statePath) {
  const p = statePath || stateStore.defaultPath();
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? j : {};
  } catch (err) {
    if (err && err.code === "ENOENT") return {};
    mainLog.warn("[ithome/news-store] state read failed", {
      msg: err && err.message,
    });
    return {};
  }
}

function _emptyNews() {
  return { ts: 0, articles: {}, summaries: {}, favorites: {}, dayStats: {} };
}

function _normalizeNews(raw) {
  if (!raw || typeof raw !== "object") return _emptyNews();
  return {
    ts: typeof raw.ts === "number" ? raw.ts : 0,
    articles:
      raw.articles && typeof raw.articles === "object" ? raw.articles : {},
    summaries:
      raw.summaries && typeof raw.summaries === "object" ? raw.summaries : {},
    favorites:
      raw.favorites && typeof raw.favorites === "object" ? raw.favorites : {},
    dayStats:
      raw.dayStats && typeof raw.dayStats === "object" ? raw.dayStats : {},
  };
}

function _pruneDayStats(dayStats, now = new Date()) {
  const out = {};
  for (const [dateKey, entry] of Object.entries(dayStats || {})) {
    if (!entry || typeof entry !== "object") continue;
    if (!isInCurrentMonth(dateKey, now)) continue;
    const count = typeof entry.count === "number" ? entry.count : 0;
    const fetchedAt = typeof entry.fetchedAt === "number" ? entry.fetchedAt : 0;
    if (count > 0) out[dateKey] = { count, fetchedAt };
  }
  return out;
}

function _pruneArticles(articles, now = new Date()) {
  const byDay = {};
  for (const a of Object.values(articles || {})) {
    if (!a || !a.id || !a.dateKey || !isInCurrentMonth(a.dateKey, now)) {
      continue;
    }
    if (!byDay[a.dateKey]) byDay[a.dateKey] = [];
    byDay[a.dateKey].push(a);
  }
  const out = {};
  for (const items of Object.values(byDay)) {
    items.sort((a, b) => {
      const ta = Date.parse(a.pubDate || "") || 0;
      const tb = Date.parse(b.pubDate || "") || 0;
      return tb - ta;
    });
    for (const a of items.slice(0, MAX_ARTICLES_PER_DAY)) {
      out[a.id] = a;
    }
  }
  return out;
}

function _enrichSummaries(summaries) {
  const out = {};
  for (const [id, entry] of Object.entries(summaries || {})) {
    if (!entry || typeof entry !== "object") continue;
    const fields = enrichSummaryEntry(entry);
    out[id] = { ...entry, ...fields };
  }
  return out;
}

function _mergeSummariesForLoad(news) {
  const summaries = _enrichSummaries(news.summaries);
  for (const [id, fav] of Object.entries(news.favorites || {})) {
    if (!fav || !fav.summary || summaries[id]) continue;
    summaries[id] = _enrichSummaries({ [id]: fav.summary })[id];
  }
  return summaries;
}

function loadAll(statePath) {
  const raw = _readStateRaw(statePath);
  const news = _normalizeNews(raw.ithome_news);
  return {
    ok: true,
    ...news,
    summaries: _mergeSummariesForLoad(news),
  };
}

function _writeNews(news, statePath) {
  const path = statePath || stateStore.defaultPath();
  const existing = _readStateRaw(path);
  const next = {
    ...existing,
    v: existing.v || stateStore.SCHEMA_VERSION,
    apps:
      existing.apps && typeof existing.apps === "object" ? existing.apps : {},
    mutes:
      existing.mutes && typeof existing.mutes === "object"
        ? existing.mutes
        : {},
    ithome_news: news,
  };
  stateStore.writeAtomic(path, next);
}

function getArticle(id, statePath) {
  const news = _normalizeNews(_readStateRaw(statePath).ithome_news);
  if (news.articles[id]) return news.articles[id];
  const fav = news.favorites[id];
  return fav && fav.article ? fav.article : null;
}

function isFavorited(id, statePath) {
  const news = _normalizeNews(_readStateRaw(statePath).ithome_news);
  return !!(news.favorites && news.favorites[id]);
}

function _mergeArticles(cur, parsed, now) {
  const articles = { ...cur.articles };
  for (const item of parsed) {
    const prev = articles[item.id];
    articles[item.id] = {
      ...item,
      excerpt: prev?.excerpt || item.excerpt || "",
      body: prev?.body || "",
      bodyFetchedAt: prev?.bodyFetchedAt || 0,
      comments: prev?.comments || [],
      commentsFetchedAt: prev?.commentsFetchedAt || 0,
      fetchedAt: prev?.fetchedAt || now,
      updatedAt: now,
      readAt: prev?.readAt || item.readAt || 0,
    };
  }
  return articles;
}

function _finalizeNews(cur, articles, dayStats, now) {
  const at = new Date(now);
  const pruned = _pruneArticles(articles, at);
  const prunedDayStats = _pruneDayStats(
    { ...(cur.dayStats || {}), ...(dayStats || {}) },
    at,
  );
  const summaryIds = new Set(Object.keys(pruned));
  const favorites = { ...(cur.favorites || {}) };
  const summaries = {};
  for (const [id, s] of Object.entries(cur.summaries || {})) {
    if (summaryIds.has(id)) {
      summaries[id] = s;
      continue;
    }
    if (favorites[id] && s) {
      favorites[id] = {
        ...favorites[id],
        summary: favorites[id].summary || { ...s },
      };
    }
  }
  return {
    ts: now,
    articles: pruned,
    summaries,
    favorites,
    dayStats: prunedDayStats,
  };
}

/**
 * 拉取指定日期列表页 (仅当月)
 */
async function fetchDay(dateKey, statePath) {
  try {
    assertFetchableDate(dateKey);
  } catch (err) {
    return { ok: false, reason: err.code || "invalid_date" };
  }

  const url = listPageUrl(dateKey);
  const r = await http().get(url, {
    timeout: FETCH_TIMEOUT_MS,
    headers: {
      Accept: "text/html",
      "Accept-Language": "zh-CN,zh;q=0.9",
    },
  });
  if (!r || r.status !== 200 || !r.body) {
    return {
      ok: false,
      reason: r && r.error ? r.error : "fetch_failed",
      status: r && r.status,
    };
  }

  const parsed = parseIthomeListPage(r.body, dateKey);
  if (parsed.length === 0) {
    return { ok: false, reason: "parse_empty", dateKey };
  }

  const cur = _normalizeNews(_readStateRaw(statePath).ithome_news);
  const now = Date.now();
  const articles = _mergeArticles(cur, parsed, now);
  const dayStats = {
    [dateKey]: { count: parsed.length, fetchedAt: now },
  };
  const news = _finalizeNews(cur, articles, dayStats, now);
  _writeNews(news, statePath);

  const dayCount = parsed.length;
  return {
    ok: true,
    dateKey,
    added: dayCount,
    total: Object.keys(news.articles).length,
    dayCount,
    ts: now,
  };
}

/**
 * 拉取 RSS 并合并 (补充 excerpt，仍限制当月)
 */
async function refresh(statePath) {
  const today = todayShanghaiDateKey();
  const dayResult = await fetchDay(today, statePath);
  if (!dayResult.ok && dayResult.reason !== "parse_empty") {
    return dayResult;
  }

  const r = await http().get(RSS_URL, {
    timeout: FETCH_TIMEOUT_MS,
    headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" },
  });
  if (!r || r.status !== 200 || !r.body) {
    if (dayResult.ok) return dayResult;
    return {
      ok: false,
      reason: r && r.error ? r.error : "fetch_failed",
      status: r && r.status,
    };
  }

  const parsed = parseIthomeRss(r.body).filter((item) =>
    isInCurrentMonth(item.dateKey),
  );
  const cur = _normalizeNews(_readStateRaw(statePath).ithome_news);
  const now = Date.now();
  const articles = { ...cur.articles };
  for (const item of parsed) {
    const prev = articles[item.id];
    articles[item.id] = {
      ...item,
      category: prev?.category || "",
      body: prev?.body || "",
      bodyFetchedAt: prev?.bodyFetchedAt || 0,
      comments: prev?.comments || [],
      commentsFetchedAt: prev?.commentsFetchedAt || 0,
      fetchedAt: prev?.fetchedAt || now,
      updatedAt: now,
      excerpt: item.excerpt || prev?.excerpt || "",
      readAt: prev?.readAt || item.readAt || 0,
    };
  }
  const news = _finalizeNews(cur, articles, {}, now);
  _writeNews(news, statePath);
  return {
    ok: true,
    added: parsed.length,
    total: Object.keys(news.articles).length,
    ts: now,
    dateKey: today,
  };
}

function markArticleRead(id, statePath) {
  if (!id || typeof id !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  const cur = _normalizeNews(_readStateRaw(statePath).ithome_news);
  if (!cur.articles[id] && !(cur.favorites && cur.favorites[id])) {
    return { ok: false, reason: "article_not_found" };
  }
  const articles = { ...cur.articles };
  if (articles[id] && !articles[id].readAt) {
    articles[id] = {
      ...articles[id],
      readAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
  const favorites = { ...(cur.favorites || {}) };
  if (favorites[id] && favorites[id].article && !favorites[id].article.readAt) {
    favorites[id] = {
      ...favorites[id],
      article: {
        ...favorites[id].article,
        readAt: Date.now(),
      },
    };
  }
  const news = { ...cur, articles, favorites, ts: Date.now() };
  _writeNews(news, statePath);
  return { ok: true };
}

function attachArticleBody(id, body, statePath) {
  if (!id || typeof id !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  const cur = _normalizeNews(_readStateRaw(statePath).ithome_news);
  if (!cur.articles[id] && !(cur.favorites && cur.favorites[id])) {
    return { ok: false, reason: "article_not_found" };
  }
  const articles = { ...cur.articles };
  if (articles[id]) {
    articles[id] = {
      ...articles[id],
      body: typeof body === "string" ? body : "",
      bodyFetchedAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
  const favorites = { ...(cur.favorites || {}) };
  if (favorites[id]) {
    favorites[id] = {
      ...favorites[id],
      article: {
        ...(favorites[id].article || {}),
        body: typeof body === "string" ? body : "",
        bodyFetchedAt: Date.now(),
      },
    };
  }
  const news = { ...cur, articles, favorites, ts: Date.now() };
  _writeNews(news, statePath);
  _upsertNewsDoc(id, news);
  return { ok: true };
}

function attachArticleComments(id, comments, statePath) {
  if (!id || typeof id !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  const cur = _normalizeNews(_readStateRaw(statePath).ithome_news);
  const inArticles = !!cur.articles[id];
  const inFavorites = !!(cur.favorites && cur.favorites[id]);
  const nextComments = Array.isArray(comments) ? comments : [];
  const fetchedAt = Date.now();
  const articles = { ...cur.articles };
  if (inArticles) {
    articles[id] = {
      ...articles[id],
      comments: nextComments,
      commentsFetchedAt: fetchedAt,
      updatedAt: fetchedAt,
    };
  } else {
    // renderer 只持有内存信号、main 进程 state 还没这个 article 时，主动 stub
    // 一个最小 article，让评论缓存能落盘。
    articles[id] = {
      id,
      link: id,
      title: "",
      dateKey: "",
      fetchedAt: fetchedAt,
      updatedAt: fetchedAt,
      excerpt: "",
      body: "",
      bodyFetchedAt: 0,
      comments: nextComments,
      commentsFetchedAt: fetchedAt,
      readAt: 0,
    };
  }
  const favorites = { ...(cur.favorites || {}) };
  if (inFavorites) {
    favorites[id] = {
      ...favorites[id],
      article: {
        ...(favorites[id].article || {}),
        comments: nextComments,
        commentsFetchedAt: fetchedAt,
      },
    };
  }
  const news = { ...cur, articles, favorites, ts: fetchedAt };
  _writeNews(news, statePath);
  _upsertNewsDoc(id, news);
  return { ok: true, comments: nextComments, commentsFetchedAt: fetchedAt };
}

function saveSummary(id, entry, statePath) {
  const cur = _normalizeNews(_readStateRaw(statePath).ithome_news);
  const inArticles = !!cur.articles[id];
  const inFavorites = !!(cur.favorites && cur.favorites[id]);
  if (!inArticles && !inFavorites) {
    return { ok: false, reason: "article_not_found" };
  }
  const summaries = { ...cur.summaries };
  if (inArticles) summaries[id] = entry;
  const favorites = { ...cur.favorites };
  if (inFavorites) {
    favorites[id] = {
      ...favorites[id],
      summary: { ...entry },
    };
  }
  const news = { ...cur, summaries, favorites, ts: Date.now() };
  _writeNews(news, statePath);
  _upsertNewsDoc(id, news);
  return { ok: true };
}

function toggleFavorite(id, statePath) {
  const cur = _normalizeNews(_readStateRaw(statePath).ithome_news);
  const favorites = { ...(cur.favorites || {}) };

  if (favorites[id]) {
    delete favorites[id];
    const news = { ...cur, favorites, ts: Date.now() };
    _writeNews(news, statePath);
    // 取消收藏: 若 articles 仍有此条则 upsert (用 article 版本重建 doc), 否则 remove
    if (news.articles && news.articles[id]) _upsertNewsDoc(id, news);
    else _removeNewsDoc(id);
    return { ok: true, favorited: false, id };
  }

  const article = cur.articles[id];
  if (!article) {
    return { ok: false, reason: "article_not_found" };
  }

  const summary = cur.summaries[id] || null;
  favorites[id] = {
    article: { ...article },
    favoritedAt: Date.now(),
    summary: summary ? { ...summary } : null,
  };
  const news = { ...cur, favorites, ts: Date.now() };
  _writeNews(news, statePath);
  _upsertNewsDoc(id, news);
  return { ok: true, favorited: true, id };
}

module.exports = {
  RSS_URL,
  loadAll,
  refresh,
  fetchDay,
  getArticle,
  saveSummary,
  toggleFavorite,
  isFavorited,
  attachArticleBody,
  attachArticleComments,
  markArticleRead,
  setSearchIndex,
  _pruneArticles,
  _mergeArticles,
  MAX_ARTICLES_PER_DAY,
};
