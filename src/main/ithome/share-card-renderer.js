/**
 * src/main/ithome/share-card-renderer.js
 *
 * 离屏渲染分享卡片为 PNG。
 * createShareCardPng({ article, summary, timeoutMs? }) → Promise<Buffer>
 */
const { BrowserWindow, app } = require("electron");
const path = require("path");
const { mainLog } = require("../log");

const DEFAULT_TIMEOUT_MS = 10000;
const WINDOW_WIDTH = 1080;
const WINDOW_HEIGHT = 1080;

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
  const preloadPath = path.join(app.getAppPath(), "preload.js");
  const win = new BrowserWindow({
    show: false,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    webPreferences: {
      preload: preloadPath, // 关键: contextBridge 注入 window.api.onShareData
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // contextBridge 在 sandbox 下限制更多,这里关掉
      zoomFactor: 1,
    },
  });

  // 诊断: 监听渲染进程事件,定位具体失败点
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    mainLog.warn("[share-card] did-fail-load", { code, desc, url });
  });
  win.webContents.on("console-message", (_e, level, message, line, source) => {
    mainLog.warn("[share-card] console", { level, message, line, source });
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

    // 立即探测 renderer 状态
    const probe1 = await win.webContents.executeJavaScript(`
      JSON.stringify({
        api: typeof window.api,
        onShareData: typeof (window.api && window.api.onShareData),
        root: !!document.getElementById("root"),
        rootHTML: (document.getElementById("root") || {}).innerHTML?.length || 0,
        ready: window.__renderReady,
      })
    `);
    mainLog.warn("[share-card] probe@t+0", probe1);

    // 等 __renderReady(短一些 timeout 用于快速失败)
    const ready = await Promise.race([
      win.webContents.executeJavaScript("window.__renderReady === true"),
      _timeoutPromise(timeoutMs, "render_timeout"),
    ]);
    mainLog.warn("[share-card] __renderReady", { ready });

    if (!ready) {
      // 失败时再探测一次,看 renderer 走到哪了
      const probe2 = await win.webContents.executeJavaScript(`
        JSON.stringify({
          api: typeof window.api,
          onShareData: typeof (window.api && window.api.onShareData),
          root: !!document.getElementById("root"),
          rootHTML: (document.getElementById("root") || {}).innerHTML?.length || 0,
          ready: window.__renderReady,
          url: location.href,
        })
      `);
      mainLog.warn("[share-card] probe@fail", probe2);
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
  }
}

module.exports = { createShareCardPng };
