/**
 * tests/detectors/electron-yml.test.js
 */
import { describe, it, expect } from 'vitest';
import { ElectronYmlDetector } from '../../src/detectors/electron-yml.js';
import { MockHttp, makeCtx } from '../helpers/mock-http.js';
import { REASONS } from '../../src/detectors/errors.js';

const YML = [
  'version: 1.2.3',
  'files:',
  '  - url: MiniMax-Code-1.2.3-arm64.dmg',
  '    sha512: abc',
  '  - url: MiniMax-Code-1.2.3.dmg',
  '    sha512: def',
  'path: /updates',
  'sha512: def',
  'releaseDate: 2026-06-01',
].join('\n');

describe('ElectronYmlDetector', () => {
  it('js-yaml 解析取 version', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: YML }] });
    const r = await new ElectronYmlDetector({ url: 'https://x/latest-mac.yml' }).detect(makeCtx({ http }));
    expect(r.version).toBe('1.2.3');
    expect(r.source).toBe('electron_yml');
    expect(r.confidence).toBe('high');
  });

  it('5xx → http_5xx', async () => {
    const http = new MockHttp({ get: [{ status: 502, body: 'bad gateway' }] });
    await expect(
      new ElectronYmlDetector({ url: 'https://x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.HTTP_5XX });
  });

  it('网络错误 → network', async () => {
    const http = new MockHttp({ get: [{ error: 'network' }] });
    await expect(
      new ElectronYmlDetector({ url: 'https://x' }).detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.NETWORK });
  });

  it('未配置 url → no_version', async () => {
    const http = new MockHttp();
    await expect(
      new ElectronYmlDetector().detect(makeCtx({ http }))
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  // Phase 14: releaseNotes 提取
  it('提取 releaseNotes (electron-builder 1.x 格式)', async () => {
    const ymlWithNotes = [
      'version: 2.0.0',
      'releaseDate: 2026-06-05',
      'releaseNotes: |',
      '  ## What\'s New',
      '  - Fix bug X',
      '  - Add feature Y',
      '  ⚠️ Breaking: removed legacy Z',
      'path: /updates',
    ].join('\n');
    const http = new MockHttp({ get: [{ status: 200, body: ymlWithNotes }] });
    const r = await new ElectronYmlDetector({ url: 'https://x' }).detect(makeCtx({ http }));
    expect(r.version).toBe('2.0.0');
    expect(r.changelog).toContain("What's New");
    expect(r.changelog).toContain('Breaking');
  });

  it('没有 releaseNotes → changelog 空串', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: YML }] });
    const r = await new ElectronYmlDetector({ url: 'https://x' }).detect(makeCtx({ http }));
    expect(r.changelog).toBe('');
  });
});
