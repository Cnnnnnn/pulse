/**
 * src/main/error-guard.js
 *
 * 主进程全局兜底: 任何未捕获异常都写日志, 推 IPC 给 renderer,
 * 防止调度器 / IPC handler 静默停摆, 用户无感知.
 *
 * 必须在 app ready 前注册 — 同一异常只记录一次 (避免 promise 链
 * 既 unhandledRejection 又 uncaughtException 重复刷屏).
 */

const { mainLog } = require("./log");

let _sendToRenderer = null;
const _seen = new WeakSet();

function _format(err) {
  if (!err) return "(no error)";
  const msg = (err && err.message) || String(err);
  const stack = (err && err.stack) || "";
  return stack ? `${msg}\n${stack}` : msg;
}

function _report(kind, err) {
  if (!err || _seen.has(err)) return;
  _seen.add(err);
  try {
    mainLog.error(`[error-guard] ${kind}: ${_format(err)}`);
  } catch {
    /* noop */
  }
  if (typeof _sendToRenderer === "function") {
    try {
      _sendToRenderer("main:error", {
        kind,
        message: (err && err.message) || String(err),
        name: (err && err.name) || "Error",
        ts: Date.now(),
      });
    } catch {
      /* noop */
    }
  }
}

/**
 * 注册全局兜底. sendToRenderer 可选 — 给 renderer 推 'main:error' 事件,
 * 让前端能弹错误 toast / 上报.
 */
function installErrorGuard(sendToRenderer) {
  if (typeof sendToRenderer === "function") {
    _sendToRenderer = sendToRenderer;
  }

  process.on("uncaughtException", (err) => {
    _report("uncaughtException", err);
  });

  process.on("unhandledRejection", (reason) => {
    const err =
      reason && typeof reason === "object" && "message" in reason
        ? reason
        : new Error(String(reason));
    _report("unhandledRejection", err);
  });
}

module.exports = { installErrorGuard };
