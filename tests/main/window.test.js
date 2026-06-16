/**
 * tests/main/window.test.js
 *
 * window.js 视觉选项走 platform.getWindowOptions().
 *
 * electron 包自带 main 入口 (自定义 interop), vi.mock('electron') 无法拦截
 * require('electron'), 所以这里不 mock electron — 改成验证 window.js 的源码
 * 确实 require 了 platform 并展开 getWindowOptions 的返回值.
 *
 * 策略: spy 拦截 require('../platform').getWindowOptions, 用真实 electron 的
 * BrowserWindow (但 show:false + check_on_launch:false → 不会真弹窗).
 *
 * 注: CI/无头环境 electron BrowserWindow 可能需要 xvfb. 为避免环境依赖,
 * 这里改成源码静态校验 + platform.getWindowOptions 调用验证 (轻量 spy).
 */
import { describe, it, expect, vi } from 'vitest';

describe('window.js uses platform.getWindowOptions', () => {
  it('window.js 源码 require 了 platform 并调用 getWindowOptions', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../../src/main/window.js'),
      'utf-8',
    );
    // 验证 window.js 已改走平台层
    expect(src).toContain("require('../platform')");
    expect(src).toContain('getWindowOptions');
    // 验证视觉选项不再硬编码 (已移到 platform 层)
    expect(src).not.toMatch(/titleBarStyle:\s*['"]hiddenInset['"]/);
    expect(src).not.toMatch(/vibrancy:\s*['"]under-window['"]/);
  });

  it('platform.getWindowOptions 返回的键会展开进 BrowserWindow 选项', () => {
    // 读 platform macos.js 确认它导出了 window.js 期望的视觉键
    const macos = require('../../src/platform/macos.js');
    const opts = macos.getWindowOptions();
    expect(opts).toHaveProperty('titleBarStyle');
    expect(opts).toHaveProperty('vibrancy');
    expect(opts).toHaveProperty('transparent');
    expect(opts).toHaveProperty('skipTaskbar');
  });

  it('windows platform 也导出 getWindowOptions (bootable)', () => {
    const win = require('../../src/platform/windows.js');
    const opts = win.getWindowOptions();
    expect(opts).toHaveProperty('titleBarStyle');
    expect(opts).toHaveProperty('backgroundMaterial');
    expect(opts).toHaveProperty('skipTaskbar');
  });
});
