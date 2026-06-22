/**
 * src/main/twitter-serenity/sources/nitter-source.js
 *
 * Nitter 镜像源. RSS path: {url}/{handle}/rss
 * 解析用正则提取 <item> 块 (避免引 XML parser 依赖).
 */

const { TWITTER_USER_AGENT } = require("../tweet-source");

function decodeEntities(s) {
  if (!s) return "";
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(s) {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, "").trim();
}

function parseDate(pubDate) {
  if (!pubDate) return null;
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function createNitterSource(opts) {
  const { url, id } = opts;
  const httpClient = opts.httpClient;

  function parseRss(xml, handle, mirrorDomain) {
    if (!xml || typeof xml !== "string") return [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    const out = [];
    let m;
    while ((m = itemRe.exec(xml)) !== null) {
      const block = m[1];
      const link = decodeEntities(
        (block.match(/<link>([^<]*)<\/link>/) || [])[1] || "",
      );
      const descRaw = decodeEntities(
        (block.match(/<description>([^<]*)<\/description>/) || [])[1] || "",
      );
      const pubDate = (block.match(/<pubDate>([^<]*)<\/pubDate>/) || [])[1] || "";
      // 从 link 提 id: {url}/{handle}/status/{id}
      const idMatch = link.match(/\/status\/(\d+)/);
      if (!idMatch) continue;
      out.push({
        id: idMatch[1],
        url: link,
        // RSS description 的 entity decode 即显示文本; HTML 标签清洗留给渲染层 dompurify (spec §11)
        text: descRaw.trim(),
        author: { handle, displayName: "" },
        publishedAt: parseDate(pubDate),
        media: [],
        metrics: { likes: 0, retweets: 0, replies: 0 },
        sourceMirror: mirrorDomain,
      });
    }
    return out;
  }

  async function fetchUserTimeline(handle) {
    const feedUrl = `${url}/${handle}/rss`;
    const resp = await httpClient.get(feedUrl, {
      headers: {
        "User-Agent": TWITTER_USER_AGENT,
        Accept: "application/rss+xml",
      },
      timeout: 5000,
      follow: true,
    });
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`nitter ${url} HTTP ${resp.status}`);
    }
    let mirrorDomain;
    try {
      mirrorDomain = new URL(url).host;
    } catch {
      mirrorDomain = url;
    }
    return parseRss(resp.body, handle, mirrorDomain);
  }

  return { id, type: "nitter", url, parseRss, fetchUserTimeline };
}

module.exports = { createNitterSource };
