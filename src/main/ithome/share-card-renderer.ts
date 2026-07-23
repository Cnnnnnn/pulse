/**
 * src/main/ithome/share-card-renderer.ts
 *
 * 离屏渲染分享卡片为 PNG。
 * createShareCardPng({ article, summary, timeoutMs? }) → Promise<Buffer>
 */
"use strict";

const { BrowserWindow, app, ipcMain } = require("electron");
const path = require("path");
const { mainLog } = require("../log.ts");

const DEFAULT_TIMEOUT_MS = 10000;
const WINDOW_WIDTH = 1080;
const WINDOW_HEIGHT = 1080;

function _diag(line: string): void {
    try {
        process.stderr.write(`[share-card-diag] ${line}\n`);
    } catch {
        /* noop */
    }
}

function _timeoutPromise(ms: number, message: string): Promise<never> {
    return new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error(message)), ms);
    });
}

export async function createShareCardPng(payload: any, opts: any = {}): Promise<Buffer> {
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
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            backgroundThrottling: false,
            zoomFactor: 1,
        },
    });

    let _resolveReady: (v: any) => void;
    const readyPromise = new Promise((resolve) => {
        _resolveReady = resolve;
    });
    ipcMain.on("share-card:ready", () => {
        _diag("ipc share-card:ready received");
        _resolveReady(true);
    });

    win.webContents.on("did-fail-load", (_e: any, code: any, desc: any, url: any) => {
        mainLog.warn("[share-card] did-fail-load", { code, desc, url });
    });
    win.webContents.on("console-message", (_e: any, level: any, message: any, line: any, source: any) => {
        _diag(`console L${level} ${source}:${line} ${message}`);
    });
    win.webContents.on("render-process-gone", (_e: any, details: any) => {
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

        const ready = await Promise.race([
            readyPromise,
            _timeoutPromise(timeoutMs, "render_timeout"),
        ]);
        _diag(`share-card:ready received, ready=${!!ready}`);

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
        try {
            ipcMain.removeAllListeners("share-card:ready");
        } catch {
            /* ignore */
        }
    }
}

module.exports = { createShareCardPng };
