const EM_KLINE_BASE = "https://push2his.eastmoney.com/api/qt/stock/kline/get";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Referer: "https://quote.eastmoney.com/",
};

const FIELDS = "f51,f52,f53,f54,f55,f56,f57,f58";
const KLINE_FIELDS_1 = "f1,f2,f3,f4,f5";

function buildKlineUrl(secid, beg, end) {
  const params = new URLSearchParams({
    secid,
    fields1: KLINE_FIELDS_1,
    fields2: FIELDS,
    klt: "101",
    fqt: "0",
    beg,
    end,
    lmt: "10000",
  });
  return `${EM_KLINE_BASE}?${params.toString()}`;
}

function parseKlineResponse(text, secid) {
  if (!text || typeof text !== "string") return null;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!json || json.rc !== 0 || !json.data || !Array.isArray(json.data.klines)) {
    return null;
  }
  const points = [];
  for (const line of json.data.klines) {
    const parts = line.split(",");
    if (parts.length < 6) continue;
    const [date, open, close, high, low] = parts;
    const o = parseFloat(open);
    const c = parseFloat(close);
    const h = parseFloat(high);
    const l = parseFloat(low);
    if (
      !Number.isFinite(o) ||
      !Number.isFinite(c) ||
      !Number.isFinite(h) ||
      !Number.isFinite(l)
    ) {
      continue;
    }
    points.push({ date, open: o, close: c, high: h, low: l });
  }
  if (points.length === 0) return null;
  return { id: secid, points, source: "eastmoney" };
}

function dedupeByDate(points, maxDays = 30) {
  const map = new Map();
  for (const p of points) {
    map.set(p.date, p);
  }
  const out = Array.from(map.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  return out.slice(-maxDays);
}

async function fetchMetalKline(items, httpGet) {
  if (!Array.isArray(items) || items.length === 0) return {};
  const settled = await Promise.allSettled(
    items.map(async (item) => {
      const beg = isoDateOffset(-40);
      const end = isoDateOffset(0);
      const url = buildKlineUrl(item.secid, beg, end);
      const text = await httpGet(url, DEFAULT_HEADERS);
      const parsed = parseKlineResponse(text, item.secid);
      if (!parsed) throw new Error(`parse failed for ${item.secid}`);
      const deduped = dedupeByDate(parsed.points);
      return [item.id, deduped];
    }),
  );
  const out = {};
  const errors = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") {
      out[r.value[0]] = r.value[1];
    } else {
      errors.push(`${items[i].secid}: ${r.reason && r.reason.message}`);
    }
  }
  if (errors.length === items.length) {
    throw new Error(
      `eastmoney kline: all ${items.length} symbol(s) failed — ${errors.join("; ")}`,
    );
  }
  return out;
}

function pointsToHistoryMap(fetched, items) {
  const out = {};
  for (const item of items) {
    if (!fetched[item.id]) continue;
    // 保留完整 OHLC (open/high/low/close): 详情面板的 K 线主图需要 candlestick 形态.
    // 只读 .close 的旧消费者 (MetalWatchlist sparkline / scheduler 检测) 不受影响 —
    // 多出的字段是纯加法.
    out[item.id] = fetched[item.id].map((p) => ({
      date: p.date,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }));
  }
  return out;
}

function isoDateOffset(dayOffset) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

module.exports = {
  buildKlineUrl,
  parseKlineResponse,
  dedupeByDate,
  fetchMetalKline,
  pointsToHistoryMap,
  isoDateOffset,
};