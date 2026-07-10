/**
 * src/main/ipc/register-ai-usage.js
 *
 * IPC handlers for AI usage page (multi-provider: minimax + glm coding plans).
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §4.2
 *
 * Channels:
 *   - ai-usage:get-cached  → { ok, providers: {minimax, glm}, histories: {minimax, glm} }
 *                            (一次返全部已配置 provider, renderer 建 tab)
 *   - ai-usage:fetch       → { ok, provider, snapshot?, reason?, error?, status? }
 *
 * 事件推送:
 *   - ai-usage-updated     → { provider, snapshot, history }  (单 provider fetch 成功后推)
 *
 * 业务逻辑提到 _internals.fetch / _internals.getCached, 接受 {deps, opts} 注入,
 * 单测不依赖 electron / safeStorage. register* 是薄包装, 注入真实 deps.
 */

const stateStore = require("../state-store");
const aiStorage = require("../../ai-sessions/storage");
const { MiniMaxQuotaClient } = require("../../ai-usage/client");
const { GlmQuotaClient } = require("../../ai-usage/client-glm");

const KNOWN_PROVIDERS = ["minimax", "glm"];

/**
 * @param {string} providerId
 * @returns {Function|null}  对应的 QuotaClient 构造器
 */
function _pickClientCtor(deps, providerId) {
  if (providerId === "minimax") return deps.MiniMaxQuotaClient;
  if (providerId === "glm") return deps.GlmQuotaClient;
  return null;
}

/**
 * 读 provider API key from safeStorage. 出错时返 null (UI 友好).
 * @param {{loadApiKey: function}} storage
 * @param {string} providerId
 * @returns {string|null}
 */
function _loadApiKeySafe(storage, providerId) {
  try {
    const key = storage.loadApiKey(providerId);
    if (typeof key === "string" && key.length > 0) return key;
    return null;
  } catch {
    return null;
  }
}

const _internals = {
  /**
   * 返回所有 provider 的快照 + 历史, renderer 一次拿全建 tab.
   * @param {object} args
   * @param {object} args.deps  { stateStore }
   */
  async getCached({ deps }) {
    const providers = {};
    const histories = {};
    for (const pid of KNOWN_PROVIDERS) {
      providers[pid] = deps.stateStore.loadSnapshotProvider(pid);
      histories[pid] = deps.stateStore.loadHistoryProvider(pid);
    }
    return { ok: true, providers, histories };
  },

  /**
   * 单 provider fetch. opts.provider 选 client (默认 minimax).
   * @param {object} args
   * @param {object} args.deps  { stateStore, storage, MiniMaxQuotaClient, GlmQuotaClient, pushEvent }
   * @param {object} [args.opts] { provider: 'minimax' | 'glm', region?: 'cn' | 'global' }
   */
  async fetch({ deps, opts = {} }) {
    const providerId =
      opts && typeof opts.provider === "string" && opts.provider
        ? opts.provider
        : "minimax";

    const ClientCtor = _pickClientCtor(deps, providerId);
    if (!ClientCtor) {
      return { ok: false, provider: providerId, reason: "unknown_provider" };
    }

    const apiKey = _loadApiKeySafe(deps.storage, providerId);
    if (!apiKey) {
      return { ok: false, provider: providerId, reason: "api_key_missing" };
    }

    const region = opts && opts.region === "global" ? "global" : "cn";
    const client = new ClientCtor({ apiKey, region });
    const r = await client.fetchOnce();
    if (!r.ok) {
      return { ...r, provider: providerId };
    }

    // Minimax 同时拉 usage_summary (90 天 token 用量 + 模型分布 + 排名百分位).
    // 失败不阻塞主流程 (snapshot 已经成功), 仅记 warn + snapshot.usageSummary=null.
    let usageSummary = null;
    if (providerId === "minimax" && typeof client.fetchUsageSummaryOnce === "function") {
      try {
        const us = await client.fetchUsageSummaryOnce();
        if (us && us.ok && us.usageStats) {
          usageSummary = us.usageStats;
        } else {
          log_warn_history(`usage_summary fetch failed: ${us && us.reason}`);
        }
      } catch (e) {
        log_warn_history(`usage_summary fetch threw: ${e && e.message}`);
      }
    }
    if (usageSummary) {
      r.snapshot.usageSummary = usageSummary;
    }

    // 写该 provider 的 snapshot (atomic, 不影响其它 provider)
    deps.stateStore.saveSnapshotProvider(providerId, r.snapshot);

    // 追加当天 used 到 history (sparkline 持久化)
    // 用 5h 窗口的 usedPercent (0-100) 作主指标, used (绝对数) 作 tooltip 辅助
    const w = r.snapshot && r.snapshot.windows && r.snapshot.windows["5h"];
    if (w && typeof w.usedPercent === "number" && w.usedPercent > 0) {
      try {
        const date = _localDateKey();
        const percent = w.usedPercent; // 0-100
        const used = typeof w.used === "number" && w.used > 0 ? w.used : null;
        deps.stateStore.appendHistoryProvider(providerId, {
          date,
          percent,
          used,
        });
      } catch (e) {
        log_warn_history(e);
      }
    }

    const history = deps.stateStore.loadHistoryProvider(providerId);
    deps.pushEvent("ai-usage-updated", {
      provider: providerId,
      snapshot: r.snapshot,
      history,
    });
    return { ...r, provider: providerId };
  },
};

/**
 * 本地时区 "YYYY-MM-DD". 不用 ISO 的 UTC (跨时区可能错位).
 * @returns {string}
 */
function _localDateKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function log_warn_history(e) {
  // 历史写入失败不应该阻塞 fetch 主流程; 用 console 而非 renderer log (main 进程)
  try {
    console.warn("[ai-usage] appendHistory failed:", e && e.message);
  } catch {
    /* noop */
  }
}

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
      loadSnapshotProvider: stateStore.loadAiUsageSnapshotProvider,
      saveSnapshotProvider: stateStore.saveAiUsageSnapshotProvider,
      loadHistoryProvider: stateStore.loadAiUsageHistoryProvider,
      appendHistoryProvider: stateStore.appendAiUsageHistoryDayProvider,
    },
    storage: {
      loadApiKey: aiStorage.loadApiKey.bind(aiStorage),
    },
    MiniMaxQuotaClient,
    GlmQuotaClient,
    pushEvent: sendToRenderer,
  };

  safeHandle("ai-usage:get-cached", async () => _internals.getCached({ deps }));

  safeHandle("ai-usage:fetch", async (_event, opts) =>
    _internals.fetch({ deps, opts: opts || {} }),
  );

  safeHandle("ai-usage:alert-prefs:get", () => ({
    ok: true,
    prefs: stateStore.loadAiUsageAlertPrefs(),
  }));

  safeHandle("ai-usage:alert-prefs:set", (_event, patch) => {
    try {
      stateStore.saveAiUsageAlertPrefs(patch || {});
      return { ok: true, prefs: stateStore.loadAiUsageAlertPrefs() };
    } catch (err) {
      return { ok: false, reason: "save_failed", error: err && err.message };
    }
  });
}

module.exports = { registerAiUsageHandlers, _internals, KNOWN_PROVIDERS };
