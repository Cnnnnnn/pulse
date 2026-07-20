/**
 * src/main/ipc/register-stock-export.js
 *
 * 个股诊断报告导出 PNG IPC handler.
 *   stocks:export-diagnosis-png({ defaultName? })
 *     → { ok: true, path, sizeBytes } | { ok: false, reason, error? }
 *
 * 实现思路 (ponytail: minimum code that works):
 *   1. showSaveDialog 让用户选位置 (默认 ~/Downloads/<defaultName>.png)
 *   2. capturePage() 截当前 BrowserWindow 整页 (renderer 已临时隐藏按钮/skeleton,
 *      减少画面噪声)
 *   3. toPNG() → writeFileSync
 *   4. 返 { ok, path, sizeBytes }
 *
 * ponytail:
 *   - 不引图像处理库 (sharp / jimp). 整页截图够用.
 *   - 不引独立窗口 + 自定义 HTML (ithome 模式). 当前主窗口就是目标,
 *     renderer 已经把诊断页放在主区域, 截整页基本是"诊断页全景".
 *   - dialog / BrowserWindow / app 从 ctx 注入 (与 register-config-portability
 *     一致), 让测试环境能 mock.
 */
const fs = require("fs");
const path = require("path");

function sanitize(name) {
  // ponytail: 文件名去掉路径分隔符 / 控制字符, 防用户输入奇怪的 defaultName.
  return String(name || "诊断报告").replace(
    // eslint-disable-next-line no-control-regex
    /[\\/:*?"<>|\u0000-\u001f]/g,
    "_",
  ).slice(0, 80);
}

function resolveDownloadsDir(electronApp) {
  try {
    if (electronApp && typeof electronApp.getPath === "function") {
      return electronApp.getPath("downloads");
    }
  } catch {
    /* fall through */
  }
  try {
    return require("os").homedir();
  } catch {
    return process.cwd();
  }
}

function registerStockExportHandlers(ctx) {
  const { safeHandle, threwResponse } = ctx;
  // ponytail: 与 register-config-portability 一致 — dialog/BrowserWindow/app 从 ctx 注入,
  // 让 vitest 测试能 mock. 生产环境 index.js 里直接传 require("electron").xxx.
  const { dialog, BrowserWindow, electronApp } = ctx;

  safeHandle(
    "stocks:export-diagnosis-png",
    async (event, { defaultName } = {}) => {
      try {
        if (!BrowserWindow || !dialog) {
          return { ok: false, reason: "main_not_ready" };
        }
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed()) {
          return { ok: false, reason: "no_window" };
        }
        const safeBase = sanitize(defaultName || "诊断报告");
        const downloads = resolveDownloadsDir(electronApp);
        const suggestedPath = path.join(downloads, `${safeBase}.png`);
        const result = await dialog.showSaveDialog(win, {
          title: "导出诊断报告",
          defaultPath: suggestedPath,
          filters: [{ name: "PNG 图片", extensions: ["png"] }],
        });
        if (result.canceled || !result.filePath) {
          return { ok: false, reason: "canceled" };
        }
        const image = await win.webContents.capturePage();
        if (
          !image ||
          (typeof image.isEmpty === "function" && image.isEmpty())
        ) {
          return { ok: false, reason: "capture_empty" };
        }
        const buf = image.toPNG();
        if (!buf || buf.length === 0) {
          return { ok: false, reason: "capture_empty" };
        }
        fs.writeFileSync(result.filePath, buf);
        return { ok: true, path: result.filePath, sizeBytes: buf.length };
      } catch (err) {
        return threwResponse(err);
      }
    },
    {
      onError: (err) => ({
        ok: false,
        reason: "internal_error",
        error: err && err.message ? err.message : String(err),
      }),
    },
  );
}

module.exports = { registerStockExportHandlers };
