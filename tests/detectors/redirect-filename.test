/**
 * tests/detectors/redirect-filename.test.js
 */
import { describe, it, expect } from 'vitest';
import { RedirectFilenameDetector } from '../../src/detectors/redirect-filename.js';
import { MockHttp, makeCtx } from '../helpers/mock-http.js';
import { REASONS } from '../../src/detectors/errors.js';

describe('RedirectFilenameDetector', () => {
  it('直链拿文件名版本，confidence=medium', async () => {
    const http = new MockHttp({
      head: [{ status: 200, finalUrl: 'https://cdn.example.com/Kimi-darwin-arm64-1.2.3.dmg' }],
    });
    const r = await new RedirectFilenameDetector({ url: 'https://api.example.com/kimi' }).detect(makeCtx({ http }));
    expect(r.version).toBe('1.2.3');
    expect(r.confidence).toBe('medium');
    expect(r.source).toBe('redirect_filename');
  });

  it('跟一次重定向后提取', async () => {
    const http = new MockHttp({
      head: [
        { status: 302, headers: { location: 'https://cdn.example.com/Kimi-2.0.0.dmg' } },
        { status: 200, finalUrl: 'https://cdn.example.com/Kimi-2.0.0.dmg' },
      ],
    });
    const r = await new RedirectFilenameDetector({ url: 'https://api.example.com/kimi' }).detect(makeCtx({ http }));
    expect(r.version).toBe('2.0.0');
    expect(http.headCalls).toHaveLength(2);
  });

  it('带 v 前缀', async () => {
    const http = new MockHttp({ head: [{ status: 200, finalUrl: 'https://x/app-v3.1.4.zip' }] });
    const r = await new RedirectFilenameDetector({ url: 'https://x' }).detect(makeCtx({ http }));
    expect(r.version).toBe('3.1.4');
  });

  it('文件名无版本号 → no_version', async () => {
    const http = new MockHttp({ head: [{ status: 200, finalUrl: 'https://x/release.dmg' }] });
    await expect(
      new RedirectFilenameDetector({ url: 'https://x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('4xx/5xx', async () => {
    const http4 = new MockHttp({ head: [{ status: 404, finalUrl: 'https://x' }] });
    await expect(
      new RedirectFilenameDetector({ url: 'https://x' }).detect(makeCtx({ http: http4 }))
    ).rejects.toMatchObject({ reason: REASONS.HTTP_4XX });

    const http5 = new MockHttp({ head: [{ status: 503, finalUrl: 'https://x' }] });
    await expect(
      new RedirectFilenameDetector({ url: 'https://x' }).detect(makeCtx({ http: http5 }))
    ).rejects.toMatchObject({ reason: REASONS.HTTP_5XX });
  });

  it('网络错误', async () => {
    const http = new MockHttp({ head: [{ error: 'network' }] });
    await expect(
      new RedirectFilenameDetector({ url: 'https://x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.NETWORK });
  });
});
