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
      width: 780,
      height: 620,
      minWidth: 560,
      minHeight: 400,
      show: false,
      titleBarStyle: 'hiddenInset',
      vibrancy: 'under-window',
      visualEffectState: 'active',
      transparent: true,
      resizable: true,
      skipTaskbar: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    mainWindow.loadFile(indexPath);

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
