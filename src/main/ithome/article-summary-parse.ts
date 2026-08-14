/**
 * src/main/ithome/article-summary-parse.ts
 *
 * 从 IT 新闻 AI 总结文本解析结构化字段
 */
"use strict";

const FIELD_PATTERNS: { key: string; re: RegExp }[] = [
    { key: "abstract", re: /^(摘要|概括|简述)[:：]\s*(.+)$/ },
    { key: "keywords", re: /^(关键词|关键字|标签)[:：]\s*(.+)$/ },
    { key: "domain", re: /^(所属领域|领域|分类|赛道)[:：]\s*(.+)$/ },
    { key: "impact", re: /^(影响方面|影响|对哪些方面有影响)[:：]\s*(.+)$/ },
    { key: "whyImportant", re: /^(为什么重要|重要性|为何重要)[:：]\s*(.+)$/ },
    { key: "risks", re: /^(风险与不确定性|风险|不确定性)[:：]\s*(.+)$/ },
    { key: "followUps", re: /^(后续关注|后续|关注点|值得关注)[:：]\s*(.+)$/ },
    { key: "evidence", re: /^(原文依据|事实依据|依据)[:：]\s*(.+)$/ },
    { key: "completeness", re: /^(信息完整度|完整度)[:：]\s*(.+)$/ },
];

const OPTIONAL_KEYS = [
    "whyImportant",
    "risks",
    "followUps",
    "evidence",
    "completeness",
];

function splitList(raw: any): string[] {
    return String(raw || "")
        .split(/[；;|\n]/)
        .map((item: any) => String(item).replace(/^[-*•\d]+[.)、]?\s*/, "").trim())
        .filter((item: string) => item && !/^(无|暂无|未提及|没有)$/i.test(item))
        .slice(0, 5);
}

function normalizeCompleteness(raw: any): string {
    const value = String(raw || "").trim().toLowerCase();
    if (/^(高|high)$/.test(value)) return "high";
    if (/^(中|medium)$/.test(value)) return "medium";
    if (/^(低|low)$/.test(value)) return "low";
    return String(raw || "").trim().slice(0, 20);
}

function isOptionalKey(key: string): boolean {
    return OPTIONAL_KEYS.includes(key);
}

export function splitKeywords(raw: any): string[] {
    return String(raw || "")
        .split(/[,，、;；|/]\s*/)
        .map((k: any) => k.trim())
        .filter(Boolean)
        .slice(0, 8);
}

/**
 * @param text
 * @returns SummaryFields
 */
export function parseArticleSummary(text: any): {
    abstract: string;
    keywords: string[];
    domain: string;
    impact: string;
    whyImportant?: string;
    risks?: string[];
    followUps?: string[];
    evidence?: string[];
    completeness?: string;
} {
    const raw = typeof text === "string" ? text : "";
    const lines = raw
        .split(/\r?\n/)
        .map((l: any) => l.trim())
        .filter(Boolean)
        .filter((l: any) => !/^#{1,6}\s/.test(l));

    const out: any = {
        abstract: "",
        keywords: [],
        domain: "",
        impact: "",
    };
    const extra: string[] = [];
    const seenOptional: Record<string, boolean> = {};

    for (const line of lines) {
        const clean = line.replace(/^[-*•]\s*/, "").trim();
        let matched = false;
        for (const { key, re } of FIELD_PATTERNS) {
            const m = re.exec(clean);
            if (!m) continue;
            if (key === "keywords") {
                out.keywords = splitKeywords(m[2]);
            } else if (key === "risks" || key === "followUps" || key === "evidence") {
                out[key] = splitList(m[2]);
                if (isOptionalKey(key)) seenOptional[key] = true;
            } else if (key === "completeness") {
                out[key] = normalizeCompleteness(m[2]);
                seenOptional[key] = true;
            } else {
                out[key] = m[2].trim();
                if (isOptionalKey(key)) seenOptional[key] = true;
            }
            matched = true;
            break;
        }
        if (!matched) extra.push(clean);
    }

    if (!out.abstract) {
        out.abstract =
            extra.length > 0 ? extra.join(" ") : raw.replace(/\s+/g, " ").trim();
    }

    const result: any = {
        abstract: out.abstract.replace(/\s+/g, " ").trim().slice(0, 500),
        keywords: out.keywords,
        domain: out.domain.replace(/\s+/g, " ").trim().slice(0, 80),
        impact: out.impact.replace(/\s+/g, " ").trim().slice(0, 400),
    };

    for (const key of OPTIONAL_KEYS) {
        if (!seenOptional[key]) continue;
        if (key === "risks" || key === "followUps" || key === "evidence") {
            result[key] = Array.isArray(out[key]) ? out[key] : [];
        } else {
            result[key] = String(out[key] || "").replace(/\s+/g, " ").trim();
        }
    }
    return result;
}

/**
 * @param entry Summary entry object
 */
export function enrichSummaryEntry(entry: any): {
    abstract: string;
    keywords: string[];
    domain: string;
    impact: string;
    whyImportant?: string;
    risks?: string[];
    followUps?: string[];
    evidence?: string[];
    completeness?: string;
} {
    if (!entry || typeof entry !== "object") {
        return parseArticleSummary("");
    }
    const parsed = parseArticleSummary(entry.text || "");
    const result: any = {
        abstract: entry.abstract || parsed.abstract || "",
        keywords: Array.isArray(entry.keywords)
            ? entry.keywords
            : parsed.keywords,
        domain: entry.domain || parsed.domain || "",
        impact: entry.impact || parsed.impact || "",
    };
    for (const key of OPTIONAL_KEYS) {
        const parsedAny: any = parsed;
        const hasStored = Object.prototype.hasOwnProperty.call(entry, key);
        if (!hasStored && !Object.prototype.hasOwnProperty.call(parsedAny, key)) {
            continue;
        }
        if (key === "risks" || key === "followUps" || key === "evidence") {
            result[key] = Array.isArray(entry[key])
                ? entry[key]
                : Array.isArray(parsedAny[key])
                    ? parsedAny[key]
                    : [];
        } else if (key === "completeness") {
            result[key] = normalizeCompleteness(entry[key] || parsedAny[key]);
        } else {
            result[key] = entry[key] || parsedAny[key] || "";
        }
    }
    return result;
}

module.exports = {
    parseArticleSummary,
    enrichSummaryEntry,
    splitKeywords,
};
