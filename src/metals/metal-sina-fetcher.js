/**
 * src/metals/metal-sina-fetcher.js
 *
 * Sina hq.sinajs.cn JSONP client for domestic metals (AU9999, AG9999).
 *
 * 注: 接口名义上是 GBK 编码, 但我们只解析 number / ASCII 字段
 * (time / price / prevClose / open / high / low / bid / ask / volume / date),
 * 这些字段在 GBK 下字节级 == ASCII / UTF-8 兼容. MetalCard 用的中文 name
 * 来自本地 metal-config.js, 不来自 fetcher. 所以不需要 GBK 解码依赖.
 *
 * HTTP 抽象: 接收注入的 `httpGet(url, headers) => Promise<string>`,
 * 测试可以直接传 UTF-8 string. dispatcher (metal-fetcher.js) 负责把
 * Pulse 的 httpClient 适配成这个 shape.
 */

const SINA_BASE = 'https://hq.sinajs.cn/list';

const DEFAULT_HEADERS = {
  Referer: 'https://finance.sina.com.cn',
  'User-Agent': 'Mozilla/5.0',
};

/**
 * Build Sina URL for multiple symbols.
 * @param {string[]} symbols - e.g. ['AU0', 'AG0']
 */
function buildSinaUrl(symbols) {
  return `${SINA_BASE}=${symbols.join(',')}`;
}

/**
 * Parse a single Sina JSONP line.
 * Format: var hq_str_SYMBOL="field1,field2,...";
 * Sina AU0 field positions (verified 2024-07):
 *   [0] name, [1] time (HHMMSS), [2] current, [3] prevClose, [4] open, [5] high, [6] low,
 *   [7] bid, [8] ask, [9] volume, ...
 *   [16] date (YYYY-MM-DD)
 * @param {string} line - raw JSONP line
 * @param {string} expectedSymbol - e.g. 'AU0'
 * @param {string} metalId - e.g. 'AU9999'
 */
function parseSinaLine(line, expectedSymbol, metalId) {
  if (!line || typeof line !== 'string') return null;
  const match = line.match(/var\s+hq_str_(\w+)="([^"]*)"/);
  if (!match || match[1] !== expectedSymbol) return null;

  const fields = match[2].split(',');
  if (fields.length < 5) return null;

  const current = parseFloat(fields[2]);
  const prevClose = parseFloat(fields[3]);
  if (!Number.isFinite(current) || !Number.isFinite(prevClose)) return null;

  // quoteTime: parse [1] (HHMMSS) + [16] (YYYY-MM-DD)
  const quoteTime = parseSinaTime(fields[1], fields[16]);

  return {
    id: metalId,
    price: current,
    prevClose,
    currency: 'CNY',
    unit: 'g',
    quoteTime,
    source: 'sina',
  };
}

/**
 * Parse Sina time fields into unix ms.
 * @param {string} time - HHMMSS
 * @param {string} date - YYYY-MM-DD
 */
function parseSinaTime(time, date) {
  if (!time || !date) return Date.now();
  const m = time.match(/^(\d{2})(\d{2})(\d{2})$/);
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || !d) return Date.now();
  const [, hh, mm, ss] = m;
  const [, yyyy, mo, dd] = d;
  return new Date(
    parseInt(yyyy),
    parseInt(mo) - 1,
    parseInt(dd),
    parseInt(hh),
    parseInt(mm),
    parseInt(ss)
  ).getTime();
}

/**
 * Parse a full Sina response (multiple JSONP lines).
 * @param {string} text - response body string
 * @param {Object} symbolToMetal - { 'AU0': 'AU9999', 'AG0': 'AG9999' }
 */
function parseSinaResponse(text, symbolToMetal) {
  const quotes = {};
  if (!text) return quotes;

  for (const [symbol, metalId] of Object.entries(symbolToMetal)) {
    const lineRegex = new RegExp(`var\\s+hq_str_${symbol}="([^"]*)"`, 'g');
    const match = lineRegex.exec(text);
    if (match) {
      const fakeLine = `var hq_str_${symbol}="${match[1]}";`;
      const parsed = parseSinaLine(fakeLine, symbol, metalId);
      if (parsed) quotes[metalId] = parsed;
    }
  }
  return quotes;
}

/**
 * Fetch Sina quotes for the given symbols.
 * @param {string[]} symbols - e.g. ['AU0', 'AG0']
 * @param {Function} httpGet - injected HTTP getter, returns Promise<string>
 */
async function fetchSinaQuotes(symbols, httpGet) {
  const url = buildSinaUrl(symbols);
  const response = await httpGet(url, DEFAULT_HEADERS);

  if (typeof response !== 'string') {
    throw new Error('Unexpected response type from Sina fetcher (expected string)');
  }

  const symbolToMetal = {};
  if (symbols.includes('AU0')) symbolToMetal.AU0 = 'AU9999';
  if (symbols.includes('AG0')) symbolToMetal.AG0 = 'AG9999';

  return parseSinaResponse(response, symbolToMetal);
}

module.exports = {
  fetchSinaQuotes,
  parseSinaResponse,
  parseSinaLine,
  parseSinaTime,
  buildSinaUrl,
};