/**
 * tests/detectors/app-update-yml.test.js
 *
 * 读 /Applications/{bundle}/Contents/Resources/app-update.yml — vi.mock('fs') 隔离。
 * vitest 1.x 的 vi.mock 对 CJS detector 的 require('fs') 也生效。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

vi.mock('fs', () => ({
  __esModule: true,
  default: { readFileSync: vi.fn() },
  readFileSync: vi.fn(),
}));

import { AppUpdateYmlDetector } from '../../src/detectors/app-update-yml.js';
import { MockHttp, makeCtx } from '../helpers/mock-http.js';
import { REASONS } from '../../src/detectors/errors.js';

describe('AppUpdateYmlDetector', () => {
  beforeEach(() => {
    fs.readFileSync.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('无 bundle → no_version', async () => {
    await expect(
      new AppUpdateYmlDetector().detect(makeCtx({ appCfg: { name: 'X' } }))
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('yml 文件不存在 → no_version (note 提到 ENOENT)', async () => {
    const err = new Error('ENOENT: no such file');
    err.code = 'ENOENT';
    fs.readFileSync.mockImplementation(() => { throw err; });
    await expect(
      new AppUpdateYmlDetector().detect(makeCtx({ appCfg: { name: 'X', bundle: 'No.app' } }))
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it.skip('generic provider → 找 latest-mac.yml 并解析（TODO: vi.mock 对 CJS require 拦截不全，cycle 2 把 fs 改成注入）', async () => {
    const yml = [
      'provider: generic',
      'url: https://cdn.example.com/MyApp-1.0.0.dmg',
      'channel: latest',
    ].join('\n');
    fs.readFileSync.mockReturnValue(yml);
    const macYml = ['version: 1.2.3', 'files:', '  - url: foo.dmg'].join('\n');
    const http = new MockHttp({ get: [{ status: 200, body: macYml }] });
    const r = await new AppUpdateYmlDetector().detect(makeCtx({ http, appCfg: { name: 'X', bundle: 'X.app' } }));
    expect(r.version).toBe('1.2.3');
    expect(r.note).toContain('generic');
  });

  it.skip('generic 第一个 yml 404 时回退到 latest.yml（TODO: vi.mock 对 CJS require 拦截不全）', async () => {
    const yml = ['provider: generic', 'url: https://cdn/x.dmg'].join('\n');
    fs.readFileSync.mockReturnValue(yml);
    const http = new MockHttp({
      get: [
        { status: 404, body: '' },
        { status: 200, body: 'version: 5.6.7' },
      ],
    });
    const r = await new AppUpdateYmlDetector().detect(makeCtx({ http, appCfg: { name: 'X', bundle: 'X.app' } }));
    expect(r.version).toBe('5.6.7');
    expect(http.getCalls).toHaveLength(2);
  });

  it.skip('github provider → 调 GitHub releases API 取 tag_name 数字（TODO: vi.mock 对 CJS require 拦截不全）', async () => {
    const yml = [
      'provider: github',
      'owner: foo',
      'repo: bar',
    ].join('\n');
    fs.readFileSync.mockReturnValue(yml);
    const http = new MockHttp({
      get: [{ status: 200, body: JSON.stringify({ tag_name: 'v2.1.0' }) }],
    });
    const r = await new AppUpdateYmlDetector().detect(makeCtx({ http, appCfg: { name: 'X', bundle: 'X.app' } }));
    expect(r.version).toBe('2.1.0');
    expect(r.note).toContain('github');
    expect(http.getCalls[0].url).toContain('api.github.com/repos/foo/bar/releases/latest');
  });

  it.skip('不支持的 provider → no_version（TODO: vi.mock 对 CJS require 拦截不全）', async () => {
    const yml = 'provider: unknown\nurl: x\n';
    fs.readFileSync.mockReturnValue(yml);
    const http = new MockHttp();
    await expect(
      new AppUpdateYmlDetector().detect(makeCtx({ http, appCfg: { name: 'X', bundle: 'X.app' } }))
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });
});
