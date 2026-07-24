/**
 * tests/detectors/rss-changelog.test.js
 *
 * RssChangelogDetector — 解析 RSS 2.0 feed, 拿第一个 item 的 content:encoded
 * 作为 changelog markdown. 不返 version 字段, 必须配 enrich_only=true 配
 * 合 chain 跑 (sparkle_appcast 等主 detector 拿 version, rss 后 enrich
 * changelog 字段).
 */
import { describe, it, expect } from "vitest";
import { RssChangelogDetector } from "../../src/detectors/rss-changelog.js";
import { MockHttp, makeCtx } from "../helpers/mock-http.js";
import { REASONS } from "../../src/detectors/errors.js";

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Codex changelog</title>
    <item>
      <title>Codex Remote reaches general availability</title>
      <link>https://developers.openai.com/codex/changelog/#codex-2026-06-25</link>
      <pubDate>Thu, 25 Jun 2026 00:00:00 GMT</pubDate>
      <content:encoded><![CDATA[# Codex Remote reaches general availability

Codex Remote has reached general availability. Use Codex from the ChatGPT mobile
app to start or continue work on a connected Mac or Windows host.]]></content:encoded>
    </item>
    <item>
      <title>Second item</title>
      <content:encoded>second content</content:encoded>
    </item>
  </channel>
</rss>`;

describe("RssChangelogDetector", () => {
  it("取第一个 item 的 content:encoded 当 changelog markdown", async () => {
    const http = new MockHttp({
      get: [{ status: 200, body: SAMPLE_RSS }],
    });
    const r = await new RssChangelogDetector({
      url: "https://example.com/rss.xml",
    }).detect(makeCtx({ http }));
    expect(r.version).toBe(""); // 故意空, 配 enrich_only=true
    expect(r.changelog).toContain("Codex Remote reaches general availability");
    expect(r.changelog).toContain("Mac or Windows host");
    expect(r.changelog_format).toBe("md");
    expect(r.changelog_url).toBe("https://example.com/rss.xml");
    expect(r.source).toBe("rss_changelog");
  });

  it("无 content:encoded 时 fallback 到 <description>", async () => {
    const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Item</title>
    <description>Plain text summary</description>
  </item>
</channel></rss>`;
    const http = new MockHttp({ get: [{ status: 200, body: rss }] });
    const r = await new RssChangelogDetector({ url: "x" }).detect(
      makeCtx({ http }),
    );
    expect(r.changelog).toBe("Plain text summary");
  });

  it("没有 <item> → no_version", async () => {
    const http = new MockHttp({
      get: [
        { status: 200, body: "<rss><channel><title>x</title></channel></rss>" },
      ],
    });
    await expect(
      new RssChangelogDetector({ url: "x" }).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });
});
