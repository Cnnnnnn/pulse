/**
 * src/main/twitter-serenity/tweet-source.js
 *
 * TweetSource 抽象接口 + 共享 helpers.
 *
 * 每个 source 实现:
 *   { fetchUserTimeline(handle): Promise<RawTweet[]> }
 *
 * RawTweet (source 原始产出, 字段可能缺) → normalizeTweet → NormalizedTweet (cache 持久化).
 * 数据契约见 spec §4.1.
 */

// 真实浏览器 UA, Nitter/RSSHub 拒默认 Node UA (spec §3.2 原则 6: per-request header).
const TWITTER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * 把 source 产出的 (可能缺字段) raw tweet 补全为 NormalizedTweet (spec §4.1).
 * @param {object|null|undefined} raw
 * @param {string} fetchedAt  ISO8601, 调用方传当前时间
 * @returns {object} NormalizedTweet
 */
function normalizeTweet(raw, fetchedAt) {
  const r = raw || {};
  const id = String(r.id != null ? r.id : "");
  const handle = (r.author && r.author.handle) || "";
  return {
    id,
    url: r.url || buildTweetUrl(handle, id),
    author: {
      handle,
      displayName: (r.author && r.author.displayName) || "",
      avatarUrl: (r.author && r.author.avatarUrl) || "",
    },
    text: r.text || "",
    language: r.language || "en",
    publishedAt: r.publishedAt || null,
    fetchedAt,
    media: Array.isArray(r.media) ? r.media : [],
    metrics: Object.assign(
      { likes: 0, retweets: 0, replies: 0 },
      r.metrics || {},
    ),
    sourceMirror: r.sourceMirror || "unknown",
  };
}

/**
 * 拼 x.com canonical URL. handle/id 缺失返回空串.
 */
function buildTweetUrl(handle, id) {
  if (!handle || !id) return "";
  return `https://x.com/${handle}/status/${id}`;
}

/**
 * 从 X / twitter URL 提 status id. 非匹配 URL 返回 null.
 */
function parseTweetIdFromUrl(url) {
  if (typeof url !== "string") return null;
  const m = url.match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/);
  return m ? m[1] : null;
}

module.exports = {
  TWITTER_USER_AGENT,
  normalizeTweet,
  buildTweetUrl,
  parseTweetIdFromUrl,
};
