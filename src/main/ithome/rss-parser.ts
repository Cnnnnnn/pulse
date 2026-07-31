/**
 * src/main/ithome/rss-parser.ts
 *
 * 解析 IT之家 RSS (https://www.ithome.com/rss/)
 */
"use strict";

const EXCERPT_MAX = 6000;

function decodeXmlEntities(s: any): string {
    if (!s) return "";
    return String(s)
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function pickTag(block: string, tag: string): string {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const m = block.match(re);
    return m ? decodeXmlEntities(m[1].trim()) : "";
}

function stripHtml(html: any): string {
    if (!html) return "";
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function toShanghaiDateKey(pubDate: any): string {
    const d = new Date(pubDate);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
    }).format(d);
}

/**
 * @param xml
 * @returns RssItem[]
 */
export function parseIthomeRss(xml: any): any[] {
    if (!xml || typeof xml !== "string") return [];
    const items: any[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null) {
        const block = m[1];
        const title = pickTag(block, "title");
        // 部分官方 RSS（如国家统计局）的 <item> 可能只有标题+日期而无 <link>/<guid>。
        // 因此不再强制要求 link，仅要求 title；链接缺失时 url 留空（详情页已支持无 body/无 url 退化）。
        // link 严格取 <link> 真实 URL；guid 仅用于派生 id，不作为 url（tag URI 不是可打开链接）。
        const link = pickTag(block, "link");
        const guid = pickTag(block, "guid");
        const pubDate = pickTag(block, "pubDate");
        const description = pickTag(block, "description");
        if (!title) continue;
        // id 优先级 guid > link；若两者皆无，用 title+pubDate 生成稳定 id，
        // 保证幂等（重复刷新不重复入库、收藏/已读可持久）。
        const id = guid || link || `${title}::${pubDate}`;
        const excerpt = stripHtml(description).slice(0, EXCERPT_MAX);
        const dateKey = toShanghaiDateKey(pubDate);
        items.push({
            id,
            title,
            link: link || "",
            pubDate,
            dateKey,
            excerpt,
        });
    }
    return items;
}

module.exports = {
    parseIthomeRss,
    stripHtml,
    toShanghaiDateKey,
    EXCERPT_MAX,
};
