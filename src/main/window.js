/**
 * src/main/window.js
 *
 * BrowserWindow 生命周期管理（spec §6 + 旧 main.js 的窗口逻辑）。
 * 跟旧实现行为一致：
 *   - show:false 启动，ready-to-show 时再按 check_on_launch 决定是否显示
 *   - close 拦截 → hide（macOS tray 模式）；isQuitting=true 时才真退出
 *   - 标题栏 hiddenInset + 亚克力 vibrancy
 *   - preload + contextIsolation + nodeIntegration:false
 */

const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * @param {object} opts
 * @param {string} [opts.preloadPath]  默认 __dirname/../preload.js
 * @param {string} [opts.indexPath]    默认项目根 index.html
 * @param {object} [opts.config]       { check_on_launch }
 * @param {Function} [opts.onClosed]   window closed 回调
 * @param {Function} [opts.getIsQuitting]
 */
function createWindowManager(opts = {}) {
  const preloadPath = opts.preloadPath || path.join(__dirname, '..', '..', 'preload.js');
  const indexPath = opts.indexPath || path.join(__dirname, '..', '..', 'index.html');
  const config = opts.config || { check_on_launch: true };
  const getIsQuitting = opts.getIsQuitting || (() => false);
  const onClosed = opts.onClosed || (() => {});

  let mainWindow = null;

  function createWindow() {
    mainWindow = new BrowserWindow({
      // Phase B7e: 默认加大 (1080x780), 给 digest drawer (460px) + main 列表留足空间.
      width: 1080,
      height: 780,
      minWidth: 720,
      minHeight: 540,
      show: false,
      // Phase 28: 显式设 title, 防止 Electron 默认 "Electron" / 老 install 残留
      title: 'Pulse',
      titleBarStyle: 'hiddenInset',
      vibrancy: 'under-window',
      visualEffectState: 'active',
      transparent: true,
      resizable: true,
      // Phase B7e: 让 Pulse 出现在 Dock + Cmd+Tab 列表 (之前 skipTaskbar=true 隐藏).
      // 用户明确反馈想用 Cmd+Tab 切换.
      skipTaskbar: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // 双保险: index.html <title> 也设了, 但 BrowserWindow 显式 title 优先生效
    mainWindow.loadFile(indexPath);
    // 页面加载完后再设一次, 防止 did-finish-load 之前 macOS 拿默认值
    mainWindow.webContents.on('did-finish-load', () => {
      try { mainWindow.setTitle('Pulse'); } catch { /* noop */ }
    });

    // Phase B7e.4: 抓 renderer console + crash, 写到 mainLog 方便排查.
    // 否则 renderer 静默挂掉时用户只看到空白屏, 没线索.
    try {
      const { mainLog } = require('./log');
      mainWindow.webContents.on('console-message', (event) => {
        try {
          const msg = event && event.message ? String(event.message) : '';
          if (msg) mainLog.warn(`[renderer:console] ${msg}`);
        } catch { /* noop */ }
      });
      mainWindow.webContents.on('render-process-gone', (_event, details) => {
        try {
          mainLog.warn(`[renderer:gone] reason=${details && details.reason} exitCode=${details && details.exitCode}`);
        } catch { /* noop */ }
      });
      mainWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
        try { mainLog.warn(`[renderer:fail-load] code=${code} desc=${desc} url=${url}`); } catch { /* noop */ }
      });
    } catch { /* noop */ }

    mainWindow.once('ready-to-show', () => {
      if (config.check_on_launch) {
        mainWindow.show();
        mainWindow.focus();
      }
      // 冷启动基准钩子 (scripts/startup-bench.js): BENCH=1 时打一行标记
      // 让外部 bench 进程能在 stdout 看到 "ready-to-show" 触发点
      if (process.env.BENCH === '1') {
        process.stdout.write('BENCH_VISIBLE\n');
      }
    });

    mainWindow.on('close', (e) => {
      if (!getIsQuitting()) {
        e.preventDefault();
        mainWindow.hide();
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
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (process.platform === 'darwin') {
      try { mainWindow.moveTop(); } catch { /* noop */ }
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
