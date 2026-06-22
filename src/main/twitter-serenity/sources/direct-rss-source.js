/**
 * src/main/twitter-serenity/sources/direct-rss-source.js
 *
 * 任意 ATOM/RSS 兜底源. 用户自填的 feed URL, 直接 GET.
 * 解析复用 nitter-source 的 RSS regex (提取 link/status/id).
 */

const { TWITTER_USER_AGENT } = require("../tweet-source");
const { createNitterSource } = require("./nitter-source");

function createDirectRssSource(opts) {
  const { url, id } = opts;
  const httpClient = opts.httpClient;
  // 借用 nitter parser 的 parseRss (只解析, 不走它的 url 拼接)
  const parser = createNitterSource({ url, id, httpClient });

  async function fetchUserTimeline(handle) {
    const resp = await httpClient.get(url, {
      headers: {
        "User-Agent": TWITTER_USER_AGENT,
        Accept: "application/rss+xml, application/atom+xml",
      },
      timeout: 5000,
      follow: true,
    });
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`direct-rss ${url} HTTP ${resp.status}`);
    }
    let mirrorDomain;
    try {
      mirrorDomain = new URL(url).host;
    } catch {
      mirrorDomain = url;
    }
    return parser.parseRss(resp.body, handle, mirrorDomain);
  }

  return {
    id,
    type: "rss",
    url,
    parseRss: parser.parseRss,
    fetchUserTimeline,
  };
}

module.exports = { createDirectRssSource };
