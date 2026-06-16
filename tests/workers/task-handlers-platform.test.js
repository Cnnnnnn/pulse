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

describe('task-handlers uses platform.resolveAppPath', () => {
  it('源码 require platform 层 (不再直接 require app-paths)', () => {
    const src = readFileSync(
      join(__dirname, '../../src/workers/task-handlers.js'),
      'utf-8',
    );
    expect(src).toContain("require(\"../platform\")");
    expect(src).toContain('platform.resolveAppPath');
    // 不再直接 import resolveAppBundlePath
    expect(src).not.toContain('resolveAppBundlePath');
  });

  it('platform.resolveAppPath 委托 app-paths, mac 上行为不变', () => {
    const platform = require('../../src/platform');
    // macos 平台层委托 resolveAppBundlePath — 同样把 "Cursor.app" → "/Applications/Cursor.app"
    expect(platform.resolveAppPath('Cursor.app', {})).toBe(
      '/Applications/Cursor.app',
    );
    expect(platform.resolveAppPath(null, {})).toBeNull();
  });

  it('windows 平台层 resolveAppPath 是 stub (P2 填) → null', () => {
    const win = require('../../src/platform/windows.js');
    // 即便当前测试环境是 mac, windows.js 的 stub 行为固定
    expect(win.resolveAppPath('Cursor', { win_bundle: 'Cursor' })).toBeNull();
  });
});
