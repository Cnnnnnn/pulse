/**
 * src/main/window.ts
 *
 * BrowserWindow 生命周期管理（spec §6 + 旧 main.js 的窗口逻辑）。
 * 跟旧实现行为一致：
 *   - show:false 启动，ready-to-show 时再按 check_on_launch 决定是否显示
 *   - close 拦截 → hide（macOS tray 模式）；isQuitting=true 时才真退出
 *   - 标题栏 hiddenInset + 亚克力 vibrancy
 *   - preload + contextIsolation + nodeIntegration:false
 *
 * Phase 9 收尾: 自适应窗口大小 — 按 primary display work area 70% 宽 75% 高
 * 算默认尺寸, 上下限 (MIN 720x540 / MAX 1600x1000), 居中. 不再 maximize()
 * 强制全屏 (用户反馈: 启动全屏体验不好). 用户想全屏自己点 green 按钮.
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).
import type {
  BrowserWindow as BrowserWindowInstance,
  BrowserWindowConstructorOptions,
} from "electron";
import type * as pathType from "node:path";

type ElectronBrowserWindowCtor = typeof import("electron").BrowserWindow;

type PlatformModule = {
  getWindowOptions: () => BrowserWindowConstructorOptions;
};

type CreateWindowManagerOpts = {
  preloadPath?: string;
  indexPath?: string;
  config?: { check_on_launch?: boolean };
  onClosed?: () => void;
  getIsQuitting?: () => boolean;
};

type WindowManager = {
  createWindow: () => BrowserWindowInstance;
  showWindow: () => void;
  getWindow: () => BrowserWindowInstance | null;
  isOpen: () => boolean;
};

const { BrowserWindow }: { BrowserWindow: ElectronBrowserWindowCtor } = require('electron');
const path: typeof pathType = require('path');
const platform: PlatformModule = require('../platform/index.ts');

/**
 * @param {object} opts
 * @param {string} [opts.preloadPath]  默认 __dirname/../../dist/preload.js
 * @param {string} [opts.indexPath]    默认项目根 index.html
 * @param {object} [opts.config]       { check_on_launch }
 * @param {Function} [opts.onClosed]   window closed 回调
 * @param {Function} [opts.getIsQuitting]
 */
export function createWindowManager(opts: CreateWindowManagerOpts = {}): WindowManager {
  const preloadPath = opts.preloadPath || path.join(__dirname, "..", "..", "dist", "preload.js");
  const indexPath = opts.indexPath || path.join(__dirname, '..', '..', 'index.html');
  const config = opts.config || { check_on_launch: true };
  const getIsQuitting = opts.getIsQuitting || (() => false);
  const onClosed = opts.onClosed || (() => {});

  let mainWindow: BrowserWindowInstance | null = null;

  function createWindow() {
    // Phase 9 收尾: 自适应窗口大小 — 按 primary display work area 70% 算默认尺寸,
    // 上下限, 居中. 不再 maximize() 强制全屏 (用户反馈: 启动全屏体验不好).
    // 小屏 (≤1280) 走 70% 完整适配, 大屏 (4K) 走 maxWidth 1600 上限.
    const { screen } = require('electron');
    const display = screen.getPrimaryDisplay();
    const wa = display.workArea; // 去掉 dock / taskbar 的可用区域
    const MIN_W = 720, MIN_H = 540;
    const MAX_W = 1600, MAX_H = 1000;
    const TARGET_W_RATIO = 0.7; // 70% 宽
    const TARGET_H_RATIO = 0.75; // 75% 高 (留 25% 给 dock + 用户切换窗口)
    const width  = Math.max(MIN_W, Math.min(MAX_W, Math.floor(wa.width  * TARGET_W_RATIO)));
    const height = Math.max(MIN_H, Math.min(MAX_H, Math.floor(wa.height * TARGET_H_RATIO)));
    // 居中: 屏幕中点 - 窗口一半
    const x = Math.floor(wa.x + (wa.width  - width)  / 2);
    const y = Math.floor(wa.y + (wa.height - height) / 2);

    mainWindow = new BrowserWindow({
      width,
      height,
      minWidth: MIN_W,
      minHeight: MIN_H,
      // 上限防止拖到离谱大小 (4K 屏上用户能拖出 3000+px 没意义)
      maxWidth: MAX_W,
      maxHeight: MAX_H,
      x,
      y,
      show: false,
      // Phase 28: 显式设 title, 防止 Electron 默认 "Electron" / 老 install 残留
      title: 'Pulse',
      resizable: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
      // 视觉选项走平台层 (mac: vibrancy + hiddenInset; win: acrylic + hidden)
      // 展开在末尾, 让 platform 返回值覆盖上面的同名字段 (如果有).
      ...platform.getWindowOptions(),
    });

    // 双保险: index.html <title> 也设了, 但 BrowserWindow 显式 title 优先生效
    mainWindow.loadFile(indexPath);
    // 页面加载完后再设一次, 防止 did-finish-load 之前 macOS 拿默认值
    mainWindow.webContents.on('did-finish-load', () => {
      try { mainWindow?.setTitle('Pulse'); } catch { /* noop */ }
      // Phase Q4 v1: 启动时间埋点 — renderer 完整加载完 (preload + bundle + dom).
      // best-effort: diagnostics 失败不影响主流程.
      try {
        const { markRendererReady } = require('./diagnostics.ts');
        markRendererReady();
      } catch { /* noop */ }
    });

    // Phase B7e.4: 抓 renderer console + crash, 写到 mainLog 方便排查.
    // 否则 renderer 静默挂掉时用户只看到空白屏, 没线索.
    try {
      const { mainLog } = require('./log.ts');
      mainWindow.webContents.on('console-message', (event: any) => {
        try {
          const msg = event && event.message ? String(event.message) : '';
          if (msg) mainLog.warn(`[renderer:console] ${msg}`);
        } catch { /* noop */ }
      });
      mainWindow.webContents.on('render-process-gone', (_event: any, details: any) => {
        try {
          mainLog.warn(`[renderer:gone] reason=${details && details.reason} exitCode=${details && details.exitCode}`);
        } catch { /* noop */ }
      });
      mainWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
        try { mainLog.warn(`[renderer:fail-load] code=${code} desc=${desc} url=${url}`); } catch { /* noop */ }
      });
    } catch { /* noop */ }

    mainWindow.once('ready-to-show', () => {
      const win = mainWindow;
      if (!win) return;
      if (config.check_on_launch) {
        // 不再 maximize() — 保持窗口创建时设的合理大小 + 居中.
        // 用户想全屏可以自己点 green 按钮, 默认窗口化更友好.
        win.show();
        win.focus();
      }
      // 冷启动基准钩子 (scripts/startup-bench.js): BENCH=1 时打一行标记
      // 让外部 bench 进程能在 stdout 看到 "ready-to-show" 触发点
      if (process.env.BENCH === '1') {
        process.stdout.write('BENCH_VISIBLE\n');
      }
    });

    mainWindow.on('close', (e: any) => {
      if (!getIsQuitting()) {
        e.preventDefault();
        mainWindow?.hide();
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
      try { onClosed(); } catch { /* noop */ }
    });

    return mainWindow;
  }

  function showWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
    }
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    if (process.platform === 'darwin') {
      try { win.moveTop(); } catch { /* noop */ }
    }
  }

  function getWindow() {
    return mainWindow;
  }

  function isOpen() {
    return mainWindow != null && !mainWindow.isDestroyed();
  }

  return { createWindow, showWindow, getWindow, isOpen };
}

module.exports = { createWindowManager };