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

  it("无 link/guid 的 item 仍被保留（用 title+pubDate 生成稳定 id）", () => {
    const xml = `<?xml version="1.0"?><rss><channel>
<item>
<title>仅标题无链接的统计新闻</title>
<pubDate>Fri, 12 Jun 2026 15:59:39 GMT</pubDate>
<description>摘要内容</description>
</item>
</channel></rss>`;
    const items = parseIthomeRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("仅标题无链接的统计新闻");
    // id 为可复现的 title::pubDate，刷新不会重复入库
    expect(items[0].id).toBe("仅标题无链接的统计新闻::Fri, 12 Jun 2026 15:59:39 GMT");
    expect(items[0].link).toBe("");
    expect(items[0].dateKey).toBe("2026-06-12");
  });

  it("仅 guid 无 link 的 item 仍被保留（id 取 guid，link 回退空串）", () => {
    const xml = `<?xml version="1.0"?><rss><channel>
<item>
<title>有 guid 无 link</title>
<guid>tag:example.com,2026:42</guid>
<pubDate>Fri, 12 Jun 2026 15:59:39 GMT</pubDate>
<description>x</description>
</item>
</channel></rss>`;
    const items = parseIthomeRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("tag:example.com,2026:42");
    expect(items[0].link).toBe("");
  });

  it("description 含 <img> → 提取首个真实封面 url 到 cover", () => {
    const xml = `<?xml version="1.0"?><rss><channel>
<item>
<title>带封面新闻</title>
<link>https://www.ithome.com/0/2/2.htm</link>
<pubDate>Fri, 12 Jun 2026 15:59:39 GMT</pubDate>
<description>&lt;p&gt;&lt;img src="https://img.ithome.com/newsuploadfiles/2026/06/abc.jpg" /&gt;IT之家消息。&lt;/p&gt;</description>
</item>
</channel></rss>`;
    const items = parseIthomeRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0].cover).toBe(
      "https://img.ithome.com/newsuploadfiles/2026/06/abc.jpg",
    );
  });

  it("description 仅含占位图 → cover 回退空串", () => {
    const xml = `<?xml version="1.0"?><rss><channel>
<item>
<title>占位图新闻</title>
<link>https://www.ithome.com/0/3/3.htm</link>
<pubDate>Fri, 12 Jun 2026 15:59:39 GMT</pubDate>
<description>&lt;p&gt;&lt;img src="//img.ithome.com/images/v2/t.png" /&gt;正文摘要。&lt;/p&gt;</description>
</item>
</channel></rss>`;
    const items = parseIthomeRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0].cover).toBe("");
  });

  it("description 协议相对 URL 的图 → 补全 https", () => {
    const xml = `<?xml version="1.0"?><rss><channel>
<item>
<title>协议相对图新闻</title>
<link>https://www.ithome.com/0/4/4.htm</link>
<pubDate>Fri, 12 Jun 2026 15:59:39 GMT</pubDate>
<description>&lt;img src="//img.ithome.com/newsuploadfiles/real.jpg" /&gt;</description>
</item>
</channel></rss>`;
    const items = parseIthomeRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0].cover).toBe(
      "https://img.ithome.com/newsuploadfiles/real.jpg",
    );
  });
});
