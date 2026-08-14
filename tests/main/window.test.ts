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
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

const windowSource = fs.readFileSync(
  path.join(__dirname, '../../src/main/window.ts'),
  'utf-8',
);

describe('window.js uses platform.getWindowOptions', () => {
  it('window.js 源码 require 了 platform 并调用 getWindowOptions', () => {
    // 验证 window.js 已改走平台层
    expect(windowSource).toContain("require('../platform/index.ts')");
    expect(windowSource).toContain('getWindowOptions');
    // 验证视觉选项不再硬编码 (已移到 platform 层)
    expect(windowSource).not.toMatch(/titleBarStyle:\s*['"]hiddenInset['"]/);
    expect(windowSource).not.toMatch(/vibrancy:\s*['"]under-window['"]/);
  });

  it('冷启动首次显示 + 普通唤醒 都不强制 maximize (Phase 9 收尾: 自适应窗口化)', () => {
    // Phase 9 收尾前: 冷启动 maximize() 强制全屏 (用户体验差)
    // Phase 9 收尾后: 用 screen.getPrimaryDisplay().workArea 70% 算默认尺寸,
    //                 居中, 不强制 maximize. 用户想全屏自己点 green 按钮.
    const readyToShowBody = windowSource.match(
      /mainWindow\.once\('ready-to-show',[\s\S]*?\n\s{4}\}\);/,
    )?.[0];
    const showWindowBody = windowSource.match(
      /function showWindow\(\) \{[\s\S]*?\n\s{2}\}/,
    )?.[0];

    expect(readyToShowBody).toBeTruthy();
    expect(showWindowBody).toBeTruthy();
    // 都不调 maximize (冷启动也不再强制)
    expect(readyToShowBody).not.toContain('.maximize()');
    expect(showWindowBody).not.toContain('.maximize()');
    // 冷启动仍然先 show 再 focus (跟旧行为一致, 只是去掉中间的 maximize)
    expect(readyToShowBody.indexOf('.show()')).toBeGreaterThan(-1);
    expect(readyToShowBody.indexOf('.show()')).toBeLessThan(
      readyToShowBody.indexOf('.focus()'),
    );
  });

  it('窗口尺寸按 primary display work area 70% 算默认 + 上下限 + 居中', () => {
    // Phase 9 收尾: 自适应窗口化 — 不再用固定 1080x780
    expect(windowSource).toMatch(/screen\.getPrimaryDisplay\(\)/);
    expect(windowSource).toMatch(/workArea/);
    // 70% 宽 75% 高 (留 25% 给 dock / 切换窗口)
    expect(windowSource).toMatch(/0\.7/);
    expect(windowSource).toMatch(/0\.75/);
    // MIN 上限 (maxWidth / maxHeight 也设了, 防止 4K 屏拖到 3000+px)
    expect(windowSource).toMatch(/minWidth:\s*MIN_W/);
    expect(windowSource).toMatch(/maxWidth:\s*MAX_W/);
    // 居中 (中点 - 一半)
    expect(windowSource).toMatch(/wa\.x\s*\+\s*\(wa\.width\s*-\s*width\)\s*\/\s*2/);
  });

  it('development 环境监听 renderer 构建产物并无缓存刷新窗口', () => {
    expect(windowSource).toContain("require('./renderer-auto-reload.ts')");
    expect(windowSource).toContain('installRendererAutoReload');
  });

  it('platform.getWindowOptions 返回的键会展开进 BrowserWindow 选项', () => {
    // 读 platform macos.js 确认它导出了 window.js 期望的视觉键
    const macos = requirePlatform('macos');
    const opts = macos.getWindowOptions();
    expect(opts).toHaveProperty('titleBarStyle');
    expect(opts).toHaveProperty('vibrancy');
    expect(opts).toHaveProperty('transparent');
    expect(opts).toHaveProperty('skipTaskbar');
  });

  it('windows platform 也导出 getWindowOptions (bootable)', () => {
    const win = requirePlatform('windows');
    const opts = win.getWindowOptions();
    expect(opts).toHaveProperty('titleBarStyle');
    expect(opts).toHaveProperty('backgroundMaterial');
    expect(opts).toHaveProperty('skipTaskbar');
  });
});
