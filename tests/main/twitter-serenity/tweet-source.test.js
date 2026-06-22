/**
 * tests/main/twitter-serenity/tweet-source.test.js
 *
 * Task 3: tweet-source 接口 + UA 常量 + normalizeTweet/buildTweetUrl/parseTweetIdFromUrl helpers.
 */

import { describe, it, expect } from "vitest";
import {
  TWITTER_USER_AGENT,
  normalizeTweet,
  buildTweetUrl,
  parseTweetIdFromUrl,
} from "../../../src/main/twitter-serenity/tweet-source.js";

describe("tweet-source helpers", () => {
  it("TWITTER_USER_AGENT 是非空浏览器 UA 字符串", () => {
    expect(typeof TWITTER_USER_AGENT).toBe("string");
    expect(TWITTER_USER_AGENT.length).toBeGreaterThan(50);
    expect(TWITTER_USER_AGENT).toMatch(/Mozilla|Chrome|Safari/i);
  });

  it("normalizeTweet 补全 fetchedAt / media / metrics 默认值", () => {
    const raw = {
      id: "123",
      text: "hello",
      author: { handle: "h", displayName: "H" },
      publishedAt: "2026-06-22T10:00:00Z",
      sourceMirror: "twiiit.com",
    };
    const n = normalizeTweet(raw, "2026-06-22T10:01:00Z");
    expect(n.id).toBe("123");
    expect(n.fetchedAt).toBe("2026-06-22T10:01:00Z");
    expect(n.media).toEqual([]);
    expect(n.metrics).toEqual({ likes: 0, retweets: 0, replies: 0 });
    expect(n.url).toContain("123");
    expect(n.sourceMirror).toBe("twiiit.com");
  });

  it("normalizeTweet 缺字段时容错 (id 转 string, author 空对象)", () => {
    const n = normalizeTweet({ id: 1 }, "now");
    expect(n.id).toBe("1");
    expect(n.text).toBe("");
    expect(n.author).toEqual({ handle: "", displayName: "", avatarUrl: "" });
    expect(n.language).toBe("en");
  });

  it("normalizeTweet null/undefined raw 容错返回带空 id 的对象", () => {
    const n = normalizeTweet(null, "now");
    expect(n.id).toBe("");
    expect(n.text).toBe("");
    expect(n.media).toEqual([]);
  });

  it("normalizeTweet XSS payload: text 原样保留 (渲染层 dompurify 负责转义)", () => {
    const n = normalizeTweet(
      { id: "1", text: "<script>alert(1)</script>" },
      "now",
    );
    expect(n.text).toBe("<script>alert(1)</script>");
  });

  it("buildTweetUrl 拼 x.com URL", () => {
    expect(buildTweetUrl("aleabitoreddit", "123")).toBe(
      "https://x.com/aleabitoreddit/status/123",
    );
  });

  it("buildTweetUrl handle/id 缺失返回空串", () => {
    expect(buildTweetUrl("", "123")).toBe("");
    expect(buildTweetUrl("h", "")).toBe("");
  });

  it("parseTweetIdFromUrl 从 X / twitter URL 提 id", () => {
    expect(parseTweetIdFromUrl("https://x.com/h/status/999")).toBe("999");
    expect(parseTweetIdFromUrl("https://twitter.com/h/status/888")).toBe("888");
    expect(parseTweetIdFromUrl("not a url")).toBeNull();
    expect(parseTweetIdFromUrl("https://x.com/h/no-status-here")).toBeNull();
  });
});
