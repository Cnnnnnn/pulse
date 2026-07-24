/**
 * tests/detectors/sparkle-appcast.test.js
 */
import { describe, it, expect } from 'vitest';
import { SparkleAppcastDetector } from '../../src/detectors/sparkle-appcast.js';
import { MockHttp, makeCtx } from '../helpers/mock-http.js';
import { REASONS } from '../../src/detectors/errors.js';

const APPCAST = `<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <item>
      <title>3.0.1</title>
      <enclosure url="x.dmg"
                 sparkle:shortVersionString="3.0.1"
                 sparkle:version="310" />
    </item>
    <item>
      <title>2.9</title>
      <enclosure sparkle:shortVersionString="2.9.0" sparkle:version="290" />
    </item>
  </channel>
</rss>`;

describe('SparkleAppcastDetector', () => {
  it('优先取第一个 item 的 sparkle:shortVersionString', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: APPCAST }] });
    const r = await new SparkleAppcastDetector({ url: 'https://x/appcast.xml' }).detect(makeCtx({ http }));
    expect(r.version).toBe('3.0.1');
    expect(r.source).toBe('sparkle_appcast');
  });

  it('没有 shortVersionString 时回退到 sparkle:version', async () => {
    const xml = '<rss><channel><item><enclosure sparkle:version="210" /></item></channel></rss>';
    const http = new MockHttp({ get: [{ status: 200, body: xml }] });
    const r = await new SparkleAppcastDetector({ url: 'https://x' }).detect(makeCtx({ http }));
    expect(r.version).toBe('210');
  });

  it('找不到 → no_version', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: '<rss><channel></channel></rss>' }] });
    await expect(
      new SparkleAppcastDetector({ url: 'https://x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('timeout → timeout', async () => {
    const http = new MockHttp({ get: [{ error: 'timeout' }] });
    await expect(
      new SparkleAppcastDetector({ url: 'https://x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.TIMEOUT });
  });

  it('404 → http_4xx', async () => {
    const http = new MockHttp({ get: [{ status: 404, body: '' }] });
    await expect(
      new SparkleAppcastDetector({ url: 'https://x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.HTTP_4XX, httpStatus: 404 });
  });

  // Phase 14: 提取 description 节点 (HTML 格式)
  describe('Phase 14: description (changelog) 提取', () => {
    it('CDATA 包裹的 description', async () => {
      const xml = `<?xml version="1.0"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <item>
      <title>3.0.1</title>
      <description><![CDATA[<h2>What's New</h2><ul><li>Fix bug</li></ul>]]></description>
      <enclosure sparkle:shortVersionString="3.0.1" sparkle:version="310" />
    </item>
  </channel>
</rss>`;
      const http = new MockHttp({ get: [{ status: 200, body: xml }] });
      const r = await new SparkleAppcastDetector({ url: 'https://x' }).detect(makeCtx({ http }));
      expect(r.changelog).toContain("What's New");
      expect(r.changelog_format).toBe('html');
    });

    it('非 CDATA description', async () => {
      const xml = `<rss><channel><item><description>simple text</description><enclosure sparkle:shortVersionString="1.0" /></item></channel></rss>`;
      const http = new MockHttp({ get: [{ status: 200, body: xml }] });
      const r = await new SparkleAppcastDetector({ url: 'https://x' }).detect(makeCtx({ http }));
      expect(r.changelog).toBe('simple text');
    });

    it('没有 description → changelog 空串 (UI 端 fallback "无 release notes")', async () => {
      const http = new MockHttp({ get: [{ status: 200, body: APPCAST }] });
      const r = await new SparkleAppcastDetector({ url: 'https://x' }).detect(makeCtx({ http }));
      expect(r.changelog).toBe('');
    });

    it('取第一个 item 的 description (appcast 倒序, 最新在前)', async () => {
      const xml = `<rss>
  <channel>
    <item><description>latest release notes</description><enclosure sparkle:shortVersionString="3.0" /></item>
    <item><description>older release notes</description><enclosure sparkle:shortVersionString="2.0" /></item>
  </channel>
</rss>`;
      const http = new MockHttp({ get: [{ status: 200, body: xml }] });
      const r = await new SparkleAppcastDetector({ url: 'https://x' }).detect(makeCtx({ http }));
      expect(r.changelog).toBe('latest release notes');
    });
  });

  // Phase 22: release_url (sparkle <enclosure url>) 给 Bulk Upgrade 用
  describe('release_url 提取', () => {
    it('第一个 item 有 enclosure url → 透传到 release_url', async () => {
      const xml = `<?xml version="1.0"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <item>
      <enclosure url="https://example.com/Codex-3.0.dmg" sparkle:shortVersionString="3.0" />
    </item>
    <item>
      <enclosure url="https://example.com/Codex-2.9.dmg" sparkle:shortVersionString="2.9" />
    </item>
  </channel>
</rss>`;
      const http = new MockHttp({ get: [{ status: 200, body: xml }] });
      const r = await new SparkleAppcastDetector({ url: 'https://x' }).detect(makeCtx({ http }));
      expect(r.release_url).toBe('https://example.com/Codex-3.0.dmg');
    });

    it('enclosure 没有 url 属性 → release_url 空 (caller fallback 到 open app)', async () => {
      const xml = `<?xml version="1.0"?>
<rss><channel>
  <item><enclosure sparkle:shortVersionString="3.0" /></item>
</channel></rss>`;
      const http = new MockHttp({ get: [{ status: 200, body: xml }] });
      const r = await new SparkleAppcastDetector({ url: 'https://x' }).detect(makeCtx({ http }));
      expect(r.release_url).toBe('');
    });

    it('没有 enclosure 节点 → release_url 空', async () => {
      const xml = `<?xml version="1.0"?>
<rss><channel>
  <item><title>3.0</title>
    <sparkle:shortVersionString>3.0</sparkle:shortVersionString>
  </item>
</channel></rss>`;
      const http = new MockHttp({ get: [{ status: 200, body: xml }] });
      const r = await new SparkleAppcastDetector({ url: 'https://x' }).detect(makeCtx({ http }));
      expect(r.release_url).toBe('');
    });
  });
});
