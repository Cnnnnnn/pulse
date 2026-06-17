/**
 * src/metals/metal-eastmoney-fetcher.js
 *
 * 东方财富 push2delay 接口客户端, 用于国内现货贵金属 (AU9999, AG9999).
 * 替代已停更的新浪 AU0/AG0 (返回 2024 年陈旧数据).
 *
 * 用 push2delay (15 分钟延时行情) 而非 push2:
 *   - push2.eastmoney.com 对 node 的 TLS ClientHello 不友好, 且频繁请求会
 *     被临时封 IP (实测 socket hang up / empty reply).
 *   - push2delay.eastmoney.com 限流宽松, node 原生 https 稳定 200.
 *   - 贵金属 5 分钟刷新一次, 15 分钟延时完全可接受.
 *
 * 接口: https://push2delay.eastmoney.com/api/qt/stock/get?secid=118.{CODE}&fields=...
 *   secid 前缀 118 = 上海黄金交易所
 *
 * 字段 (实测 2026-06-17):
 *   f43  最新价 (整数表示, 需按品种除以 priceDivisor)
 *   f44  最高
 *   f45  最低
 *   f46  今开
 *   f57  代码
 *   f58  名称
 *   f60  昨收
 *   f170 涨跌幅 (整数, ÷10000 得百分比)
 *   f86  时间戳 (unix 秒)
 *
 * ⚠️ 单位陷阱: f43 是东方财富内部整数, 不同品种除数不同:
 *   AU9999 (黄金): f43=93918, ÷100 = 939.18 元/克
 *   AG9999 (白银): f43=1687500, ÷100000 = 16.875 元/克
 *   原因: 白银以"元/千克"为基准报价, 黄金以"元/克". priceDivisor 在
 *   metal-config.js 每品种显式声明, 不在这里猜.
 *
 * HTTP 抽象: 注入 httpGet(url, headers) => Promise<string>, 返回 UTF-8 JSON 字符串.
 */

const EM_BASE = 'https://push2delay.eastmoney.com/api/qt/stock/get';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  Referer: 'https://quote.eastmoney.com/',
};

// 单次请求要拉的字段
const FIELDS = 'f43,f44,f45,f46,f57,f58,f60,f170,f86';

/**
 * 构建东方财富 URL.
 * @param {string} secid - e.g. '118.AU9999'
 */
function buildEastmoneyUrl(secid) {
  return `${EM_BASE}?secid=${encodeURIComponent(secid)}&fields=${FIELDS}`;
}

/**
 * 解析东方财富单品种响应.
 * @param {Object} data - data 字段内容 (response.data)
 * @param {string} metalId - e.g. 'AU9999'
 * @param {number} priceDivisor - 价格除数 (来自 metal-config)
 */
function parseEastmoneyQuote(data, metalId, priceDivisor) {
  if (!data || !Number.isFinite(data.f43) || !Number.isFinite(data.f60)) return null;

  const price = data.f43 / priceDivisor;
  const prevClose = data.f60 / priceDivisor;
  if (!Number.isFinite(price) || price <= 0) return null;

  const quoteTime = Number.isFinite(data.f86) ? data.f86 * 1000 : Date.now();

  return {
    id: metalId,
    price,
    prevClose,
    currency: 'CNY',
    unit: 'g',
    quoteTime,
    source: 'eastmoney',
  };
}

/**
 * 解析完整响应 (单个品种, 东方财富 stock/get 一次一个 secid).
 * @param {string} text - JSON 字符串
 * @param {string} metalId
 * @param {number} priceDivisor
 */
function parseEastmoneyResponse(text, metalId, priceDivisor) {
  if (!text) return null;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const data = json && json.data;
  if (!data || data.f43 == null) return null;
  return parseEastmoneyQuote(data, metalId, priceDivisor);
}

/**
 * 批量拉取国内现货品种 (每个品种一个请求, 并发).
 *
 * 部分失败语义: 单个 secid 失败被吞掉, 其他品种仍能成功.
 * 但若全部都失败, 抛出一个聚合 error, 让 dispatcher 在 errors['eastmoney']
 * 里登记 (跟 sina-hf 的"全或无"语义对齐 — dispatcher 用 Promise.allSettled
 * 只看 fetcher 是否 reject, 看不到部分失败).
 *
 * @param {Array<{secid: string, metalId: string, priceDivisor: number}>} items
 * @param {Function} httpGet - (url, headers) => Promise<string>
 * @returns {Promise<Object>} metalId → quote
 * @throws {Error} 当所有 secid 都失败时, message 含每个 symbol 的错误原因
 */
async function fetchEastmoneyQuotes(items, httpGet) {
  if (items.length === 0) return {};
  const settled = await Promise.allSettled(
    items.map(async (item) => {
      const url = buildEastmoneyUrl(item.secid);
      const text = await httpGet(url, DEFAULT_HEADERS);
      const quote = parseEastmoneyResponse(text, item.metalId, item.priceDivisor);
      if (!quote) throw new Error(`parse failed for ${item.secid}`);
      return [item.metalId, quote];
    })
  );

  const quotes = {};
  const errors = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === 'fulfilled') {
      quotes[r.value[0]] = r.value[1];
    } else {
      errors.push(`${items[i].secid}: ${r.reason && r.reason.message}`);
    }
  }

  if (errors.length === items.length) {
    throw new Error(`eastmoney: all ${items.length} symbol(s) failed — ${errors.join('; ')}`);
  }
  return quotes;
}

module.exports = {
  fetchEastmoneyQuotes,
  parseEastmoneyResponse,
  parseEastmoneyQuote,
  buildEastmoneyUrl,
};
