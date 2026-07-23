/**
 * src/main/wechat-hot/list-parser.ts
 *
 * Pure: xxapi 微博热搜 API payload → 标准化 items.
 * 不依赖 electron / node:http / HttpClient — 方便 vitest 直接 require.
 *
 * v2.24.1 适配微博:
 *   xxapi 返 { code:200, msg, data:[{index,title,hot,url}] }
 *   data 是数组, hot 是字符串 (e.g. "208万"), 无 label 字段.
 *   用 entry.url 作为 rank=index (xxapi 已按热度返回, 客户端不再重排).
 */
"use strict";

/**
 * @typedef {Object} WechatHotItem
 * @property {number} rank
 * @property {string} title
 * @property {string} url
 * @property {string} [heat]
 * @property {string} [tag]
 */

/**
 * @param raw — xxapi 原始 payload
 * @returns WechatHotItem[]
 * @throws {Error} reason 为 'parse_failed'
 */
export function parseWechatHotPayload(raw: any): any[] {
    if (!raw || typeof raw !== "object") {
        throw withReason("parse_failed", "payload not object");
    }
    if (raw.code !== 200) {
        throw withReason("parse_failed", `code=${raw.code}`);
    }
    if (!Array.isArray(raw.data)) {
        throw withReason("parse_failed", "data not array");
    }
    const items: any[] = [];
    let rank = 1;
    for (const entry of raw.data) {
        if (!entry || typeof entry !== "object") continue;
        if (typeof entry.title !== "string" || entry.title.length === 0) continue;
        if (typeof entry.url !== "string" || entry.url.length === 0) continue;
        const item: any = {
            rank: rank++,
            title: entry.title,
            url: entry.url,
        };
        if (typeof entry.hot === "string" && entry.hot.length > 0) {
            item.heat = entry.hot;
        }
        items.push(item);
    }
    return items;
}

function withReason(reason: string, msg: string): Error {
    const err: any = new Error(`${reason}: ${msg}`);
    err.reason = reason;
    return err;
}

module.exports = { parseWechatHotPayload };
