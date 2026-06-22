/**
 * src/main/food/dianping-scraper.js
 *
 * 大众点评搜索结果 HTML 解析 (HTML → {name, rating, reviewCount, avgPrice}).
 *
 * ⚠️ 合规: 本文件涉及对大众点评公开搜索页面的爬取, 严格意义上违反其服务条款.
 *   - 仅供个人本地使用, 默认 opt-in (由用户启动相关 tab 后才调用)
 *   - 失败必须**静默降级**: 返回 {ok:false, error}, 不抛, 不重试 (避免被封)
 *   - 不在任何 release note / 公开渠道宣传该功能
 *
 * ponytail:
 *   - 用 regex 解析 shop-list-item 块 (DOMParser 在 Node 里要 jsdom, 杀鸡用牛刀).
 *     升级路径: 若 HTML 结构大改 / 字段变多, 换 cheerio.
 *   - 自定义 desktop UA + Referer + Accept-Language, 降低触发反爬概率.
 *   - search() 内部不抛, 全部走 {ok, data|error} 形式, 上游 orchestrator 决定 UI 行为.
 */

const { HttpClient } = require("../http-client");
const { mainLog } = require("../log");

const SEARCH_URL = "https://www.dianping.com/search/keyword";
const TIMEOUT_MS = 8000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * 从大众点评搜索结果 HTML 抽取店铺基础信息.
 * 跳过缺少 shop-title 或 rating 不是数字的块; 输入非字符串/无匹配 → [].
 */
function parseShopListHtml(html) {
  if (!html || typeof html !== "string") return [];
  const shops = [];
  const itemRe = /<li[^>]*class="shop-list-item"[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = itemRe.exec(html)) !== null) {
    const block = m[1];
    const nameMatch = block.match(/<h4[^>]*class="shop-title"[^>]*>([\s\S]*?)<\/h4>/);
    const ratingMatch = block.match(/<span[^>]*class="rating"[^>]*>([\d.]+)<\/span>/);
    if (!nameMatch || !ratingMatch) continue;
    const rating = parseFloat(ratingMatch[1]);
    if (!Number.isFinite(rating)) continue;
    const reviewMatch = block.match(/<span[^>]*class="review-count"[^>]*>(\d+)\s*条评价/);
    const priceMatch = block.match(/<span[^>]*class="mean-price"[^>]*>¥(\d+)\s*\/人/);
    shops.push({
      name: nameMatch[1].trim(),
      rating,
      reviewCount: reviewMatch ? parseInt(reviewMatch[1], 10) : 0,
      avgPrice: priceMatch ? parseInt(priceMatch[1], 10) : null,
    });
  }
  return shops;
}

function createDianpingScraper(opts = {}) {
  const http = opts.http || new HttpClient({ timeout: TIMEOUT_MS });
  const log = opts.logger || mainLog;

  async function search(params) {
    const { lat, lng, keyword = "美食" } = params || {};
    // 大众点评搜索 URL: /search/keyword/{cityId}/{keyword}
    // 简化: cityId 留空 — MVP 不强求返回真实数据, orchestrator (Task 6) 失败时静默降级
    const url = `${SEARCH_URL}/${encodeURIComponent(keyword)}`;
    const r = await http.get(url, {
      timeout: TIMEOUT_MS,
      headers: {
        "User-Agent": UA,
        "Referer": "https://www.dianping.com/",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });
    if (!r || r.error) {
      log.warn && log.warn("[dianping] http error", { err: r && r.error });
      return { ok: false, error: "network" };
    }
    if (r.status === 403 || r.status === 429) {
      return { ok: false, error: "rate_limit" };
    }
    if (r.status !== 200) {
      return { ok: false, error: "http_error", status: r.status };
    }
    try {
      const shops = parseShopListHtml(r.body);
      return { ok: true, data: shops };
    } catch (e) {
      return { ok: false, error: "parse" };
    }
  }

  return { search, parseShopListHtml };
}

module.exports = { createDianpingScraper, parseShopListHtml };