/**
 * src/main/error-guard.js
 *
 * 主进程全局兜底: 任何未捕获异常都写日志, 推 IPC 给 renderer,
 * 防止调度器 / IPC handler 静默停摆, 用户无感知.
 *
 * 必须在 app ready 前注册 — 同一异常只记录一次 (避免 promise 链
 * 既 unhandledRejection 又 uncaughtException 重复刷屏).
 *
 * v2.16: 加 SUPPRESSED_ERROR_CODES — 退出期可预期的底层 stream 错误 (EPIPE /
 * ERR_STREAM_DESTROYED) 不推 renderer toast, 避免用户看到无意义的红框.
 * 这些错误仍写 mainLog, 开发者调日志能看到; 只是不让前端弹.
 */

const { mainLog } = require("./log");

let _sendToRenderer = null;
const _seen = new WeakSet();

// Phase Q6: lazy require of bootstrap/error-init so error-guard can also
// append each reported error into the JSONL aggregator. try/catch guards
// against circular-dep / require failure — bootstrap may not exist in
// minimal test contexts.
let _bootstrapInstance = null;
function _getBootstrap() {
  if (_bootstrapInstance !== null) return _bootstrapInstance;
  try {
    _bootstrapInstance = require("./bootstrap/error-init");
  } catch {
    _bootstrapInstance = false;
  }
  return _bootstrapInstance;
}

/**
 * 进程退出期可预期的错误 code — 不推 renderer toast.
 *
 * 场景:
 *   - EPIPE: child process 退出 (e.g. bench SIGTERM electron, IPC 通道断)
 *            时, 内部 stdio/stderr stream write 触发. Node 把这种 unhandled
 *            错误抛到 uncaughtException. 不是真实 bug, 是退出期的正常现象.
 *   - ERR_STREAM_DESTROYED: 跟 EPIPE 同源, stream 已 destroy 后再写.
 *   - ERR_IPC_CHANNEL_CLOSED: 类似, IPC channel 关闭后 postMessage.
 *
 * 修法: 写 mainLog 留痕, 但不推 renderer (不打扰用户).
 */
const SUPPRESSED_ERROR_CODES = new Set([
  "EPIPE",
  "ERR_STREAM_DESTROYED",
  "ERR_IPC_CHANNEL_CLOSED",
]);

function _isSuppressed(err) {
  if (!err) return false;
  if (SUPPRESSED_ERROR_CODES.has(err.code)) return true;
  // 没 code 字段但 message 是 "write EPIPE" 之类 (node internal 错误可能没 code)
  const msg = err.message || String(err);
  if (
    typeof msg === "string" &&
    /EPIPE|ERR_STREAM_DESTROYED|ERR_IPC_CHANNEL_CLOSED/.test(msg)
  ) {
    return true;
  }
  return false;
}

function _format(err) {
  if (!err) return "(no error)";
  const msg = (err && err.message) || String(err);
  const stack = (err && err.stack) || "";
  return stack ? `${msg}\n${stack}` : msg;
}

function _report(kind, err) {
  if (!err || _seen.has(err)) return;
  _seen.add(err);
  const suppressed = _isSuppressed(err);
  // 1) 写日志 — 始终写, suppressed 也写 (留痕)
  try {
    const tag = suppressed ? "suppressed" : "report";
    mainLog[tag === "suppressed" ? "warn" : "error"](
      `[error-guard] ${tag} ${kind}: ${_format(err)}`,
    );
  } catch {
    /* noop */
  }
  // 2) 推 renderer — 只推非 suppressed
  if (!suppressed && typeof _sendToRenderer === "function") {
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
    const original = sendToRenderer;
    // Phase Q6: wrap so each main:error toast also lands in the JSONL
    // aggregator. Preserve original call (channel, payload) verbatim so
    // toast behavior is unchanged.
    _sendToRenderer = (channel, payload) => {
      try {
        original(channel, payload);
      } catch {
        /* swallow — renderer's IPC may be torn down */
      }
      if (channel === "main:error") {
        try {
          const mod = _getBootstrap();
          if (mod && typeof mod.getInstance === "function") {
            const inst = mod.getInstance();
            if (inst && inst.aggregator) {
              const p = payload || {};
              inst.aggregator
                .append({
                  source: "main",
                  level: "error",
                  message: p.message || String(p),
                  stack: p.stack || "",
                  context: { channel, kind: p.kind || "error-guard" },
                })
                .catch(() => {});
            }
          }
        } catch {
          /* swallow */
        }
      }
    };
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
