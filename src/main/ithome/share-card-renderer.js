/**
 * src/main/ithome/share-card-renderer.js
 *
 * 离屏渲染分享卡片为 PNG。
 * createShareCardPng({ article, summary, timeoutMs? }) → Promise<Buffer>
 */
const { BrowserWindow, app } = require("electron");
const path = require("path");

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
  const win = new BrowserWindow({
    show: false,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      zoomFactor: 1,
    },
  });

  try {
    const htmlPath = path.join(app.getAppPath(), "share-card.html");
    await win.loadFile(htmlPath);
    win.webContents.send("share-data", { article, summary });

    // 等 __renderReady
    const ready = await Promise.race([
      win.webContents.executeJavaScript("window.__renderReady === true"),
      _timeoutPromise(timeoutMs, "render_timeout"),
    ]);
    if (!ready) throw new Error("render_timeout");

    // 留一帧 paint
    await new Promise((r) => setTimeout(r, 100));

    const image = await win.webContents.capturePage();
    if (!image) throw new Error("capture_empty");
    const buf = image.toPNG();
    if (!buf || buf.length === 0) throw new Error("capture_empty");
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
