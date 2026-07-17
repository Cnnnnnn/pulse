/**
 * src/main/games/itad.js
 *
 * IsThereAnyDeal (ITAD) 适配器 — 覆盖 CheapShark 不支持的主机平台。
 * 实测结论 (2026-07-17)：
 *   - 当前接口为 GET https://api.isthereanydeal.com/deals/v2 （旧 /deals/v3/list/ 已 404）。
 *   - 鉴权用查询参数 ?key=KEY（ApiKey 请求头无效，返回 403）。
 *   - shops 参数为「数字 shop ID」（逗号分隔），不是 slug：
 *       Steam=61, GOG=35, Epic=16, Microsoft Store(Xbox)=48。
 *   - 关键：ITAD 的 deals feed 只收录 Microsoft Store(Xbox)，
 *     PlayStation Store / Nintendo eShop 在 deals/v2 与 prices 接口均无数据，
 *     故 playstation / switch 必然回退示例（sample），只有 xbox 能变真实。
 *   - key 在 https://isthereanydeal.com/apps/my/ 注册 App 后获取（旧 /settings/account/api 已 404）。
 *
 * 配置 key 后本适配器才会真正联网；未配置或无该平台数据时返回 null/[]，
 * 由聚合层回退到示例数据 (sample.js)，UI 标"示例"徽标，永不空白。
 */

const { toGameDeal, fetchJson } = require("./normalize");

// ITAD 数字 shop ID（仅收录得到的主机平台填这里）。
const SHOP_BY_PLATFORM = {
  xbox: 48, // Microsoft Store（含 Xbox 主机游戏）
};

const ITAD_DEALS = "https://api.isthereanydeal.com/deals/v2";

// ── 极简 .env 加载器（与 src/main/github.js 同款模式）──
// 仅当进程尚未有 ITAD_API_KEY 时，从 process.cwd()/.env 读取，避免污染其它路径。
let _envLoaded = false;
function loadEnvItadKey() {
  if (_envLoaded) return;
  _envLoaded = true;
  if (process.env.ITAD_API_KEY) return;
  try {
    // eslint-disable-next-line global-require
    const fs = require("fs");
    // eslint-disable-next-line global-require
    const path = require("path");
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    const txt = fs.readFileSync(envPath, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*ITAD_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) {
        let v = m[1].trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (v) process.env.ITAD_API_KEY = v;
        break;
      }
    }
  } catch {
    /* .env 读取失败忽略，不影响未认证路径 */
  }
}

/**
 * @param {string} platform 'xbox'|'playstation'|'switch'
 * @param {{key?:string, country?:string, limit?:number}} opts
 * @returns {Promise<object[]|null>}
 */
async function fetchItadDeals(platform, opts = {}) {
  loadEnvItadKey();
  const key = opts.key || process.env.ITAD_API_KEY;
  if (!key) return null;
  const shopId = SHOP_BY_PLATFORM[platform];
  if (shopId == null) return null; // 该平台 ITAD 无数据 → 聚合层回退示例
  try {
    const params = new URLSearchParams({
      key,
      shops: String(shopId),
      limit: String(opts.limit || 40),
      country: opts.country || "US",
    });
    const data = await fetchJson(`${ITAD_DEALS}?${params.toString()}`, {
      timeoutMs: 9000,
    });
    const list = Array.isArray(data?.list) ? data.list : [];
    const items = list
      .map((item) => {
        const deal = item.deal || {};
        const price = Number(deal.price?.amount || 0);
        const regular = Number(deal.regular?.amount || 0);
        const cut = Number(deal.cut || 0);
        const slug = item.slug || item.id;
        const assets = item.assets || {};
        return toGameDeal({
          id: `${platform}-${slug || deal.shop?.id}`,
          platform,
          title: item.title || "未知游戏",
          thumb:
            assets.boxart || assets.banner145 || assets.banner300 || null,
          salePrice: price,
          normalPrice: regular,
          savings: cut,
          currency: deal.price?.currency || "USD",
          dealUrl: deal.url || null,
          store: deal.shop?.name || "Microsoft Store",
          source: "live",
          // ITAD deals/v2 列表无单游戏评分字段，用折扣力度作热门代理
          popular: cut,
        });
      })
      .filter((it) => it.normalPrice > 0);
    return items;
  } catch {
    return null;
  }
}

module.exports = { fetchItadDeals, SHOP_BY_PLATFORM };
