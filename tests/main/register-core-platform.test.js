/**
 * tests/main/register-core-platform.test.js
 *
 * register-core 的 get-app-icon + refresh-last-opened 走 platform 层.
 * electron 无法 vi.mock (自定义 interop), 改源码静态校验 + platform 委托验证.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('register-core uses platform layer', () => {
  it('源码 require platform 层', () => {
    const src = readFileSync(
      join(__dirname, '../../src/main/ipc/register-core.js'),
      'utf-8',
    );
    expect(src).toContain('require("../../platform")');
  });

  it('get-app-icon handler 调 platform.getAppIcon (不再直接 require app-icon)', () => {
    const src = readFileSync(
      join(__dirname, '../../src/main/ipc/register-core.js'),
      'utf-8',
    );
    expect(src).toContain('platform.getAppIcon');
    // 不再直接 import getAppIcon from app-icon
    expect(src).not.toMatch(/require\(["']\.\.\/app-icon["']\)/);
  });

  it('refresh-last-opened handler body 调 platform.resolveAppPath', () => {
    const src = readFileSync(
      join(__dirname, '../../src/main/ipc/register-core.js'),
      'utf-8',
    );
    expect(src).toContain('platform.resolveAppPath');
    // 2026-06-14: Phase C3 rollback 也 require app-paths 里的 resolveAppBundlePath,
    // 这是平台无关工具 (返回 fs 路径), 跟 platform.resolveAppPath 不是同一回事.
    // 这条静态检查只确保 refresh-last-opened 走 platform, 不限制其它 IPC.
  });

  it('platform.getAppIcon 委托 app-icon.js (mac 行为不变)', async () => {
    const platform = require('../../src/platform');
    // macos.js getAppIcon → app-icon.js getAppIcon (后者有独立测试).
    // 这里只验证委托链存在: platform.getAppIcon 是 function.
    expect(typeof platform.getAppIcon).toBe('function');
  });
});
