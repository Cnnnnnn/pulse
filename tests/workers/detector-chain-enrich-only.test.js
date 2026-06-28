/**
 * tests/workers/detector-chain-enrich-only.test.js
 *
 * C9 (2026-06-28): enrich_only detector 不参与版本号竞争, 跑后**继续**
 * chain, 后续 detector 拿 version 后用 mergeEnrich 把 enrich_only 的
 * changelog 字段合并到 winner. 适用: e.g. Codex 配 [rss_changelog,
 * sparkle_appcast] — rss 拿 markdown, sparkle 拿 26.623.42026, merge
 * 后 result.version=26.623.42026 + result.changelog=<markdown>.
 */
import { describe, it, expect } from "vitest";
import { runDetectorChain } from "../../src/workers/detector-chain.js";
import { MockHttp, makeCtx } from "../helpers/mock-http.js";

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <item>
    <title>Latest</title>
    <content:encoded># Markdown changelog content here

- feature A
- feature B</content:encoded>
  </item>
</channel>
</rss>`;

const SAMPLE_SPARKLE = `<?xml version="1.0"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0">
  <channel>
    <item>
      <title>26.623.42026</title>
      <sparkle:shortVersionString>26.623.42026</sparkle:shortVersionString>
      <enclosure url="https://example.com/Codex.zip" length="1234" type="application/octet-stream" />
    </item>
  </channel>
</rss>`;

describe("runDetectorChain — enrich_only (C9)", () => {
  it("rss_enrich_only 排前 + sparkle 排后 → version 来自 sparkle, changelog 来自 rss", async () => {
    const http = new MockHttp({
      get: [
        { status: 200, body: SAMPLE_RSS },
        { status: 200, body: SAMPLE_SPARKLE },
      ],
    });
    const out = await runDetectorChain(
      {
        name: "Codex",
        detectors: [
          { type: "rss_changelog", url: "https://x/rss", enrich_only: true },
          { type: "sparkle_appcast", url: "https://x/appcast" },
        ],
      },
      makeCtx({ http }),
    );
    expect(out.result.version).toBe("26.623.42026");
    expect(out.result.source).toBe("sparkle_appcast");
    expect(out.result.changelog).toContain("Markdown changelog content here");
    expect(out.result.changelog).toContain("feature A");
  });

  it("enrich_only 排后, sparkle 排前 → chain stop 在 sparkle, rss 不跑, changelog 仍空", async () => {
    // 守护回归: enrich_only 必须排前面, 否则 chain 在前一个 detector 处 stop,
    // enrich_only 不被调用.
    const http = new MockHttp({
      get: [{ status: 200, body: SAMPLE_SPARKLE }],
    });
    const out = await runDetectorChain(
      {
        name: "Codex",
        detectors: [
          { type: "sparkle_appcast", url: "https://x/appcast" },
          { type: "rss_changelog", url: "https://x/rss", enrich_only: true },
        ],
      },
      makeCtx({ http }),
    );
    expect(out.result.version).toBe("26.623.42026");
    expect(out.result.changelog).toBeFalsy();
  });

  it("enrich_only detector 单独跑 (无后续 detector 拿 version) → 拿不到 version, result 仍非空但 version 空", async () => {
    // 边界: enrich_only 配成唯一 detector, chain 跑完无 version. 不该崩,
    // result 应该是 null (firstHit 写但 winner 不存在, out.result 用 firstHit).
    const http = new MockHttp({
      get: [{ status: 200, body: SAMPLE_RSS }],
    });
    const out = await runDetectorChain(
      {
        name: "Test",
        detectors: [
          { type: "rss_changelog", url: "https://x/rss", enrich_only: true },
        ],
      },
      makeCtx({ http }),
    );
    // chain end: firstHit 已被 enrich_only 设, out.result = firstHit.result
    expect(out.result).toBeTruthy();
    expect(out.result.version).toBe("");
    expect(out.result.changelog).toContain("Markdown changelog content here");
  });
});
