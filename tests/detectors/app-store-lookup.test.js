/**
 * tests/detectors/app-store-lookup.test.js
 */
import { describe, it, expect } from 'vitest';
import { AppStoreLookupDetector } from '../../src/detectors/app-store-lookup.js';
import { MockHttp, makeCtx } from '../helpers/mock-http.js';
import { REASONS } from '../../src/detectors/errors.js';

const LOOKUP = {
  resultCount: 1,
  results: [
    {
      trackId: 6737188438,
      trackName: 'ima.copilot',
      version: '2.1.0',
    },
  ],
};

describe('AppStoreLookupDetector', () => {
  it('取 results[0].version；清掉前导 v', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: JSON.stringify(LOOKUP) }] });
    const r = await new AppStoreLookupDetector({ url: 'https://itunes.apple.com/lookup?id=6737188438' }).detect(makeCtx({ http }));
    expect(r.version).toBe('2.1.0');
  });

  it('results 为空 → no_version', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ resultCount: 0, results: [] }) }] });
    await expect(
      new AppStoreLookupDetector({ url: 'https://x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('非 2xx → 4xx/5xx', async () => {
    const http404 = new MockHttp({ get: [{ status: 404, body: 'no' }] });
    await expect(
      new AppStoreLookupDetector({ url: 'https://x' }).detect(makeCtx({ http: http404 }))
    ).rejects.toMatchObject({ reason: REASONS.HTTP_4XX });

    const http503 = new MockHttp({ get: [{ status: 503, body: 'oops' }] });
    await expect(
      new AppStoreLookupDetector({ url: 'https://x' }).detect(makeCtx({ http: http503 }))
    ).rejects.toMatchObject({ reason: REASONS.HTTP_5XX });
  });

  it('JSON 解析失败 → parse', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: '<?xml' }] });
    await expect(
      new AppStoreLookupDetector({ url: 'https://x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.PARSE });
  });

  // Phase 21: releaseNotes 提取
  it('有 releaseNotes (HTML) → 透传, format=html', async () => {
    const body = JSON.stringify({
      resultCount: 1,
      results: [{
        trackName: 'X',
        version: '3.0.0',
        releaseNotes: '<h2>What\'s New</h2><ul><li>Fix</li></ul>',
      }],
    });
    const http = new MockHttp({ get: [{ status: 200, body }] });
    const r = await new AppStoreLookupDetector({ url: 'https://x' }).detect(makeCtx({ http }));
    expect(r.changelog).toContain('Fix');
    expect(r.changelog_format).toBe('html');
  });

  it('没 releaseNotes → changelog 空 (UI fallback 到 release_notes_url)', async () => {
    const body = JSON.stringify({
      resultCount: 1,
      results: [{ trackName: 'X', version: '1.0' }],
    });
    const http = new MockHttp({ get: [{ status: 200, body }] });
    const r = await new AppStoreLookupDetector({ url: 'https://x' }).detect(makeCtx({ http }));
    expect(r.changelog).toBe('');
  });

  it('releaseNotes 非 string (number / null) → 空', async () => {
    const body = JSON.stringify({
      resultCount: 1,
      results: [{ trackName: 'X', version: '1.0', releaseNotes: 12345 }],
    });
    const http = new MockHttp({ get: [{ status: 200, body }] });
    const r = await new AppStoreLookupDetector({ url: 'https://x' }).detect(makeCtx({ http }));
    expect(r.changelog).toBe('');
  });

  it('多个 results → 用第一个有 version 的 releaseNotes', async () => {
    const body = JSON.stringify({
      resultCount: 3,
      results: [
        { version: '', releaseNotes: 'A' },
        { version: '2.0', releaseNotes: 'B' },
        { version: '3.0', releaseNotes: 'C' },
      ],
    });
    const http = new MockHttp({ get: [{ status: 200, body }] });
    const r = await new AppStoreLookupDetector({ url: 'https://x' }).detect(makeCtx({ http }));
    expect(r.version).toBe('2.0');
    expect(r.changelog).toBe('B');
  });

  // Phase 22: trackId 提取 (Bulk Upgrade macappstore:// 深链)
  it('results[0].trackId (number) → 透传到 track_id', async () => {
    const body = JSON.stringify({
      resultCount: 1,
      results: [{ trackName: 'X', version: '1.0', trackId: 6737188438 }],
    });
    const http = new MockHttp({ get: [{ status: 200, body }] });
    const r = await new AppStoreLookupDetector({ url: 'https://x' }).detect(makeCtx({ http }));
    expect(r.track_id).toBe(6737188438);
  });

  it('results[0].trackId (string digits) → 转 number', async () => {
    const body = JSON.stringify({
      resultCount: 1,
      results: [{ trackName: 'X', version: '1.0', trackId: '6737188438' }],
    });
    const http = new MockHttp({ get: [{ status: 200, body }] });
    const r = await new AppStoreLookupDetector({ url: 'https://x' }).detect(makeCtx({ http }));
    expect(r.track_id).toBe(6737188438);
  });

  it('没 trackId → track_id=0 (bulk-upgrade-actions 会当 missing 处理)', async () => {
    const body = JSON.stringify({
      resultCount: 1,
      results: [{ trackName: 'X', version: '1.0' }],
    });
    const http = new MockHttp({ get: [{ status: 200, body }] });
    const r = await new AppStoreLookupDetector({ url: 'https://x' }).detect(makeCtx({ http }));
    expect(r.track_id).toBe(0);
  });

  it('trackId=0 / 负数 → 0', async () => {
    const body = JSON.stringify({
      resultCount: 1,
      results: [{ trackName: 'X', version: '1.0', trackId: 0 }],
    });
    const http = new MockHttp({ get: [{ status: 200, body }] });
    const r = await new AppStoreLookupDetector({ url: 'https://x' }).detect(makeCtx({ http }));
    expect(r.track_id).toBe(0);
  });

  it('trackId 非数字字符串 (e.g. "abc") → 0', async () => {
    const body = JSON.stringify({
      resultCount: 1,
      results: [{ trackName: 'X', version: '1.0', trackId: 'abc' }],
    });
    const http = new MockHttp({ get: [{ status: 200, body }] });
    const r = await new AppStoreLookupDetector({ url: 'https://x' }).detect(makeCtx({ http }));
    expect(r.track_id).toBe(0);
  });
});
