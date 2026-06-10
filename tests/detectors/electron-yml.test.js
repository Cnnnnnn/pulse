/**
 * tests/detectors/electron-yml.test.js
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ElectronYmlDetector } from '../../src/detectors/electron-yml.js';
import { MockHttp, makeCtx } from '../helpers/mock-http.js';
import { REASONS } from '../../src/detectors/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QODER_FIXTURE = path.join(__dirname, '..', 'fixtures', 'qoderwork', 'electron_yml.json');

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

  // QoderWork 真实 fixture 回归: tests/fixtures/qoderwork/electron_yml.json
  // 响应里只有 version / files / path / sha512 / releaseDate — 没有 releaseNotes 字段.
  // detector 应该: 1) 解析 version=0.5.8, 2) confidence=high, source=electron_yml,
  // 3) changelog 留空 (因为没 releaseNotes). changelog 由 config.json 的 bundle_changelog:true
  // post-step 走 app-bundle-changelog.js 补, 不归 electron-yml detector 管.
  it('QoderWork 真实响应 → 0.5.8 / high / no changelog from yml', async () => {
    const fixture = JSON.parse(fs.readFileSync(QODER_FIXTURE, 'utf-8'));
    // 守护: 确保 fixture 是 2026-06-05 录的 QoderWork 真实响应 (防 mock 漂移)
    expect(fixture.app).toBe('QoderWork');
    expect(fixture.detector).toBe('electron_yml');
    expect(fixture.ok).toBe(true);
    expect(fixture.response.status).toBe(200);

    // 用 fixture.response.body 当 mock GET 响应 (真实完整 yml 字符串)
    const http = new MockHttp({ get: [{ status: 200, body: fixture.response.body }] });
    const r = await new ElectronYmlDetector({
      url: 'https://static.qoder.com.cn/qoder-work-cn/releases/latest-mac.yml',
    }).detect(makeCtx({ http }));
    expect(r.version).toBe('0.5.8');
    expect(r.source).toBe('electron_yml');
    expect(r.confidence).toBe('high');
    // yml 里没 releaseNotes 字段 → detector 不会凭空造 changelog.
    // bundle_changelog:true 的逻辑在 detect-worker.js post-step 走 app-bundle-changelog,
    // 那是另一个 detector 链路. 这里单测只管 electron-yml 自身.
    expect(r.changelog).toBe('');
    expect(r.changelog_url).toBe('');
  });
});
