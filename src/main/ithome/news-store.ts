/**
 * src/main/ithome/news-store.ts
 *
 * IT之家新闻缓存 — state.json.ithome_news
 */
"use strict";

const fs = require("fs");
const stateStore = require("../state-store.ts");
const { HttpClient } = require("../http-client.ts");
const { parseIthomeRss } = require("./rss-parser.ts");
const { parseIthomeListPage } = require("./list-parser.ts");
const {
    assertFetchableDate,
    isInCurrentMonth,
    todayShanghaiDateKey,
    listPageUrl,
} = require("./date-bounds.ts");
const { mainLog } = require("../log.ts");
const { enrichSummaryEntry } = require("./article-summary-parse.ts");

const RSS_URL = "https://www.ithome.com/rss/";
const FETCH_TIMEOUT_MS = 20000;
/** 按自然日独立保留，避免全局上限挤掉已拉取日期的文章 */
const MAX_ARTICLES_PER_DAY = 400;

let _http: any = null;

let _searchIndex: any = null;
export function setSearchIndex(si: any): void {
    _searchIndex = si;
}

function _upsertNewsDoc(id: string, news: any): void {
    if (!_searchIndex || !id) return;
    try {
        const articles = (news && news.articles) || {};
        const summaries = (news && news.summaries) || {};
        const favorites = (news && news.favorites) || {};
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

function _removeNewsDoc(id: string): void {
    if (!_searchIndex || !id) return;
    try {
        _searchIndex.remove(`news:${id}`);
    } catch {
        /* noop */
    }
}
function http(): any {
    if (!_http) {
        _http = new HttpClient({
            timeout: FETCH_TIMEOUT_MS,
            maxBodyBytes: 3 * 1024 * 1024,
        });
    }
    return _http;
}

function _readStateRaw(statePath: any): any {
    const p = statePath || stateStore.defaultPath();
    try {
        const raw = fs.readFileSync(p, "utf-8");
        const j = JSON.parse(raw);
        return j && typeof j === "object" ? j : {};
    } catch (err: any) {
        if (err && err.code === "ENOENT") return {};
        mainLog.warn("[ithome/news-store] state read failed", {
            msg: err && err.message,
        });
        return {};
    }
}

function _emptyNews(): any {
    return { ts: 0, articles: {}, summaries: {}, favorites: {}, dayStats: {} };
}

function _normalizeNews(raw: any): any {
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

function _pruneDayStats(dayStats: any, now: Date = new Date()): any {
    const out: any = {};
    for (const [dateKey, rawEntry] of Object.entries(dayStats || {})) {
        const entry = rawEntry as any;
        if (!entry || typeof entry !== "object") continue;
        if (!isInCurrentMonth(dateKey, now)) continue;
        const count = typeof entry.count === "number" ? entry.count : 0;
        const fetchedAt = typeof entry.fetchedAt === "number" ? entry.fetchedAt : 0;
        if (count > 0) out[dateKey] = { count, fetchedAt };
    }
    return out;
}

function _pruneArticles(articles: any, now: Date = new Date()): any {
    const byDay: any = {};
    for (const rawA of Object.values(articles || {})) {
        const a = rawA as any;
        if (!a || !a.id || !a.dateKey || !isInCurrentMonth(a.dateKey, now)) {
            continue;
        }
        if (!byDay[a.dateKey]) byDay[a.dateKey] = [];
        byDay[a.dateKey].push(a);
    }
    const out: any = {};
    for (const rawItems of Object.values(byDay)) {
        const items = rawItems as any[];
        items.sort((a: any, b: any) => {
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

function _enrichSummaries(summaries: any): any {
    const out: any = {};
    for (const [id, entry] of Object.entries(summaries || {})) {
        if (!entry || typeof entry !== "object") continue;
        const fields = enrichSummaryEntry(entry);
        out[id] = { ...entry, ...fields };
    }
    return out;
}

function _mergeSummariesForLoad(news: any): any {
    const summaries = _enrichSummaries(news.summaries);
    for (const [id, rawFav] of Object.entries(news.favorites || {})) {
        const fav = rawFav as any;
        if (!fav || !fav.summary || summaries[id]) continue;
        summaries[id] = _enrichSummaries({ [id]: fav.summary })[id];
    }
    return summaries;
}

export function loadAll(statePath: any): any {
    const raw = _readStateRaw(statePath);
    const news = _normalizeNews(raw.ithome_news);
    return {
        ok: true,
        ...news,
        summaries: _mergeSummariesForLoad(news),
    };
}

function _writeNews(news: any, statePath: any): void {
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

export function getArticle(id: string, statePath: any): any {
    const news = _normalizeNews(_readStateRaw(statePath).ithome_news);
    if (news.articles[id]) return news.articles[id];
    const fav = news.favorites[id];
    return fav && fav.article ? fav.article : null;
}

export function isFavorited(id: string, statePath: any): boolean {
    const news = _normalizeNews(_readStateRaw(statePath).ithome_news);
    return !!(news.favorites && news.favorites[id]);
}

function _mergeArticles(cur: any, parsed: any[], now: number): any {
    const articles = { ...cur.articles };
    for (const item of parsed) {
        const prev = articles[item.id];
        articles[item.id] = {
            ...item,
            excerpt: prev?.excerpt || item.excerpt || "",
            fetchedAt: prev?.fetchedAt || now,
            updatedAt: now,
            readAt: prev?.readAt || item.readAt || 0,
        };
    }
    return articles;
}

function _finalizeNews(cur: any, articles: any, dayStats: any, now: number): any {
    const at = new Date(now);
    const pruned = _pruneArticles(articles, at);
    const prunedDayStats = _pruneDayStats(
        { ...(cur.dayStats || {}), ...(dayStats || {}) },
        at,
    );
    const summaryIds = new Set(Object.keys(pruned));
    const favorites = { ...(cur.favorites || {}) };
    const summaries: any = {};
    for (const [id, rawS] of Object.entries(cur.summaries || {})) {
        const s = rawS as any;
        if (summaryIds.has(id)) {
            summaries[id] = s;
            continue;
        }
        if (favorites[id] && s) {
            const favEntry = favorites[id] as any;
            favorites[id] = {
                ...favEntry,
                summary: favEntry.summary || { ...s },
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
export async function fetchDay(dateKey: string, statePath: any): Promise<any> {
    try {
        assertFetchableDate(dateKey);
    } catch (err: any) {
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
export async function refresh(statePath: any): Promise<any> {
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

    const parsed = parseIthomeRss(r.body).filter((item: any) =>
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

export function markArticleRead(id: string, statePath: any): any {
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

export function attachArticleBody(id: string, body: any, statePath: any): any {
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

export function saveSummary(id: string, entry: any, statePath: any): any {
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

export function toggleFavorite(id: string, statePath: any): any {
    const cur = _normalizeNews(_readStateRaw(statePath).ithome_news);
    const favorites = { ...(cur.favorites || {}) };

    if (favorites[id]) {
        delete favorites[id];
        const news = { ...cur, favorites, ts: Date.now() };
        _writeNews(news, statePath);
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
    markArticleRead,
    setSearchIndex,
    _pruneArticles,
    _mergeArticles,
    MAX_ARTICLES_PER_DAY,
};
