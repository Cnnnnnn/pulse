/**
 * src/main/ai-usage-cache.js
 *
 * v2.22: 给 tray 用的 AI 用量 cache 简化接口.
 * 复用 stateStore.saveAiUsageSnapshotProvider (v2.14 已 ship) 写入,
 * loadAll/getTraySummary 直接从 state.json 读 (避开 v1 兼容分支的
 *   shape 包装, 让 tray 拿到的是干净 v2 形状).
 *
 * 设计原则:
 *   - createAiUsageCache({ statePath }) 工厂, 无副作用
 *   - loadAll() 返 { providers, histories, fetchedAt } 给 tray 一次性用
 *   - getTraySummary(providerId) 返 { status, percent, remainLabel, fetchedAt } 给 tray 显示
 *   - setSnapshot(providerId, snapshot) 包装 stateStore.saveAiUsageSnapshotProvider
 *     (自动加 fetchedAt 时间戳, 让 tray 能显示陈旧度)
 */
const fs = require("fs");
const stateStore = require("./state-store.ts");

const PROVIDERS = ["minimax", "glm"];

/**
 * @param {{ statePath?: string }} opts
 */
function createAiUsageCache(opts = {}) {
  const statePath = opts.statePath;

  function loadAll() {
    const state = _readState(statePath);
    const aiUsage = _readProvidersBlock(state, "ai_usage");
    const aiHistory = _readProvidersBlock(state, "ai_usage_history");
    const providers = {};
    const histories = {};
    let latestFetchedAt = 0;
    for (const pid of PROVIDERS) {
      const snap = aiUsage && aiUsage[pid];
      if (snap && typeof snap === "object") {
        providers[pid] = snap;
        const ts = snap.fetchedAt;
        if (typeof ts === "number" && ts > latestFetchedAt) {
          latestFetchedAt = ts;
        }
      }
      const hist = aiHistory && aiHistory[pid];
      if (hist && typeof hist === "object") {
        histories[pid] = hist;
      }
    }
    return { providers, histories, fetchedAt: latestFetchedAt };
  }

  function setSnapshot(providerId, snapshot) {
    if (!PROVIDERS.includes(providerId)) {
      throw new Error(`ai-usage-cache: unknown provider ${providerId}`);
    }
    const withTs = { ...(snapshot || {}), fetchedAt: Date.now() };
    stateStore.saveAiUsageSnapshotProvider(providerId, withTs, statePath);
  }

  /**
   * 给 tray 用的 summary. 简化展示字段.
   * @param {string} providerId
   * @returns {{ status: 'unconfigured' | 'ok' | 'error', percent?: number, remainLabel?: string, fetchedAt?: number, errorReason?: string }}
   */
  function getTraySummary(providerId) {
    const snap = _loadProviderSnapshot(providerId, statePath);
    if (!snap) return { status: "unconfigured" };
    const w = snap.windows && snap.windows["5h"];
    if (!w || typeof w.usedPercent !== "number") {
      return { status: "error", errorReason: "no_5h_window" };
    }
    return {
      status: "ok",
      percent: Math.round(w.usedPercent),
      remainLabel: _formatRemain(w.used, w.total),
      fetchedAt: typeof snap.fetchedAt === "number" ? snap.fetchedAt : Date.now(),
    };
  }

  return { loadAll, setSnapshot, getTraySummary, PROVIDERS };
}

/**
 * 读某个 provider 的 snapshot (facade 视角的 v2 形状).
 * 优先走 stateStore (proper v2 数据), 但 stateStore 会在无 schema_version 时
 * 触发 v1→v2 migrate 并把 v1 整体 wrap 进 providers[pid] — 这时我们要再
 * unwrap 一次才能拿到真实 snapshot 字段 (windows/days/...).
 */
function _loadProviderSnapshot(providerId, statePath) {
  const snap = stateStore.loadAiUsageSnapshotProvider(providerId, statePath);
  if (!snap || typeof snap !== "object") return null;
  // v1 整体被 wrap: { providers: { minimax: {...} } } 但无顶层 windows/days/fetchedAt
  if (snap.providers && typeof snap.providers === "object" && !snap.windows) {
    return snap.providers[providerId] || null;
  }
  return snap;
}

/**
 * 直读 state.json, 缺/坏 → null. 跟 stateStore.load() 行为一致 (无副作用).
 */
function _readState(statePath) {
  if (!statePath) return null;
  try {
    const raw = fs.readFileSync(statePath, "utf-8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object" || !j.apps || typeof j.apps !== "object") {
      return null;
    }
    return j;
  } catch {
    return null;
  }
}

/**
 * 取 state.ai_usage 或 state.ai_usage_history 下的 providers 块.
 * 兼容 facade 视角的 envelope: { providers: { pid: {...} } }
 * (有/无 schema_version 都行, 只要顶层有 providers 子键就认).
 */
function _readProvidersBlock(state, key) {
  if (!state || !state[key] || typeof state[key] !== "object") return null;
  const providers = state[key].providers;
  if (!providers || typeof providers !== "object") return null;
  return providers;
}

/**
 * 把"剩余量"展示成 "1.2h" / "45m".
 * 简化: 假设 5h 窗口, 剩多少比例 × 5h = 剩余时间.
 */
function _formatRemain(used, total) {
  if (typeof used !== "number" || typeof total !== "number" || total <= 0) {
    return "未知";
  }
  const remain = Math.max(0, total - used);
  const remainRatio = remain / total;
  const totalHours = 5;
  const remainHours = remainRatio * totalHours;
  if (remainHours >= 1) {
    return `${remainHours.toFixed(1)}h`;
  }
  return `${Math.round(remainHours * 60)}m`;
}

module.exports = { createAiUsageCache, PROVIDERS };
