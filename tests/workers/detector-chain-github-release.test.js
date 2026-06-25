/**
 * tests/workers/detector-chain-github-release.test.js
 *
 * GitHub Releases detector 端到端接入 detector-chain.
 * 跟 detector-chain-circuit-breaker.test.js 同一范式 (vitest 1.6 vi.mock
 * 不 hook CJS require, 必须 require.cache 注入).
 *
 * 验证:
 *   1. makeDetector({ type: 'github_release', url }) → 实例化成功
 *   2. runDetectorChain 跑完拿到 high confidence, version 跟 GitHub API 一致
 *   3. multi-detector chain 里 github_release 在前一个 fail 后 fallback 命中
 *   4. github_release 4xx → DetectorError 抛, chain 继续 fallback
 *   5. tag 无 v 前缀也正确提取
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { MockHttp } from '../helpers/mock-http.js';
const require = createRequire(import.meta.url);

const cbStoragePath = require.resolve(
  '../../src/detectors/circuit-breaker-storage.js',
);
const cbPath = require.resolve('../../src/detectors/circuit-breaker.js');
const chainPath = require.resolve(
  '../../src/workers/detector-chain.js',
);

const mockLoadBreakers = vi.fn();
const mockUpsertBreaker = vi.fn();
const mockShouldAllow = vi.fn();
const mockTransitionAfterProbe = vi.fn();
const mockRecordSuccess = vi.fn();
const mockRecordFailure = vi.fn();
const mockCreateBreaker = vi.fn();
const mockHydrate = vi.fn();

function reloadChain() {
  delete require.cache[chainPath];
  require.cache[cbStoragePath] = {
    id: cbStoragePath,
    filename: cbStoragePath,
    loaded: true,
    exports: {
      loadBreakers: mockLoadBreakers,
      upsertBreaker: mockUpsertBreaker,
      hydrate: mockHydrate,
      saveBreakers: vi.fn(),
      getBreaker: vi.fn(),
      removeBreaker: vi.fn(),
      snapshot: (b) => {
        const { _now, ...rest } = b;
        return rest;
      },
    },
  };
  require.cache[cbPath] = {
    id: cbPath,
    filename: cbPath,
    loaded: true,
    exports: {
      STATE: { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half_open' },
      DEFAULTS: { failureThreshold: 3, cooldownMs: 300000 },
      createBreaker: mockCreateBreaker,
      shouldAllow: mockShouldAllow,
      transitionAfterProbe: mockTransitionAfterProbe,
      recordSuccess: mockRecordSuccess,
      recordFailure: mockRecordFailure,
    },
  };
  return require(chainPath);
}

beforeEach(() => {
  mockLoadBreakers.mockReset();
  mockUpsertBreaker.mockReset();
  mockShouldAllow.mockReset();
  mockTransitionAfterProbe.mockReset();
  mockRecordSuccess.mockReset();
  mockRecordFailure.mockReset();
  mockCreateBreaker.mockReset();
  mockHydrate.mockReset();

  mockLoadBreakers.mockResolvedValue({});
  mockShouldAllow.mockReturnValue(true);
  mockTransitionAfterProbe.mockImplementation((b) => b);
  mockRecordSuccess.mockImplementation((b) => ({ ...b, state: 'closed' }));
  mockRecordFailure.mockImplementation((b) => ({ ...b, state: 'open' }));
  mockCreateBreaker.mockImplementation(({ key }) => ({
    key,
    state: 'closed',
    config: {},
    _now: () => Date.now(),
  }));
  mockHydrate.mockImplementation((s) => ({ ...s, _now: () => Date.now() }));
});

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('detector-chain: github_release 接入', () => {
  it('makeDetector({ type: "github_release" }) 实例化成功', () => {
    const { makeDetector } = reloadChain();
    const det = makeDetector({
      type: 'github_release',
      url: 'https://api.github.com/repos/owner/repo/releases/latest',
    });
    expect(det).not.toBeNull();
    expect(typeof det.detect).toBe('function');
    // static name = 'github_release' 覆盖了 class 名
    expect(det.constructor.name).toBe('github_release');
  });

  it('runDetectorChain 跑 github_release detector, version = tag_name 去 v 前缀', async () => {
    const { runDetectorChain } = reloadChain();
    const http = new MockHttp({
      get: [
        {
          status: 200,
          body: JSON.stringify({
            tag_name: 'v2.5.0',
            name: 'Release 2.5.0',
            html_url: 'https://github.com/owner/myapp/releases/tag/v2.5.0',
            body: '## Changes\n- New feature',
          }),
        },
      ],
    });
    const appCfg = {
      name: 'MyApp',
      bundle: 'MyApp.app',
      detectors: [
        {
          type: 'github_release',
          url: 'https://api.github.com/repos/owner/myapp/releases/latest',
        },
      ],
    };
    const r = await runDetectorChain(appCfg, {
      arch: 'arm64',
      http,
      logger,
      platform: 'darwin',
    });
    expect(r.result).not.toBeNull();
    expect(r.result.version).toBe('2.5.0');
    expect(r.result.confidence).toBe('high');
    expect(r.result.source).toBe('github_release');
    expect(r.result.changelog).toContain('New feature');
    // P53: html_url 透传到 release_url (ChangelogPanel ↗ 按钮用)
    expect(r.result.release_url).toBe(
      'https://github.com/owner/myapp/releases/tag/v2.5.0',
    );
    expect(http.getCalls).toHaveLength(1);
    expect(http.getCalls[0].url).toBe(
      'https://api.github.com/repos/owner/myapp/releases/latest',
    );
    expect(http.getCalls[0].opts.headers['User-Agent']).toBe('Pulse');
    expect(http.getCalls[0].opts.headers['Accept']).toBe(
      'application/vnd.github+json',
    );
  });

  it('multi-detector chain: brew_formulae fail → github_release fallback 命中', async () => {
    const { runDetectorChain } = reloadChain();
    const http = new MockHttp({
      get: [
        { error: 'network' }, // brew_formulae 网络失败
        { status: 200, body: JSON.stringify({ tag_name: 'v3.7.12' }) }, // github_release OK
      ],
    });
    const appCfg = {
      name: 'Multi',
      bundle: 'Multi.app',
      detectors: [
        { type: 'brew_formulae', cask: 'multi' },
        {
          type: 'github_release',
          url: 'https://api.github.com/repos/owner/multi/releases/latest',
        },
      ],
    };
    const r = await runDetectorChain(appCfg, {
      arch: 'arm64',
      http,
      logger,
      platform: 'darwin',
    });
    expect(r.result).not.toBeNull();
    expect(r.result.version).toBe('3.7.12');
    expect(r.result.source).toBe('github_release');
  });

  it('github_release 4xx → DetectorError 抛, chain 继续 fallback', async () => {
    const { runDetectorChain } = reloadChain();
    const http = new MockHttp({
      get: [
        { status: 403, body: 'rate limit exceeded' }, // github_release 失败
        { status: 200, body: JSON.stringify({ version: '4.0.0' }) }, // api_json 兜底
      ],
    });
    const appCfg = {
      name: 'Fallback',
      bundle: 'Fallback.app',
      detectors: [
        {
          type: 'github_release',
          url: 'https://api.github.com/repos/owner/fallback/releases/latest',
        },
        { type: 'api_json', url: 'https://example.com/version.json' },
      ],
    };
    const r = await runDetectorChain(appCfg, {
      arch: 'arm64',
      http,
      logger,
      platform: 'darwin',
    });
    expect(r.result).not.toBeNull();
    expect(r.result.version).toBe('4.0.0');
    expect(r.result.source).toBe('api_json');
  });

  it('github_release tag 无 v 前缀也正确提取', async () => {
    const { runDetectorChain } = reloadChain();
    const http = new MockHttp({
      get: [{ status: 200, body: JSON.stringify({ tag_name: '1.2.3' }) }],
    });
    const appCfg = {
      name: 'NoPrefix',
      bundle: 'NoPrefix.app',
      detectors: [
        {
          type: 'github_release',
          url: 'https://api.github.com/repos/owner/noprefix/releases/latest',
        },
      ],
    };
    const r = await runDetectorChain(appCfg, {
      arch: 'arm64',
      http,
      logger,
      platform: 'darwin',
    });
    expect(r.result.version).toBe('1.2.3');
  });
});
