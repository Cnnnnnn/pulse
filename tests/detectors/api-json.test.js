/**
 * tests/detectors/api-json.test.js
 */
import { describe, it, expect } from 'vitest';
import { ApiJsonDetector } from '../../src/detectors/api-json.js';
import { MockHttp, makeCtx } from '../helpers/mock-http.js';
import { REASONS } from '../../src/detectors/errors.js';

describe('ApiJsonDetector', () => {
  it('取顶层 version', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ version: '2.5.0' }) }] });
    const r = await new ApiJsonDetector({ url: 'https://x/api' }).detect(makeCtx({ http }));
    expect(r.version).toBe('2.5.0');
    expect(r.confidence).toBe('high');
    expect(r.note).toContain('api_json');
  });

  it('回退 productVersion / latest_version', async () => {
    const http1 = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ productVersion: '3.0' }) }] });
    expect((await new ApiJsonDetector({ url: 'x' }).detect(makeCtx({ http: http1 }))).version).toBe('3.0');

    const http2 = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ latest_version: '4.1' }) }] });
    expect((await new ApiJsonDetector({ url: 'x' }).detect(makeCtx({ http: http2 }))).version).toBe('4.1');
  });

  it('指定 field 走路径', async () => {
    const body = JSON.stringify({ data: { version: { name: '9.9' } } });
    const http = new MockHttp({ get: [{ status: 200, body }] });
    const r = await new ApiJsonDetector({ url: 'x', field: 'data.version.name' }).detect(makeCtx({ http }));
    expect(r.version).toBe('9.9');
    expect(r.note).toContain('data.version.name');
  });

  it('全部字段为空 → no_version', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ foo: 1 }) }] });
    await expect(
      new ApiJsonDetector({ url: 'x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('HTTP 4xx/5xx/timeout/network', async () => {
    const tests = [
      { r: { status: 401 }, reason: REASONS.HTTP_4XX },
      { r: { status: 500 }, reason: REASONS.HTTP_5XX },
      { r: { error: 'timeout' }, reason: REASONS.TIMEOUT },
      { r: { error: 'network' }, reason: REASONS.NETWORK },
    ];
    for (const t of tests) {
      const http = new MockHttp({ get: [t.r] });
      await expect(
        new ApiJsonDetector({ url: 'x' }).detect(makeCtx({ http }))
      ).rejects.toMatchObject({ reason: t.reason });
    }
  });

  // Phase 8: WorkBuddy API returns "5.0.2.29916712" (semver + CI build counter).
  // Heuristic: 4 segments + last segment ≥ 1000 → strip last segment.
  describe('Phase 8: stripBuildNumber (4-seg + large last = CI build counter)', () => {
    it('4 段末段 ≥ 1000 → 剥掉末段', async () => {
      const http = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ version: '5.0.2.29916712' }) }] });
      const r = await new ApiJsonDetector({ url: 'x' }).detect(makeCtx({ http }));
      expect(r.version).toBe('5.0.2');
    });

    it('3 段 → 不动', async () => {
      const http = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ version: '1.0.10051' }) }] });
      const r = await new ApiJsonDetector({ url: 'x' }).detect(makeCtx({ http }));
      expect(r.version).toBe('1.0.10051');
    });

    it('4 段末段 < 1000 → 不动 (看着像真实 semver)', async () => {
      const http = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ version: '1.0.0.5' }) }] });
      const r = await new ApiJsonDetector({ url: 'x' }).detect(makeCtx({ http }));
      expect(r.version).toBe('1.0.0.5');
    });

    it('2 段 → 不动', async () => {
      const http = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ version: '3.0' }) }] });
      const r = await new ApiJsonDetector({ url: 'x' }).detect(makeCtx({ http }));
      expect(r.version).toBe('3.0');
    });

    it('5 段末段 ≥ 1000 → 剥掉末段 (保守: 只剥一段)', async () => {
      const http = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ version: '1.2.3.4.5000' }) }] });
      const r = await new ApiJsonDetector({ url: 'x' }).detect(makeCtx({ http }));
      expect(r.version).toBe('1.2.3.4');
    });
  });

  // Phase 14: changelog 提取 (GitHub releases API / 通用 releaseNotes)
  describe('Phase 14: changelog 提取', () => {
    it('GitHub releases API: 顶层 body + html_url', async () => {
      const body = JSON.stringify({
        tag_name: 'v3.0.0',
        body: '## What\'s New\n- New feature',
        html_url: 'https://github.com/foo/bar/releases/tag/v3.0.0',
      });
      const http = new MockHttp({ get: [{ status: 200, body }] });
      const r = await new ApiJsonDetector({ url: 'x' }).detect(makeCtx({ http }));
      expect(r.changelog).toContain("What's New");
      expect(r.changelog_url).toBe('https://github.com/foo/bar/releases/tag/v3.0.0');
    });

    it('顶层 releaseNotes / release_notes / changelog 字段', async () => {
      const http1 = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ version: '1.0', releaseNotes: 'note1' }) }] });
      expect((await new ApiJsonDetector({ url: 'x' }).detect(makeCtx({ http: http1 }))).changelog).toBe('note1');

      const http2 = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ version: '1.0', release_notes: 'note2' }) }] });
      expect((await new ApiJsonDetector({ url: 'x' }).detect(makeCtx({ http: http2 }))).changelog).toBe('note2');

      const http3 = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ version: '1.0', changelog: 'note3' }) }] });
      expect((await new ApiJsonDetector({ url: 'x' }).detect(makeCtx({ http: http3 }))).changelog).toBe('note3');
    });

    it('嵌套 data.body', async () => {
      const http = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ data: { version: '1.0', body: 'nested note' } }) }] });
      const r = await new ApiJsonDetector({ url: 'x' }).detect(makeCtx({ http }));
      expect(r.changelog).toBe('nested note');
    });

    it('没有 changelog 字段 → 空串', async () => {
      const http = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ version: '1.0' }) }] });
      const r = await new ApiJsonDetector({ url: 'x' }).detect(makeCtx({ http }));
      expect(r.changelog).toBe('');
      expect(r.changelog_url).toBe('');
    });
  });
});
