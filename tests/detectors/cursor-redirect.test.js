/**
 * tests/detectors/cursor-redirect.test.js
 */
import { describe, it, expect } from 'vitest';
import { CursorRedirectDetector } from '../../src/detectors/cursor-redirect.js';
import { MockHttp, makeCtx } from '../helpers/mock-http.js';
import { REASONS } from '../../src/detectors/errors.js';

describe('CursorRedirectDetector', () => {
  it('production/{hash} 路径 → 用原 URL 的 /cursor/{major} 段；confidence=low (让 brew_formulae 覆盖)', async () => {
    const http = new MockHttp({
      head: [
        {
          status: 302,
          headers: { location: 'https://cdn.example.com/production/abcdef1234567/darwin/arm64/Cursor-darwin-arm64.dmg' },
        },
        {
          status: 200,
          finalUrl: 'https://cdn.example.com/production/abcdef1234567/darwin/arm64/Cursor-darwin-arm64.dmg',
        },
      ],
    });
    const r = await new CursorRedirectDetector({
      url: 'https://api2.cursor.sh/updates/download/golden/darwin-arm64/cursor/3.6',
    }).detect(makeCtx({ http }));
    expect(r.version).toBe('3.6');
    // Phase 10: cursor API 只给 major, 不给 build. low confidence 让 chain 继续
    // 跑 brew_formulae cask API, 那个会返回 "3.6.31,hash" 完整版本.
    expect(r.confidence).toBe('low');
    expect(r.note).toContain('cursor /cursor/');
  });

  it('没有 production 段 → 从 finalUrl 文件名提取；confidence=medium', async () => {
    const http = new MockHttp({
      head: [
        { status: 302, headers: { location: 'https://cdn/Cursor-2.0.0.dmg' } },
        { status: 200, finalUrl: 'https://cdn/Cursor-2.0.0.dmg' },
      ],
    });
    const r = await new CursorRedirectDetector({ url: 'https://x' }).detect(makeCtx({ http }));
    expect(r.version).toBe('2.0.0');
    expect(r.confidence).toBe('medium');
  });

  it('什么都拿不到 → no_version', async () => {
    const http = new MockHttp({
      head: [{ status: 200, finalUrl: 'https://cdn/Cursor.dmg' }],
    });
    await expect(
      new CursorRedirectDetector({ url: 'https://x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('5xx → http_5xx', async () => {
    const http = new MockHttp({ head: [{ status: 502, finalUrl: 'https://x' }] });
    await expect(
      new CursorRedirectDetector({ url: 'https://x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.HTTP_5XX });
  });

  it('network → network', async () => {
    const http = new MockHttp({ head: [{ error: 'network' }] });
    await expect(
      new CursorRedirectDetector({ url: 'https://x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.NETWORK });
  });
});
