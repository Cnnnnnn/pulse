/**
 * src/main/ithome/share-card-renderer.js
 *
 * 离屏渲染分享卡片为 PNG。
 * createShareCardPng({ article, summary, timeoutMs? }) → Promise<Buffer>
 */
const { BrowserWindow, app, ipcMain } = require("electron");
const path = require("path");
const { mainLog } = require("../log.ts");

const DEFAULT_TIMEOUT_MS = 10000;
const WINDOW_WIDTH = 1080;
const WINDOW_HEIGHT = 1080;

// 直接打 stderr — mainLog 的 meta 拍平在某些场景会丢字段(JSON.stringify 嵌套对象 + 长字符串)
function _diag(line) {
  try {
    process.stderr.write(`[share-card-diag] ${line}\n`);
  } catch {
    /* noop */
  }
}

function _timeoutPromise(ms, message) {
  return new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

async function createShareCardPng(payload, opts = {}) {
  const { article, summary } = payload || {};
  if (!article) throw new Error("article_required");
  if (!summary || !summary.text) throw new Error("summary_required");

  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const preloadPath = path.join(app.getAppPath(), "dist", "preload.js");
  const win = new BrowserWindow({
    show: false,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    webPreferences: {
      preload: preloadPath, // 关键: contextBridge 注入 window.api.onShareData
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // contextBridge 在 sandbox 下限制更多,这里关掉
      backgroundThrottling: false, // 关键: 离屏窗口默认会节流 setTimeout / rAF,关闭保证回调跑
      zoomFactor: 1,
    },
  });

  // 渲染端通过 IPC 主动通知 ready (不依赖任何渲染端定时器)
  // 主进程创建一个 Promise,渲染端 shareCardReady 时 resolve
  let _resolveReady;
  const readyPromise = new Promise((resolve) => {
    _resolveReady = resolve;
  });
  ipcMain.on("share-card:ready", () => {
    _diag("ipc share-card:ready received");
    _resolveReady(true);
  });

  // 诊断: 监听渲染进程事件,定位具体失败点
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    mainLog.warn("[share-card] did-fail-load", { code, desc, url });
  });
  win.webContents.on("console-message", (_e, level, message, line, source) => {
    _diag(`console L${level} ${source}:${line} ${message}`);
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    mainLog.warn("[share-card] render-process-gone", { details });
  });

  try {
    const htmlPath = path.join(app.getAppPath(), "share-card.html");
    mainLog.warn("[share-card] start", {
      appPath: app.getAppPath(),
      htmlPath,
    });
    await win.loadFile(htmlPath);
    mainLog.warn("[share-card] loadFile ok");
    win.webContents.send("share-data", { article, summary });
    mainLog.warn("[share-card] sent share-data");
    _diag(
      `payload keys: article=${Object.keys(article || {}).join(",")} summary=${Object.keys(summary || {}).join(",")} abstractLen=${((summary && summary.abstract) || (summary && summary.text) || "").length}`,
    );

    // 立即探测 renderer 状态
    const probe1Raw = await win.webContents.executeJavaScript(`
      JSON.stringify({
        api: typeof window.api,
        onShareData: typeof (window.api && window.api.onShareData),
        root: !!document.getElementById("root"),
        rootHTML: ((document.getElementById("root") || {}).innerHTML || "").length,
        ready: window.__renderReady === true,
        cardEl: !!document.querySelector("[data-testid=\\"share-card\\"]"),
      })
    `);
    _diag(`probe@t+0 ${probe1Raw}`);

    // 等渲染端通过 IPC 通知 ready (主进程不轮询,靠 IPC 事件驱动)
    const ready = await Promise.race([
      readyPromise,
      _timeoutPromise(timeoutMs, "render_timeout"),
    ]);
    _diag(`share-card:ready received, ready=${!!ready}`);

    // 渲染端 ready 后,量一下真实元素高度 — 这是调试布局溢出的关键证据
    const dimsRaw = await win.webContents.executeJavaScript(`
      JSON.stringify((function() {
        function r(sel) {
          const el = document.querySelector(sel);
          if (!el) return null;
          const b = el.getBoundingClientRect();
          return { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height) };
        }
        return {
          cardH: r("[data-testid=\\"share-card\\"]"),
          meta: r(".share-card-meta"),
          title: r(".share-card-title"),
          summary: r(".share-card-summary"),
          summaryText: r(".share-card-summary-text"),
          keywords: r(".share-card-keywords"),
          field1: r(".share-card-field:nth-of-type(1)"),
          field2: r(".share-card-field:nth-of-type(2)"),
          watermark: r(".share-card-watermark"),
        };
      })())
    `);
    _diag(`dims ${dimsRaw}`);

    if (!ready) {
      // 失败时再探测一次,看 renderer 走到哪了
      const probe2Raw = await win.webContents.executeJavaScript(`
        JSON.stringify({
          api: typeof window.api,
          onShareData: typeof (window.api && window.api.onShareData),
          shareCardReady: typeof (window.api && window.api.shareCardReady),
          root: !!document.getElementById("root"),
          rootHTML: ((document.getElementById("root") || {}).innerHTML || "").length,
          cardEl: !!document.querySelector("[data-testid=\\"share-card\\"]"),
          url: location.href,
        })
      `);
      _diag(`probe@fail ${probe2Raw}`);
      throw new Error("render_timeout");
    }

    // 留一帧 paint
    await new Promise((r) => setTimeout(r, 100));

    const image = await win.webContents.capturePage();
    if (!image) throw new Error("capture_empty");
    const buf = image.toPNG();
    if (!buf || buf.length === 0) throw new Error("capture_empty");
    mainLog.warn("[share-card] capturePage ok", { bytes: buf.length });
    return buf;
  } finally {
    try {
      if (!win.isDestroyed()) win.destroy();
    } catch {
      /* ignore */
    }
    // 清理 ipcMain 监听,避免重复注册
    try {
      ipcMain.removeAllListeners("share-card:ready");
    } catch {
      /* ignore */
    }
  }
}

module.exports = { createShareCardPng };
