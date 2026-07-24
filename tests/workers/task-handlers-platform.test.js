/**
 * tests/workers/task-handlers-platform.test.js
 *
 * handleDetectApp 用 platform.resolveAppPath 判断 app 是否安装.
 *
 * 验证方式:
 *   1) 源码静态校验 — task-handlers.js require 了 platform, 不再直接 require app-paths
 *   2) 行为校验 — mac 上 platform.resolveAppPath("Cursor.app") = "/Applications/Cursor.app"
 *      跟旧 resolveAppBundlePath 结果一致 (委托同名函数)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

describe('task-handlers uses platform.resolveAppPath', () => {
  it('源码 require platform 层 (不再直接 require app-paths)', () => {
    const src = readFileSync(
      join(__dirname, '../../src/workers/task-handlers.js'),
      'utf-8',
    );
    expect(src).toContain('require("../platform/index.js")');
    expect(src).toContain('platform.resolveAppPath');
    // 不再直接 import resolveAppBundlePath
    expect(src).not.toContain('resolveAppBundlePath');
  });

  it('platform.resolveAppPath 委托 app-paths, mac 上行为不变', () => {
    // 调 macos.js 直接, 避免 index.js 跑 process.platform switch (CI 是 linux
    // 会走 windows 分支, 行为不一样)
    const macos = requirePlatform('macos');
    expect(macos.resolveAppPath('Cursor.app', {})).toBe(
      '/Applications/Cursor.app',
    );
    expect(macos.resolveAppPath(null, {})).toBeNull();
  });

  it('windows 平台层 resolveAppPath (P2 实现) 返回 win_bundle 标记', () => {
    const win = requirePlatform('windows');
    // P2: resolveAppPath 返回 win_bundle 作为存在性标记 (非 null)
    expect(win.resolveAppPath(null, { win_bundle: 'Cursor' })).toBe('Cursor');
    expect(win.resolveAppPath(null, {})).toBeNull();
  });
});
