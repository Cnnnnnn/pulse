/**
 * src/main/twitter-serenity/sources/rsshub-source.js
 *
 * RSSHub 源. JSON Feed 路由: {url}/twitter/user/{handle}
 * 响应是 JSON Feed 1.1 (item[] 数组). content_html 是真 HTML, 需 strip.
 */

const { TWITTER_USER_AGENT } = require("../tweet-source");

function stripHtml(s) {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, "").trim();
}

function createRsshubSource(opts) {
  const { url, id } = opts;
  const httpClient = opts.httpClient;

  function parseJson(json, handle, mirrorDomain) {
    let feed;
    try {
      feed = JSON.parse(json);
    } catch {
      return [];
    }
    const items = Array.isArray(feed && feed.item) ? feed.item : [];
    const out = [];
    for (const it of items) {
      const itemUrl = it.url || it.id || "";
      const idMatch = itemUrl.match(/\/status\/(\d+)/);
      if (!idMatch) continue;
      out.push({
        id: idMatch[1],
        url: itemUrl,
        text: stripHtml(it.content_html || it.content_text || it.title || ""),
        author: {
          handle,
          displayName: (it.authors && it.authors[0] && it.authors[0].name) || "",
        },
        publishedAt: it.date_published || null,
        media: [],
        metrics: { likes: 0, retweets: 0, replies: 0 },
        sourceMirror: mirrorDomain,
      });
    }
    return out;
  }

  async function fetchUserTimeline(handle) {
    const feedUrl = `${url}/twitter/user/${handle}`;
    const resp = await httpClient.get(feedUrl, {
      headers: { "User-Agent": TWITTER_USER_AGENT, Accept: "application/json" },
      timeout: 5000,
      follow: true,
    });
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`rsshub ${url} HTTP ${resp.status}`);
    }
    let mirrorDomain;
    try {
      mirrorDomain = new URL(url).host;
    } catch {
      mirrorDomain = url;
    }
    return parseJson(resp.body, handle, mirrorDomain);
  }

  return { id, type: "rsshub", url, parseJson, fetchUserTimeline };
}

module.exports = { createRsshubSource };
