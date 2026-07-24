/**
 * tests/main/ithome-rss-parser.test.js
 */

import { describe, it, expect } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const {
  parseIthomeRss,
  stripHtml,
  toShanghaiDateKey,
} = requireMain("ithome/rss-parser");

const SAMPLE = `<?xml version="1.0"?>
<rss><channel>
<item>
<title>测试标题</title>
<link>https://www.ithome.com/0/1/1.htm</link>
<guid>https://www.ithome.com/0/1/1.htm</guid>
<pubDate>Fri, 12 Jun 2026 15:59:39 GMT</pubDate>
<description>&lt;p&gt;IT之家 6 月 12 日消息，&lt;strong&gt;测试&lt;/strong&gt;。&lt;/p&gt;</description>
</item>
</channel></rss>`;

describe("ithome rss-parser", () => {
  it("parseIthomeRss extracts article fields", () => {
    const items = parseIthomeRss(SAMPLE);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("测试标题");
    expect(items[0].id).toBe("https://www.ithome.com/0/1/1.htm");
    expect(items[0].dateKey).toBe("2026-06-12");
    expect(items[0].excerpt).toContain("测试");
  });

  it("stripHtml removes tags", () => {
    expect(stripHtml("<p>你好 <b>世界</b></p>")).toBe("你好 世界");
  });

  it("toShanghaiDateKey uses Asia/Shanghai", () => {
    expect(toShanghaiDateKey("Fri, 12 Jun 2026 15:59:39 GMT")).toBe(
      "2026-06-12",
    );
  });
});
