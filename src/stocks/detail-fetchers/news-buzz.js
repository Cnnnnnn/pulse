/**
 * src/stocks/detail-fetchers/news-buzz.js
 *
 * news_buzz angle fetcher. 东财 np-listapi 优先, sina feed.mix 备援.
 * 客户端词典情感打标 (positive / neutral / negative).
 */
const NEWS_URL = "https://np-listapi.eastmoney.com/comm/web/getListInfo";
const SINA_FEED_URL = "https://feed.mix.sina.com.cn/api/roll/get";

const POSITIVE_KW = ["涨", "利好", "突破", "新高", "上行", "增长", "盈利", "改善"];
const NEGATIVE_KW = ["跌", "利空", "破位", "新低", "下行", "亏损", "下降", "下滑"];

async function fetchNewsBuzz(httpClient, { code }) {
  const emUrl = `${NEWS_URL}?client=wap&type=1&pageSize=20&pageIndex=1&code=${code}&_=${Date.now()}`;
  let emFetchOk = false;
  let emParseOk = false;
  try {
    const primary = await httpClient.get(emUrl);
    emFetchOk = primary.ok;
    if (primary.ok) {
      const out = parseEmNews(primary.body);
      if (out) return { ok: true, data: out };
      emParseOk = false;
    }
  } catch (e) { /* fall through */ }

  // em 解析失败 (200 OK 但 body 缺字段) → 明确报 parse_failed, 不再 fallback
  if (emFetchOk && !emParseOk) {
    return { ok: false, reason: "parse_failed", error: "parse error" };
  }

  // em 网络/请求失败 → fallback sina
  const sinaUrl = `${SINA_FEED_URL}?pageid=153&lid=1686&k=${code}&num=10&page=1`;
  try {
    const fallback = await httpClient.get(sinaUrl);
    if (fallback.ok) {
      const out = parseSinaNews(fallback.body);
      if (out) return { ok: true, data: out };
      return { ok: false, reason: "parse_failed", error: "parse error" };
    }
  } catch (e) { /* fall through */ }

  return { ok: false, reason: "fetch_failed", error: "fetch error" };
}

function parseEmNews(body) {
  if (!body || !body.data || !Array.isArray(body.data.list)) return null;
  const items = body.data.list.slice(0, 7).map((it) => ({
    title: it.title || it.Art_Title || "",
    date: it.date || it.showTime || "",
    sentiment: classifySentiment(it.title || ""),
  })).filter((it) => it.title);
  if (items.length === 0) return null;
  return { items };
}

function parseSinaNews(body) {
  if (!body || !body.result || !Array.isArray(body.result.data)) return null;
  const items = body.result.data.slice(0, 7).map((it) => ({
    title: it.title || "",
    date: it.ctime || "",
    sentiment: classifySentiment(it.title || ""),
  })).filter((it) => it.title);
  if (items.length === 0) return null;
  return { items };
}

function classifySentiment(title) {
  for (const k of POSITIVE_KW) if (title.includes(k)) return "positive";
  for (const k of NEGATIVE_KW) if (title.includes(k)) return "negative";
  return "neutral";
}

module.exports = { fetchNewsBuzz };
