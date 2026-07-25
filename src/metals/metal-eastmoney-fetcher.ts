/**
 * src/metals/metal-eastmoney-fetcher.ts
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
 *   metal-config.ts 每品种显式声明, 不在这里猜.
 *
 * HTTP 抽象: 注入 httpGet(url: any, headers: any) => Promise<string>, 返回 UTF-8 JSON 字符串.
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
 */
export function buildEastmoneyUrl(secid: any) {
  return `${EM_BASE}?secid=${encodeURIComponent(secid)}&fields=${FIELDS}`;
}

/**
 * 解析东方财富单品种响应.
 */
export function parseEastmoneyQuote(data: any, metalId: any, priceDivisor: any) {
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
 */
export function parseEastmoneyResponse(text: any, metalId: any, priceDivisor: any) {
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
 */
export async function fetchEastmoneyQuotes(items: any, httpGet: any) {
  if (items.length === 0) return {};
  const settled = await Promise.allSettled(
    items.map(async (item: any) => {
      const url = buildEastmoneyUrl(item.secid);
      const text = await httpGet(url, DEFAULT_HEADERS);
      const quote = parseEastmoneyResponse(text, item.metalId, item.priceDivisor);
      if (!quote) throw new Error(`parse failed for ${item.secid}`);
      return [item.metalId, quote];
    })
  );

  const quotes: any = {};
  const errors: any[] = [];
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

