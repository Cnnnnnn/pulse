/**
 * src/main/bootstrap/ai-usage.js
 *
 * AI usage 页面 main 进程 bootstrap.
 * - register IPC handlers (ai-usage:get-cached, ai-usage:fetch)
 * - 启动后 fire-and-forget 预热一次 fetch, renderer 进来就有数据
 *
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §4.4
 *
 * 设计: 业务逻辑复用 register-ai-usage._internals, 此处只负责装配 + warmup.
 */

const { _internals } = require("../ipc/register-ai-usage");

/**
 * @param {object} deps
 * @param {object} deps.stateStore   { load, save }
 * @param {object} deps.storage      { loadApiKey }
 * @param {Function} deps.MiniMaxQuotaClient
 * @param {(channel: string, payload: any) => void} deps.sendToRenderer
 * @param {(channel: string, fn: Function) => void} deps.register   main 的 safeHandle
 * @param {object} [opts]
 * @param {boolean} [opts.warmup=true]  启动时是否 fire-and-forget 拉一次
 */
function bootstrapAiUsage(deps, opts = {}) {
  const warmup = opts.warmup !== false;
  const registerIpc = opts.registerIpc !== false; // 默认也注册 IPC, 调用方可选跳过

  // ── 1) 内部 deps: _internals.fetch/getCached 期望 deps.pushEvent
  //      外部 deps 用 sendToRenderer (跟 main process 别处一致), 这里包一层.
  const internalDeps = {
    stateStore: deps.stateStore,
    storage: deps.storage,
    MiniMaxQuotaClient: deps.MiniMaxQuotaClient,
    pushEvent: deps.sendToRenderer,
  };

  // ── 2) 注册 IPC handlers (可选 — 调用方在 registerIpcHandlers 已注册时可跳过) ──
  if (registerIpc && typeof deps.register === "function") {
    deps.register("ai-usage:get-cached", async () =>
      _internals.getCached({ deps: internalDeps }),
    );
    deps.register("ai-usage:fetch", async (_event, evtOpts) =>
      _internals.fetch({ deps: internalDeps, opts: evtOpts || {} }),
    );
  }

  // ── 3) 预热 fetch (fire-and-forget) ──
  if (warmup) {
    Promise.resolve()
      .then(() => _internals.fetch({ deps: internalDeps, opts: {} }))
      .catch(() => {
        /* 启动期 fetch 失败完全吞掉 — 不阻塞 bootstrap, 错误由 UI 后续 fetch 显示 */
      });
  }
}

module.exports = { bootstrapAiUsage };
