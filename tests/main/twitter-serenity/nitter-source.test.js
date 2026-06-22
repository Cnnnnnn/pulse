/**
 * tests/main/twitter-serenity/nitter-source.test.js
 *
 * Task 4: Nitter 镜像源 RSS XML 解析 + fetchUserTimeline 带 UA header.
 */

import { describe, it, expect, vi } from "vitest";
import { createNitterSource } from "../../../src/main/twitter-serenity/sources/nitter-source.js";
import { TWITTER_USER_AGENT } from "../../../src/main/twitter-serenity/tweet-source.js";

const SAMPLE_NITTER_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Serenity (@aleabitoreddit) | Nitter</title>
    <item>
      <title>Serenity: I think $NVDA is overvalued...</title>
      <link>https://twiiit.com/aleabitoreddit/status/1748291000000000001</link>
      <pubDate>Sat, 22 Jun 2026 13:39:00 GMT</pubDate>
      <description>I think $NVDA is overvalued at current levels. &lt;a href="x"&gt;link&lt;/a&gt;</description>
      <guid>https://twiiit.com/aleabitoreddit/status/1748291000000000001</guid>
    </item>
    <item>
      <title>Serenity: $SIVE breaking out</title>
      <link>https://twiiit.com/aleabitoreddit/status/1748291000000000002</link>
      <pubDate>Sat, 22 Jun 2026 12:00:00 GMT</pubDate>
      <description>$SIVE breaking out</description>
    </item>
  </channel>
</rss>`;

describe("nitter-source", () => {
  it("parseRss 解析 RSS 返回 RawTweet 数组", () => {
    const src = createNitterSource({ url: "https://twiiit.com", id: "nitter-twiiit" });
    const tweets = src.parseRss(SAMPLE_NITTER_RSS, "aleabitoreddit", "twiiit.com");
    expect(tweets).toHaveLength(2);
    expect(tweets[0].id).toBe("1748291000000000001");
    expect(tweets[0].author.handle).toBe("aleabitoreddit");
    expect(tweets[0].text).toContain("$NVDA");
    expect(tweets[0].publishedAt).toMatch(/^2026-06-22T13:39:00/);
    expect(tweets[0].sourceMirror).toBe("twiiit.com");
  });

  it("parseRss 空/无 item 返回空数组", () => {
    const src = createNitterSource({ url: "https://twiiit.com", id: "x" });
    expect(src.parseRss("<rss></rss>", "h", "twiiit.com")).toEqual([]);
    expect(src.parseRss("", "h", "twiiit.com")).toEqual([]);
    expect(src.parseRss(null, "h", "twiiit.com")).toEqual([]);
  });

  it("parseRss 字段缺失项被跳过 (无 link/id)", () => {
    const src = createNitterSource({ url: "https://twiiit.com", id: "x" });
    const bad = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>no link</title></item>
      <item><link>https://twiiit.com/h/status/555</link><description>ok</description></item>
    </channel></rss>`;
    const tweets = src.parseRss(bad, "h", "twiiit.com");
    expect(tweets).toHaveLength(1);
    expect(tweets[0].id).toBe("555");
  });

  it("parseRss HTML entity 被 decode", () => {
    const src = createNitterSource({ url: "https://twiiit.com", id: "x" });
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><link>https://twiiit.com/h/status/1</link><description>Tom &amp; Jerry &lt;b&gt;</description></item>
    </channel></rss>`;
    const tweets = src.parseRss(rss, "h", "twiiit.com");
    expect(tweets[0].text).toBe("Tom & Jerry <b>");
  });

  it("fetchUserTimeline 拼 {url}/{handle}/rss + 带 TWITTER_USER_AGENT header", async () => {
    const httpClient = {
      get: vi.fn().mockResolvedValue({ status: 200, body: SAMPLE_NITTER_RSS }),
    };
    const src = createNitterSource({ url: "https://twiiit.com", id: "x", httpClient });
    const tweets = await src.fetchUserTimeline("aleabitoreddit");
    expect(httpClient.get).toHaveBeenCalled();
    const [url, opts] = httpClient.get.mock.calls[0];
    expect(url).toBe("https://twiiit.com/aleabitoreddit/rss");
    expect(opts.headers["User-Agent"]).toBe(TWITTER_USER_AGENT);
    expect(tweets).toHaveLength(2);
  });

  it("fetchUserTimeline HTTP 非 2xx 抛错", async () => {
    const httpClient = { get: vi.fn().mockResolvedValue({ status: 503, body: "" }) };
    const src = createNitterSource({ url: "https://twiiit.com", id: "x", httpClient });
    await expect(src.fetchUserTimeline("h")).rejects.toThrow(/503/);
  });
});
