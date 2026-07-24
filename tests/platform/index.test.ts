/**
 * tests/platform/index.test.js
 *
 * Platform entry router: index.js 按 process.platform 选实现.
 * 测试用 require.cache 注入 mock 实现, 不依赖真实平台.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

describe('platform/index router', () => {
  const originalPlatform = process.platform;
  const indexResolved = () => {
    try {
      return platformArtifactPath('index');
    } catch {
      return null;
    }
  };
  const indexCjsPath = path.resolve(__dirname, '../../dist-test/platform/index.cjs');

  function bustIndexCache() {
    const key = indexResolved();
    if (key) delete require.cache[key];
    delete require.cache[indexCjsPath];
  }

  beforeEach(() => {
    // 清掉 platform 模块缓存, 让每次 require 重新走 router
    bustIndexCache();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    bustIndexCache();
  });

  it('darwin → 导出 macos 实现 (有 6 个方法)', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    });
    const platform = requirePlatform('index');
    expect(typeof platform.resolveAppPath).toBe('function');
    expect(typeof platform.getInstalledVersion).toBe('function');
    expect(typeof platform.getAppIcon).toBe('function');
    expect(typeof platform.getUpgradeAction).toBe('function');
    expect(typeof platform.execUpgrade).toBe('function');
    expect(typeof platform.getWindowOptions).toBe('function');
  });

  it('win32 → 导出 windows 实现 (有 6 个方法, P1 是 stub)', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });
    const platform = requirePlatform('index');
    expect(typeof platform.resolveAppPath).toBe('function');
    expect(typeof platform.getInstalledVersion).toBe('function');
    expect(typeof platform.getAppIcon).toBe('function');
    expect(typeof platform.getUpgradeAction).toBe('function');
    expect(typeof platform.execUpgrade).toBe('function');
    expect(typeof platform.getWindowOptions).toBe('function');
  });

  it('未知平台 → 回退到默认 stub (不崩)', () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    });
    const platform = requirePlatform('index');
    expect(typeof platform.resolveAppPath).toBe('function');
  });
});
