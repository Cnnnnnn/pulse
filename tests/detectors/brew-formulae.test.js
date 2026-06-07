/**
 * tests/detectors/brew-formulae.test.js
 */
import { describe, it, expect } from 'vitest';
import { BrewFormulaeDetector } from '../../src/detectors/brew-formulae.js';
import { MockHttp, makeCtx } from '../helpers/mock-http.js';
import { REASONS } from '../../src/detectors/errors.js';

describe('BrewFormulaeDetector', () => {
  it('提取 version 字段；清理 "3.6.31,abc123" 类带 commit 的版本', async () => {
    const http = new MockHttp({
      get: [{ status: 200, body: JSON.stringify({ version: '3.6.31,81fcf293abcdef' }) }],
    });
    const r = await new BrewFormulaeDetector({ cask: 'cursor' }).detect(makeCtx({ http }));
    expect(r.version).toBe('3.6.31');
    expect(r.source).toBe('brew_formulae');
    expect(r.confidence).toBe('high');
    expect(http.getCalls[0].url).toContain('https://formulae.brew.sh/api/cask/cursor.json');
  });

  it('4xx → http_4xx', async () => {
    const http = new MockHttp({ get: [{ status: 404, body: 'not found' }] });
    await expect(
      new BrewFormulaeDetector({ cask: 'nosuch' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.HTTP_4XX, httpStatus: 404 });
  });

  it('5xx → http_5xx', async () => {
    const http = new MockHttp({ get: [{ status: 503, body: 'oops' }] });
    await expect(
      new BrewFormulaeDetector({ cask: 'x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.HTTP_5XX });
  });

  it('JSON 解析失败 → parse', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: 'not-json' }] });
    await expect(
      new BrewFormulaeDetector({ cask: 'x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.PARSE });
  });

  it('version 为空 → no_version', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: JSON.stringify({ version: '' }) }] });
    await expect(
      new BrewFormulaeDetector({ cask: 'x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('网络错误 → network', async () => {
    const http = new MockHttp({ get: [{ error: 'network' }] });
    await expect(
      new BrewFormulaeDetector({ cask: 'x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.NETWORK });
  });

  it('未配置 cask → no_version', async () => {
    const http = new MockHttp();
    await expect(
      new BrewFormulaeDetector().detect(makeCtx({ http, appCfg: { name: 'X', bundle: 'X.app' } }))
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION, note: expect.stringContaining('no cask') });
  });
});
