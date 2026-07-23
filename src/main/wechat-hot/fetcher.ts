/**
 * src/main/wechat-hot/fetcher.ts
 *
 * IO: 拉取微博热搜, 调 list-parser 归一化, 返回 WechatHotPayload.
 * 主源 xxapi (简单, 无 anti-bot), fallback 微博官方 ajax (需 Referer).
 *
 * v2.24.1:
 *   - 主: https://v2.xxapi.cn/api/weibohot (返 { code:200, data:[...] })
 *   - fallback: https://weibo.com/ajax/side/hotSearch (返 { ok:1, data:{ realtime:[{word,num,...}], hotgov:{...} } })
 *
 * 不导入 electron / node:http — 边界在 cache.js / register-wechat-hot.js.
 */
"use strict";

const { parseWechatHotPayload } = require("./list-parser.ts");

const SOURCE_PRIMARY = "xxapi";
const SOURCE_FALLBACK = "weibo.com";
const URL_PRIMARY = "https://v2.xxapi.cn/api/weibohot";
const URL_FALLBACK = "https://weibo.com/ajax/side/hotSearch";
const DEFAULT_TIMEOUT_MS = 10000;
const FALLBACK_HEADERS = {
    Referer: "https://weibo.com/",
    "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
};

/**
 * @param args { httpClient, timeoutMs }
 * @returns Promise<WechatHotPayload>
 */
export async function fetchWechatHot({
    httpClient,
    timeoutMs = DEFAULT_TIMEOUT_MS,
}: any = {}): Promise<any> {
    if (!httpClient || typeof httpClient.get !== "function") {
        throw withReason("fetch_failed", "httpClient missing");
    }

    try {
        const items = await fetchAndParsePrimary(httpClient, timeoutMs);
        return { items, fetchedAt: Date.now(), source: SOURCE_PRIMARY };
    } catch (primaryErr) {
        try {
            const items = await fetchAndParseFallback(httpClient, timeoutMs);
            return { items, fetchedAt: Date.now(), source: SOURCE_FALLBACK };
        } catch (fallbackErr) {
            throw primaryErr;
        }
    }
}

async function fetchAndParsePrimary(httpClient: any, timeoutMs: number): Promise<any[]> {
    const res = await httpClient.get(URL_PRIMARY, { timeout: timeoutMs });
    if (res && (res.error === "timeout" || res.error === "network")) {
        throw withReason("http_timeout", res.error);
    }
    if (
        !res ||
        typeof res.status !== "number" ||
        res.status < 200 ||
        res.status >= 300
    ) {
        throw withReason("fetch_failed", `xxapi status=${res && res.status}`);
    }
    let raw: any;
    try {
        raw = JSON.parse(res.body);
    } catch {
        throw withReason("parse_failed", "xxapi json parse threw");
    }
    return parseWechatHotPayload(raw);
}

async function fetchAndParseFallback(httpClient: any, timeoutMs: number): Promise<any[]> {
    const res = await httpClient.get(URL_FALLBACK, {
        timeout: timeoutMs,
        headers: FALLBACK_HEADERS,
    });
    if (res && (res.error === "timeout" || res.error === "network")) {
        throw withReason("http_timeout", `weibo.com ${res.error}`);
    }
    if (
        !res ||
        typeof res.status !== "number" ||
        res.status < 200 ||
        res.status >= 300
    ) {
        throw withReason("fetch_failed", `weibo.com status=${res && res.status}`);
    }
    let raw: any;
    try {
        raw = JSON.parse(res.body);
    } catch {
        throw withReason("parse_failed", "weibo.com json parse threw");
    }
    return parseWeiboAjaxRealtime(raw);
}

function parseWeiboAjaxRealtime(raw: any): any[] {
    if (!raw || typeof raw !== "object") {
        throw withReason("parse_failed", "weibo.com payload not object");
    }
    if (raw.ok !== 1) {
        throw withReason("parse_failed", `weibo.com ok=${raw.ok}`);
    }
    const realtime =
        raw.data && Array.isArray(raw.data.realtime) ? raw.data.realtime : null;
    if (!realtime) {
        throw withReason("parse_failed", "weibo.com data.realtime missing");
    }
    const items: any[] = [];
    let rank = 1;
    for (const entry of realtime) {
        if (!entry || typeof entry !== "object") continue;
        if (typeof entry.word !== "string" || entry.word.length === 0) continue;
        const item: any = {
            rank: rank++,
            title: entry.word,
            url: buildWeiboSearchUrl(entry.word),
        };
        if (typeof entry.num === "number") {
            item.heat = formatHeatNumber(entry.num);
        }
        if (typeof entry.label_name === "string" && entry.label_name.length > 0) {
            item.tag = entry.label_name;
        }
        items.push(item);
        if (items.length >= 50) break;
    }
    if (items.length === 0) {
        throw withReason("parse_failed", "weibo.com realtime empty");
    }
    return items;
}

function buildWeiboSearchUrl(word: string): string {
    const q = encodeURIComponent(word);
    return `https://s.weibo.com/weibo?q=${q}`;
}

function formatHeatNumber(n: number): string {
    if (n >= 10000) return `${Math.round(n / 10000)}万`;
    return String(n);
}

function withReason(reason: string, msg: string): Error {
    const err: any = new Error(`wechat-hot: ${reason}: ${msg}`);
    err.reason = reason;
    return err;
}

module.exports = {
    fetchWechatHot,
    parseWeiboAjaxRealtime,
    SOURCE_PRIMARY,
    SOURCE_FALLBACK,
    URL_PRIMARY,
    URL_FALLBACK,
};
