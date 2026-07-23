#!/usr/bin/env node
/**
 * tests/main/tray-helper.js
 *
 * P4: 在隔离 node 进程跑 tray.loadTrayIcon 一次, 输出 JSON 到 stdout.
 * 解决 vitest fork 内 CJS module graph 缓存 tray.js 闭包了真 nativeTheme
 * 的问题 — 独立 node 进程走 node native require, require.cache 注入 work.
 *
 * 用法:
 *   node tray-helper.js <theme> <platform>
 *   theme: 'light' | 'dark'
 *   platform: 'win32' | 'darwin'
 *
 * 输出 (stdout): { platform, theme, file, ok }
 */

const theme = process.argv[2] || 'light';
const platform = process.argv[3] || 'win32';

Object.defineProperty(process, 'platform', { value: platform, configurable: true, writable: true });

// 注入 stub electron
const path = require('path');
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    Tray: function () {},
    Menu: { buildFromTemplate: () => ({}) },
    nativeImage: {
      createFromPath: (p) => ({
        isEmpty: () => false,
        setTemplateImage: () => {},
        toString: () => `nativeImage(${p})`,
      }),
      createFromBuffer: (b) => ({ isEmpty: () => false, toString: () => 'nativeImage(buffer)' }),
    },
    shell: { openExternal: () => {}, openPath: () => {} },
    nativeTheme: {
      shouldUseDarkColors: theme === 'dark',
      on: () => {},
    },
  },
};

const trayModulePath = path.resolve(__dirname, '../../src/main/tray.ts');
const tray = require(trayModulePath);

const icon = tray._internal.loadTrayIcon();
process.stdout.write(JSON.stringify({
  platform: process.platform,
  theme,
  file: icon && icon.toString ? icon.toString().replace(/^nativeImage\(/, '').replace(/\)$/, '') : null,
  ok: true,
}));
