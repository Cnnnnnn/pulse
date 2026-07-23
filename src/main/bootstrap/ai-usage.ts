/**
 * src/main/bootstrap/ai-usage.ts
 *
 * AI usage 页面 main 进程 bootstrap.
 * - register IPC handlers (ai-usage:get-cached, ai-usage:fetch)
 * - 启动后 fire-and-forget 预热所有已配置 provider 各一次 fetch, renderer 进来就有数据
 *
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §4.4
 *
 * 设计: 业务逻辑复用 register-ai-usage._internals, 此处只负责装配 + warmup.
 *      multi-provider v2: minimax + glm 各自 fire-and-forget.
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).
import type {} from "electron";

const { _internals, KNOWN_PROVIDERS } = require("../ipc/register-ai-usage.ts");

/**
 * @param {object} deps
 * @param {object} deps.stateStore   { loadSnapshotProvider, saveSnapshotProvider, loadHistoryProvider, appendHistoryProvider }
 * @param {object} deps.storage      { loadApiKey }
 * @param {Function} deps.MiniMaxQuotaClient
 * @param {Function} deps.GlmQuotaClient
 * @param {(channel: string, payload: any) => void} deps.sendToRenderer
 * @param {(channel: string, fn: Function) => void} deps.register   main 的 safeHandle
 * @param {object} [opts]
 * @param {boolean} [opts.warmup=true]  启动时是否 fire-and-forget 拉一次
 */
function bootstrapAiUsage(deps, opts: { warmup?: boolean; registerIpc?: boolean } = {}) {
  const warmup = opts.warmup !== false;
  const registerIpc = opts.registerIpc !== false; // 默认也注册 IPC, 调用方可选跳过

  // ── 1) 内部 deps: _internals.fetch/getCached 期望 deps.pushEvent
  //      外部 deps 用 sendToRenderer (跟 main process 别处一致), 这里包一层.
  const internalDeps = {
    stateStore: deps.stateStore,
    storage: deps.storage,
    MiniMaxQuotaClient: deps.MiniMaxQuotaClient,
    GlmQuotaClient: deps.GlmQuotaClient,
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

  // ── 3) 预热 fetch (fire-and-forget) — 对每个已配置 provider 各拉一次 ──
  if (warmup) {
    for (const provider of KNOWN_PROVIDERS) {
      Promise.resolve()
        .then(() =>
          _internals.fetch({ deps: internalDeps, opts: { provider } }),
        )
        .catch(() => {
          /* 启动期 fetch 失败完全吞掉 — 不阻塞 bootstrap, 错误由 UI 后续 fetch 显示 */
        });
    }
  }
}

module.exports = { bootstrapAiUsage, KNOWN_PROVIDERS };
