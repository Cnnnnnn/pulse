/**
 * src/main/ipc/register-ai-usage.js
 *
 * IPC handlers for AI usage page (Minimax coding plan quota).
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §4.2
 *
 * Channels:
 *   - ai-usage:get-cached  → { ok, snapshot }   (从 state.json 读 last-known, 同步)
 *   - ai-usage:fetch       → { ok, snapshot?, reason?, error?, status? }
 *
 * 事件推送:
 *   - ai-usage-updated     → { snapshot }  (fetch 成功后 renderer 自动刷新)
 *
 * 业务逻辑提到 _internals.fetch / _internals.getCached, 接受 {deps, opts} 注入,
 * 单测不依赖 electron / safeStorage. register* 是薄包装, 注入真实 deps.
 */

const stateStore = require("../state-store");
const aiStorage = require("../../ai-sessions/storage");
const { MiniMaxQuotaClient } = require("../../ai-usage/client");

const PROVIDER_ID = "minimax";

/**
 * 读 minimax API key from safeStorage. 出错时返 null (UI 友好).
 * @param {{loadApiKey: function}} storage
 * @returns {string|null}
 */
function _loadApiKeySafe(storage) {
  try {
    const key = storage.loadApiKey(PROVIDER_ID);
    if (typeof key === "string" && key.length > 0) return key;
    return null;
  } catch {
    return null;
  }
}

const _internals = {
  /**
   * @param {object} args
   * @param {object} args.deps  { stateStore, pushEvent }
   */
  async getCached({ deps }) {
    const snapshot = deps.stateStore.load();
    return { ok: true, snapshot };
  },

  /**
   * @param {object} args
   * @param {object} args.deps  { stateStore, storage, MiniMaxQuotaClient, pushEvent }
   * @param {object} [args.opts] { region: 'cn' | 'global' }
   */
  async fetch({ deps, opts = {} }) {
    const apiKey = _loadApiKeySafe(deps.storage);
    if (!apiKey) {
      return { ok: false, reason: "api_key_missing" };
    }

    const region = opts && opts.region === "global" ? "global" : "cn";
    const ClientCtor = deps.MiniMaxQuotaClient;
    const client = new ClientCtor({ apiKey, region });
    const r = await client.fetchOnce();
    if (!r.ok) {
      return r;
    }

    // 读上一轮 snapshot (用于 renderer 算 burn rate / 预计耗尽时间)
    const prevSnapshot = deps.stateStore.load() || null;
    deps.stateStore.save(r.snapshot);
    deps.pushEvent("ai-usage-updated", { snapshot: r.snapshot, prevSnapshot });
    return r;
  },
};

/**
 * @param {object} ctx
 * @param {(channel: string, fn: Function, opts?: object) => void} ctx.safeHandle
 * @param {(channel: string, payload: any) => void} ctx.sendToRenderer
 */
function registerAiUsageHandlers(ctx) {
  const { safeHandle, sendToRenderer } = ctx;

  // 真实 deps — 引用项目内 module
  const deps = {
    stateStore: {
      load: stateStore.loadAiUsageSnapshot,
      save: stateStore.saveAiUsageSnapshot,
    },
    storage: {
      loadApiKey: aiStorage.loadApiKey.bind(aiStorage),
    },
    MiniMaxQuotaClient,
    pushEvent: sendToRenderer,
  };

  safeHandle("ai-usage:get-cached", async () => _internals.getCached({ deps }));

  safeHandle("ai-usage:fetch", async (_event, opts) =>
    _internals.fetch({ deps, opts: opts || {} }),
  );
}

module.exports = { registerAiUsageHandlers, _internals };
