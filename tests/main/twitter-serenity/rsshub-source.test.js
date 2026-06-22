/**
 * tests/main/twitter-serenity/rsshub-source.test.js
 *
 * Task 5: RSSHub JSON Feed 解析 + direct-rss 兜底源 (复用 nitter RSS 解析).
 */

import { describe, it, expect, vi } from "vitest";

const SAMPLE_RSSHUB_JSON = JSON.stringify({
  item: [
    {
      id: "https://x.com/aleabitoreddit/status/1001",
      url: "https://x.com/aleabitoreddit/status/1001",
      title: "post one",
      content_html: "post one with $AAPL",
      date_published: "2026-06-22T13:00:00.000Z",
      authors: [{ name: "Serenity", url: "https://x.com/aleabitoreddit" }],
    },
    {
      id: "https://x.com/aleabitoreddit/status/1002",
      url: "https://x.com/aleabitoreddit/status/1002",
      title: "post two",
      content_html: "post two",
      date_published: "2026-06-22T12:00:00.000Z",
    },
  ],
});

describe("rsshub-source", () => {
  it("parseJson 解析 JSON Feed 返回 RawTweet", () => {
    const { createRsshubSource } = require("../../../src/main/twitter-serenity/sources/rsshub-source.js");
    const src = createRsshubSource({ url: "https://rsshub.app", id: "rsshub-public" });
    const tweets = src.parseJson(SAMPLE_RSSHUB_JSON, "aleabitoreddit", "rsshub.app");
    expect(tweets).toHaveLength(2);
    expect(tweets[0].id).toBe("1001");
    expect(tweets[0].text).toContain("$AAPL");
    expect(tweets[0].author.handle).toBe("aleabitoreddit");
    expect(tweets[0].author.displayName).toBe("Serenity");
    expect(tweets[0].publishedAt).toBe("2026-06-22T13:00:00.000Z");
  });

  it("parseJson 空/坏 JSON 返回空数组", () => {
    const { createRsshubSource } = require("../../../src/main/twitter-serenity/sources/rsshub-source.js");
    const src = createRsshubSource({ url: "https://rsshub.app", id: "x" });
    expect(src.parseJson("", "h", "rsshub.app")).toEqual([]);
    expect(src.parseJson("not json", "h", "rsshub.app")).toEqual([]);
    expect(src.parseJson("{}", "h", "rsshub.app")).toEqual([]);
  });

  it("parseJson 字段缺失项跳过 (无 url/id)", () => {
    const { createRsshubSource } = require("../../../src/main/twitter-serenity/sources/rsshub-source.js");
    const src = createRsshubSource({ url: "https://rsshub.app", id: "x" });
    const json = JSON.stringify({
      item: [
        { title: "no id" },
        { id: "https://x.com/h/status/9", url: "https://x.com/h/status/9" },
      ],
    });
    const tweets = src.parseJson(json, "h", "rsshub.app");
    expect(tweets).toHaveLength(1);
    expect(tweets[0].id).toBe("9");
  });

  it("fetchUserTimeline 拼 /twitter/user/{handle} 路由 + 带 UA", async () => {
    const { TWITTER_USER_AGENT } = require("../../../src/main/twitter-serenity/tweet-source.js");
    const { createRsshubSource } = require("../../../src/main/twitter-serenity/sources/rsshub-source.js");
    const httpClient = {
      get: vi.fn().mockResolvedValue({ status: 200, body: SAMPLE_RSSHUB_JSON }),
    };
    const src = createRsshubSource({ url: "https://rsshub.app", id: "x", httpClient });
    await src.fetchUserTimeline("aleabitoreddit");
    const [url, opts] = httpClient.get.mock.calls[0];
    expect(url).toBe("https://rsshub.app/twitter/user/aleabitoreddit");
    expect(opts.headers["User-Agent"]).toBe(TWITTER_USER_AGENT);
  });

  it("content_html 被 strip 成纯文本", () => {
    const { createRsshubSource } = require("../../../src/main/twitter-serenity/sources/rsshub-source.js");
    const src = createRsshubSource({ url: "https://rsshub.app", id: "x" });
    const json = JSON.stringify({
      item: [
        {
          id: "https://x.com/h/status/1",
          url: "https://x.com/h/status/1",
          content_html: "<p>hi <b>x</b></p>",
        },
      ],
    });
    const tweets = src.parseJson(json, "h", "rsshub.app");
    expect(tweets[0].text).toBe("hi x");
  });
});

describe("direct-rss-source", () => {
  it("fetchUserTimeline 拼 {url} 直接 GET (复用 nitter RSS 解析)", async () => {
    const SAMPLE =
      '<?xml version="1.0"?><rss version="2.0"><channel>' +
      '<item><link>https://x.com/h/status/42</link><description>raw</description></item>' +
      "</channel></rss>";
    const { createDirectRssSource } = require("../../../src/main/twitter-serenity/sources/direct-rss-source.js");
    const httpClient = { get: vi.fn().mockResolvedValue({ status: 200, body: SAMPLE }) };
    const src = createDirectRssSource({ url: "https://example.com/feed.xml", id: "direct-1", httpClient });
    const tweets = await src.fetchUserTimeline("h");
    expect(httpClient.get.mock.calls[0][0]).toBe("https://example.com/feed.xml");
    expect(tweets).toHaveLength(1);
    expect(tweets[0].id).toBe("42");
  });
});
