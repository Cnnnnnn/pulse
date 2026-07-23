/**
 * src/main/ithome/list-parser.ts
 *
 * 解析 https://www.ithome.com/list/YYYY-MM-DD.html
 */
"use strict";

const LI_RE = /<li>\s*<a class="c"[\s\S]*?<\/li>/g;
const CATEGORY_RE = /<a class="c"[^>]*>([^<]*)<\/a>/;
const TITLE_RE = /<a class="t" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
const TIME_RE = /<i>([^<]+)<\/i>/;

function normalizeLink(href: any): string {
    if (!href) return "";
    if (href.startsWith("//")) return `https:${href}`;
    if (href.startsWith("/")) return `https://www.ithome.com${href}`;
    return href;
}

function cleanText(s: any): string {
    return String(s || "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function toPubDateIso(dateKey: string, timeText: any, dataOt: any): string {
    if (dataOt) {
        const d = new Date(dataOt);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    const m = String(timeText || "").match(
        /(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/,
    );
    if (m) {
        return new Date(
            `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+08:00`,
        ).toISOString();
    }
    return new Date(`${dateKey}T12:00:00+08:00`).toISOString();
}

/**
 * @param html
 * @param dateKey YYYY-MM-DD
 */
export function parseIthomeListPage(html: any, dateKey: string): any[] {
    if (!html || typeof html !== "string") return [];
    const items: any[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = LI_RE.exec(html)) !== null) {
        const block = m[0];
        const catM = block.match(CATEGORY_RE);
        const titleM = block.match(TITLE_RE);
        const timeM = block.match(TIME_RE);
        if (!titleM) continue;
        const link = normalizeLink(titleM[1]);
        const title = cleanText(titleM[2]);
        if (!link || !title) continue;
        if (seen.has(link)) continue;
        seen.add(link);
        const dataOtM = block.match(/data-ot="([^"]+)"/);
        const category = catM ? cleanText(catM[1]) : "";
        const timeText = timeM ? timeM[1].trim() : "";
        items.push({
            id: link,
            title,
            link,
            category,
            pubDate: toPubDateIso(dateKey, timeText, dataOtM && dataOtM[1]),
            dateKey,
            excerpt: "",
        });
    }
    return items;
}

module.exports = {
    parseIthomeListPage,
    normalizeLink,
};
