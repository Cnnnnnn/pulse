/**
 * src/main/games/psprices.js
 *
 * PlayStation 优惠数据源 — 第三方 PSPrices B2B API（用户选定的方案 2）。
 *
 * 实测结论 (2026-07-17)：
 *   - 公开 chihiro API 不暴露 PS 折扣字段，故走 PSPrices（需订阅 + X-API-Key）。
 *   - 认证：请求头 `X-API-Key: <KEY>`。
 *   - 主端点：GET https://psprices.com/api/b2b/games/?region=us&platforms=ps5,ps4&limit=N
 *   - 返回 data[]，每条含 pricing{current_price, original_price, discount_percent, currency}
 *     及 name / cover / ps_store_url / release_date。结构与 demo 端点一致（已实测）。
 *   - demo 端点（免 auth，限 24 条，region=tr）：/api/b2b/demo/?region=tr&collection=most-wanted-deals
 *     —— 仅用于无 key 时的端到端联调验证，绝不进入生产聚合路径。
 *   - 许可要求：展示公开价格须带 "Powered by PSPrices" 署名（renderer 已实现页脚）。
 *
 * key 获取：https://psprices.com/b2b 订阅后从 Dashboard 取 key，写入项目根 .env：
 *   PSPRICES_API_KEY=xxxxxxxx
 * 未配置 key 时本适配器返回 null，聚合层回退示例（与 ITAD 行为一致）。
 */

const { toGameDeal, fetchJson } = require("./normalize");
const { logFetchError } = require("./log");

const PSPRICES_BASE = "https://psprices.com/api/b2b";
const DEFAULT_REGION = "us"; // 生产用 USD，匹配 renderer fmtPrice 的 $ 符号
const DEFAULT_PLATFORMS = "ps5,ps4";

// ── 极简 .env 加载器（与 itad.js 同款模式）──
let _envLoaded = false;
function loadEnvPspricesKey() {
  if (_envLoaded) return;
  _envLoaded = true;
  if (process.env.PSPRICES_API_KEY) return;
  try {
    // eslint-disable-next-line global-require
    const fs = require("fs");
    // eslint-disable-next-line global-require
    const path = require("path");
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    const txt = fs.readFileSync(envPath, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*PSPRICES_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) {
        let v = m[1].trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (v) process.env.PSPRICES_API_KEY = v;
        break;
      }
    }
  } catch (err) {
    logFetchError("psprices:env", err);
    /* .env 读取失败忽略，不影响未认证路径 */
  }
}

/** 把单条 PSPrices item 映射为内部 GameDeal。 */
function mapItem(item) {
  const p = item.pricing || {};
  const current = Number(p.current_price);
  const original = Number(p.original_price);
  const cut = Number(p.discount_percent || 0);
  return toGameDeal({
    id: `ps-${item.sku || item.title_id || item.id}`,
    platform: "playstation",
    title: item.name || "未知游戏",
    thumb: item.cover || null,
    salePrice: current,
    normalPrice: original,
    savings: cut,
    currency: p.currency || "USD",
    dealUrl: item.ps_store_url || item.store_url || null,
    isFree: current === 0,
    releaseDate: item.release_date || null,
    store: "PlayStation Store",
    source: "live",
    popular: cut,
  });
}

/**
 * 生产路径：用 key 拉取指定 region 的 PS 折扣。
 * @param {{limit?:number, region?:string, platforms?:string, mode?:string, apiKey?:string}} opts
 * @returns {Promise<object[]|null>} 无 key / 网络错误 → null（聚合层回退示例）
 */
async function fetchPlayStationDeals(opts = {}) {
  loadEnvPspricesKey();
  const key = opts.apiKey || process.env.PSPRICES_API_KEY;
  if (!key) return null;
  const region = opts.region || DEFAULT_REGION;
  const platforms = opts.platforms || DEFAULT_PLATFORMS;
  const limit = Math.min(Math.max(opts.limit || 40, 1), 100);
  const mode = opts.mode || "deals";
  try {
    const url = `${PSPRICES_BASE}/games/?region=${encodeURIComponent(
      region,
    )}&platforms=${encodeURIComponent(platforms)}&limit=${limit}`;
    const data = await fetchJson(url, {
      timeoutMs: 9000,
      headers: { "X-API-Key": key, Accept: "application/json" },
    });
    const list = Array.isArray(data?.data) ? data.data : [];
    const items = list
      .map(mapItem)
      // free 模式只留现价 0；其余模式只留真有折扣的
      .filter((it) =>
        mode === "free"
          ? it.isFree
          : it.savings > 0 && it.normalPrice > 0,
      );
    return items;
  } catch (err) {
    logFetchError("psprices", err);
    return null;
  }
}

/**
 * 联调验证用（无 key）：拉 demo 端点，确认字段映射正确。
 * 绝不进入生产聚合路径。
 * @returns {Promise<object[]>}
 */
async function fetchPlayStationDealsDemo() {
  try {
    const url = `${PSPRICES_BASE}/demo/?region=tr&collection=most-wanted-deals`;
    const data = await fetchJson(url, { timeoutMs: 9000 });
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map(mapItem);
  } catch (err) {
    logFetchError("psprices:demo", err);
    throw err;
  }
}

module.exports = {
  fetchPlayStationDeals,
  fetchPlayStationDealsDemo,
  PSPRICES_BASE,
};
