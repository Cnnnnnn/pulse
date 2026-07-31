/**
 * src/main/finance/config.ts
 *
 * 财经新闻模块 — 集中配置：分类体系、派生分类关键字表、源配置、节流参数。
 *
 * 设计约束（来自 financial-news-module-design / finance-source-validation）：
 *   - 分类取值：股市 | 基金 | 债券 | 宏观 | 全球
 *   - 派生分类优先级：宏观 > 全球 > 债券 > 基金 > 股市（保证按分类切换不重不漏）
 *   - 关键词打标 → 分类 + tags
 *   - 国家统计局 RSS 单次 4.5MB / 500 条，缓存 ≥6h + 裁剪到最近 N 条
 *   - 财联社已死，不实现
 */

/**
 * 财经派生分类（确定性，免费 RSS 无原生分类）。
 * 单一真源见 src/shared/finance-categories.ts（renderer + main 共用），
 * 此处 re-export 以避免改动所有既有 importer。
 */
import type { FinCategory } from "../../shared/finance-categories";
export { FIN_CATEGORIES, type FinCategory } from "../../shared/finance-categories";

/** 源的展示名（source 字段）。 */
export const SOURCE_LABELS: Record<string, string> = {
  eastmoney: "东方财富",
  wallstreetcn: "华尔街见闻",
  stats: "国家统计局",
};

/** 源默认分类（无关键词命中时的兜底）。 */
export const SOURCE_DEFAULT_CATEGORY: Record<string, FinCategory> = {
  eastmoney: "股市",
  wallstreetcn: "全球",
  stats: "宏观",
};

/** 派生分类优先级（数字越大越优先）。 */
export const CATEGORY_PRIORITY: Record<string, number> = {
  宏观: 5,
  全球: 4,
  债券: 3,
  基金: 2,
  股市: 1,
};

interface KeywordRule {
  cat: FinCategory;
  keywords: string[];
}

/**
 * 关键词 → 分类 表。
 * 注意：外汇/汇率/人民币/美元 归「全球」；美股/非农 归「全球」。
 * tags 取命中的具体关键词，供相关推荐复用。
 */
export const KEYWORD_RULES: KeywordRule[] = [
  { cat: "债券", keywords: ["债券", "国债", "利率"] },
  { cat: "基金", keywords: ["基金", "ETF", "净值"] },
  { cat: "全球", keywords: ["外汇", "汇率", "人民币", "美元", "美股", "非农"] },
  { cat: "宏观", keywords: ["GDP", "CPI", "央行", "降准", "宏观"] },
];

export interface DerivedCategory {
  category: FinCategory;
  tags: string[];
}

/**
 * 派生分类：源默认分类 + 关键词命中分类，取优先级最高的一档。
 * tags = 命中的具体关键词（去重）。
 */
export function deriveCategory(
  sourceKey: string,
  title: string,
  summary: string,
): DerivedCategory {
  const text = `${title || ""} ${summary || ""}`.toLowerCase();
  const matchedCats = new Set<FinCategory>();
  const tags: string[] = [];
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw.toLowerCase())) {
        matchedCats.add(rule.cat);
        if (!tags.includes(kw)) tags.push(kw);
      }
    }
  }
  const def = SOURCE_DEFAULT_CATEGORY[sourceKey] || "股市";
  // 关键词命中优先于源默认分类：命中时取命中分类中优先级最高的一档，
  // 未命中任何关键词才回退到源默认分类。
  let best: FinCategory = def;
  if (matchedCats.size > 0) {
    best = "股市"; // 以最低优先级作为起点
    let bestPri = 0;
    for (const c of matchedCats) {
      const p = CATEGORY_PRIORITY[c] || 0;
      if (p > bestPri) {
        best = c;
        bestPri = p;
      }
    }
  }
  return { category: best, tags };
}

/** 源 URL（集中可配）。 */
export const SOURCE_URLS: Record<string, string> = {
  eastmoney: "http://rss.eastmoney.com/rss_partener.xml",
  wallstreetcn: "https://dedicated.wallstreetcn.com/rss.xml",
  stats: "https://www.stats.gov.cn/sj/zxfb/rss.xml",
};

/** 浏览器 UA（所有源均带，避免反爬 / 403）。 */
export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** 国家统计局 RSS 缓存 TTL（6h）。 */
export const STATS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** 国家统计局 RSS 裁剪后保留的最近条数。 */
export const STATS_MAX_ITEMS = 200;

/**
 * 国家统计局 RSS 抓取字节上限。
 * 实测原始 ~4.5MB + XML 标签开销逼近旧 6MB 默认上限，有被截断丢尾条的风险；
 * 提到 10MB 留足余量（仅 stats 使用，不影响其它源）。
 */
export const STATS_MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * 截断告警阈值（仅 stats）。
 * 国家统计局 RSS 完整体量大，若某次拉取 body 显著小于此值，大概率被截断/服务端降级，
 * 需告警以便察觉「宏观 tab 条目骤减」。
 */
export const STATS_WARN_BELOW_BYTES = 4 * 1024 * 1024;

/** 单日文章上限（镜像 ithome_news）。 */
export const FIN_ARTICLES_PER_DAY = 400;

/**
 * 全量文章全局上限。
 * _pruneArticles 先按天切片（FIN_ARTICLES_PER_DAY/天）再合并做全局截断，
 * 避免当月逐日累积膨胀到上万条撑大 state.json。
 * 取值 ~1k：保留最近约 2-3 天全量，足够财经浏览，且 state.json 维持数百 KB 量级。
 */
export const FIN_ARTICLES_TOTAL_CAP = 1000;

/** 新闻抓取超时。 */
export const FIN_FETCH_TIMEOUT_MS = 20000;

/** 新浪行情抓取超时。 */
export const SINA_TIMEOUT_MS = 10000;
