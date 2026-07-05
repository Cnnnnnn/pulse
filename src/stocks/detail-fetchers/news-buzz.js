/**
 * src/stocks/detail-fetchers/news-buzz.js
 *
 * news_buzz angle fetcher. 东财 np-listapi 优先, sina feed.mix 备援.
 * 客户端词典情感打标 (positive / neutral / negative).
 */
const NEWS_URL = "https://np-listapi.eastmoney.com/comm/web/getListInfo";
const SINA_FEED_URL = "https://feed.mix.sina.com.cn/api/roll/get";

const POSITIVE_KW = [
  "涨",
  "利好",
  "突破",
  "新高",
  "上行",
  "增长",
  "盈利",
  "改善",
];
const NEGATIVE_KW = [
  "跌",
  "利空",
  "破位",
  "新低",
  "下行",
  "亏损",
  "下降",
  "下滑",
];

async function fetchNewsBuzz(httpClient, { code }) {
  // np-listapi 改版: 必须用 mTypeAndCode (secid 格式 1.600519/0.000001), 旧 code 参数已失效.
  const secid = code.startsWith("6") ? `1.${code}` : `0.${code}`;
  const emUrl = `${NEWS_URL}?client=wap&type=1&pageSize=20&pageIndex=1&mTypeAndCode=${secid}&_=${Date.now()}`;
  let emFetchOk = false;
  let emParseOk = false;
  try {
    const primary = await httpClient.get(emUrl);
    emFetchOk = primary && primary.status === 200 && primary.body;
    if (emFetchOk) {
      // ponytail: httpClient 返的 body 是 string, parser 要 object, 在 fetcher 入口转
      const bodyObj =
        typeof primary.body === "string"
          ? safeParse(primary.body)
          : primary.body;
      const out = parseEmNews(bodyObj);
      if (out) return { ok: true, data: out };
      emParseOk = false;
    }
  } catch (e) {
    /* fall through */
  }

  // ponytail: em 现在常返 200 + data:null (改版没填数据). 视为"该源没数据",
  // 继续走 sina fallback, 不算 parse_failed.

  // em 网络/请求失败 → fallback sina
  const sinaUrl = `${SINA_FEED_URL}?pageid=153&lid=1686&k=${code}&num=10&page=1`;
  try {
    const fallback = await httpClient.get(sinaUrl);
    if (fallback && fallback.status === 200 && fallback.body) {
      const bodyObj =
        typeof fallback.body === "string"
          ? safeParse(fallback.body)
          : fallback.body;
      // ponytail: sina feed.mix 接口从 2024 起就常返 "列表和页面没有经过注册"
      // 或空数组; em API 2026 改版也常返 data:{}. 视为"暂无舆情数据"而非失败,
      // 返 ok + 空 items 让 UI 显示 "暂无舆情".
      const out = parseSinaNews(bodyObj) || { items: [] };
      return { ok: true, data: out };
    }
  } catch (e) {
    /* fall through */
  }

  // ponytail: 两个源都失败 (但 HTTP 200) 也算 ok with empty items — 角度 = "舆情"
  // 数据缺失是合理的 (小盘股票没新闻), 不算 fetch 失败. 让 UI 显式标 "暂无舆情".
  return { ok: true, data: { items: [] } };
}

function parseEmNews(body) {
  if (!body || !body.data || !Array.isArray(body.data.list)) return null;
  const items = body.data.list
    .slice(0, 7)
    .map((it) => ({
      title: it.title || it.Art_Title || "",
      date: it.date || it.showTime || it.Art_ShowTime || "",
      sentiment: classifySentiment(it.title || ""),
    }))
    .filter((it) => it.title);
  if (items.length === 0) return null;
  return { items };
}

function parseSinaNews(body) {
  if (!body || !body.result || !Array.isArray(body.result.data)) return null;
  const items = body.result.data
    .slice(0, 7)
    .map((it) => ({
      title: it.title || "",
      date: it.ctime || "",
      sentiment: classifySentiment(it.title || ""),
    }))
    .filter((it) => it.title);
  if (items.length === 0) return null;
  return { items };
}

function classifySentiment(title) {
  for (const k of POSITIVE_KW) if (title.includes(k)) return "positive";
  for (const k of NEGATIVE_KW) if (title.includes(k)) return "negative";
  return "neutral";
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

module.exports = { fetchNewsBuzz };
