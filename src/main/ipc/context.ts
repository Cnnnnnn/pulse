/**
 * src/main/ipc/context.ts — IPC handler 共享上下文 (safeHandle / sendToRenderer).
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).
import type { IpcMain, BrowserWindow } from "electron";

type MainLog = { warn: (msg: string, meta?: Record<string, unknown>) => void };

type IpcContextDeps = {
  getConfig?: () => unknown;
  pool?: unknown;
  getWindow?: () => BrowserWindow | null | undefined;
  onCheckComplete?: (...args: unknown[]) => unknown;
  getCachedState?: () => unknown;
  getFundScheduler?: () => unknown;
  getSelfUpdateController?: () => unknown;
};

type SafeHandleFn = (...args: unknown[]) => Promise<unknown> | unknown;

type SafeHandleOpts = {
  onError?: (err: any, ...args: unknown[]) => unknown;
  logMeta?:
    | Record<string, unknown>
    | ((...args: unknown[]) => Record<string, unknown>);
  log?: boolean;
  logIf?: (err: any) => boolean;
};

type IpcContext = {
  getConfig: IpcContextDeps["getConfig"];
  pool: IpcContextDeps["pool"];
  getWindow: IpcContextDeps["getWindow"];
  onCheckComplete: IpcContextDeps["onCheckComplete"];
  getCachedState: IpcContextDeps["getCachedState"];
  fundScheduler: () => unknown;
  selfUpdateController: () => unknown;
  sendToRenderer: (channel: string, payload?: unknown) => void;
  threwResponse: (err: any, extra?: Record<string, unknown>) => {
    ok: false;
    reason: "threw";
    error: any;
    [k: string]: unknown;
  };
  safeHandle: (
    channel: string,
    fn: SafeHandleFn,
    opts?: SafeHandleOpts,
  ) => void;
};

const { ipcMain }: { ipcMain: IpcMain } = require("electron");
const { mainLog }: { mainLog: MainLog } = require("../log.ts");

/**
 * @param {object} deps
 * @returns {object} ctx
 */
function createIpcContext(deps: IpcContextDeps): IpcContext {
  const {
    getConfig,
    pool,
    getWindow,
    onCheckComplete,
    getCachedState,
    getFundScheduler,
    getSelfUpdateController,
  } = deps;

  function fundScheduler() {
    return typeof getFundScheduler === "function" ? getFundScheduler() : null;
  }

  // P52: 自更新 controller (startSelfUpdateTimer 注入的)
  function selfUpdateController() {
    return typeof getSelfUpdateController === "function"
      ? getSelfUpdateController()
      : null;
  }

  function sendToRenderer(channel: string, payload?: unknown) {
    const w = getWindow && getWindow();
    if (w && !w.isDestroyed()) {
      w.webContents.send(channel, payload);
    }
  }

  function threwResponse(err: any, extra: Record<string, unknown> = {}) {
    return { ok: false as const, reason: "threw" as const, error: err && err.message, ...extra };
  }

  function safeHandle(
    channel: string,
    fn: SafeHandleFn,
    opts: SafeHandleOpts = {},
  ) {
    const { onError, logMeta, log = true, logIf } = opts;
    ipcMain.handle(channel, async (...args: unknown[]) => {
      try {
        return await fn(...args);
      } catch (err: any) {
        if (log && (!logIf || logIf(err))) {
          const meta =
            typeof logMeta === "function" ? logMeta(...args) : logMeta || {};
          mainLog.warn(`[ipc] ${channel} threw`, {
            ...meta,
            msg: err && err.message,
          });
        }
        if (onError) return onError(err, ...args);
        return threwResponse(err);
      }
    });
  }

  return {
    getConfig,
    pool,
    getWindow,
    onCheckComplete,
    getCachedState,
    fundScheduler,
    selfUpdateController,
    sendToRenderer,
    threwResponse,
    safeHandle,
  };
}

module.exports = { createIpcContext };
