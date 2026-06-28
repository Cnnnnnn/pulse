/**
 * src/main/metal-ipc.js
 *
 * IPC handlers for metals: state persistence + scheduler events.
 * State is stored in state.json under `metals` key (same pattern as funds).
 *
 * This is the ONLY file in the metals module that imports 'electron' — kept
 * isolated so the scheduler (and below it, the fetchers) can be tested
 * without electron in the loop.
 *
 * Persistence: mirrors fund-store.js's pattern — `stateStore.load()` +
 * `stateStore.writeAtomic()` with explicit `Object.assign({}, existing, ...)`,
 * which preserves all sibling fields (funds / task_summaries / worldcup* /
 * classify_llm_cache etc.) without relying on PRESERVE_FIELDS.
 */

const { ipcMain, webContents } = require("electron");
const { HttpClient } = require("./http-client.js");
const { MetalScheduler } = require("../metals/metal-scheduler.js");
const {
  fetchMetalKline,
  pointsToHistoryMap,
} = require("../metals/metal-kline-fetcher.js");
const { METALS } = require("../metals/metal-config.js");
const { mainLog } = require("./log");
const stateStore = require("./state-store.js");

const DEFAULT_CONFIG = {
  watchedIds: ["XAU", "XAG", "AU9999", "AG9999"],
  holdings: { XAU: null, XAG: null, AU9999: null, AG9999: null },
  deletedIds: [],
  historyMap: {},
  lastBackfillAt: 0,
};

// Singleton HttpClient — metals fetches are 2 lightweight GETs per 5-min cycle,
// no need to instantiate per-request. Mirrors the shared-instance style used
// elsewhere in the main process (vs funds, which spins up per-handler clients).
const httpClient = new HttpClient({ timeout: 8000, maxRetries: 0 });

let scheduler = null;
let quoteCache = { data: {}, errors: {}, fetchedAt: null };
let fxCache = { rate: null, fetchedAt: null };

/**
 * Adapter: Pulse's httpClient returns { status, body, headers, error? }.
 * The metals fetchers expect (url, headers) => string.
 * This adapter wraps the status check + body passthrough.
 */
function httpGetAdapter(url, headers) {
  return httpClient.get(url, { headers, timeoutMs: 8000 }).then((r) => {
    if (r.error) throw new Error(r.error);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return r.body;
  });
}

function loadConfig() {
  const state = stateStore.load();
  const stored = (state && state.metals) || {};
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    holdings: { ...DEFAULT_CONFIG.holdings, ...(stored.holdings || {}) },
    historyMap: stored.historyMap || {},
    lastBackfillAt: stored.lastBackfillAt || 0,
  };
}

function persistConfig(metalsPayload) {
  // 走 patchState: 自动处理 apps / mutes / last_opened / active_category /
  // ai_sessions_config 基础字段, 再 preserveExtraFields 兜住其余 (funds / worldcup*
  // / ithome_news / reminders / recentActivity 等). 比手撸 Object.assign 更安全:
  // 老实现遇到 state.json 缺失会写出缺 apps 字段的 state, 直接破坏 Pulse 主流程.
  stateStore.patchState((next) => {
    next.metals = metalsPayload;
  });
  return metalsPayload;
}

function saveConfig(patch) {
  const current = loadConfig();
  const next = { ...current, ...patch };
  return persistConfig(next);
}

function saveHistoryMap(historyMap) {
  stateStore.patchState((next) => {
    next.metals = { ...(next.metals || {}), historyMap };
  });
  return historyMap;
}

function markBackfilled(atMs) {
  stateStore.patchState((next) => {
    next.metals = { ...(next.metals || {}), lastBackfillAt: atMs };
  });
}

function broadcast(channel, payload) {
  for (const wc of webContents.getAllWebContents()) {
    wc.send(channel, payload);
  }
}

/**
 * 检查 historyMap 缺口, 1h 冷却防风暴. 拉东方财富 kline, 合并入 historyMap, 写 state.json, 广播 renderer.
 * @param {object} [opts]
 * @param {Function} [opts.httpGet] 注入 http getter; 默认走 module-level httpClient adapter
 * @param {Function} [opts.now]    注入当前时间, 测试用
 * @param {object} [opts.scheduler] 注入 scheduler 实例; 默认用 module-level scheduler
 * @param {boolean} [opts.force=false] 跳过 1h 冷却. 用于手动 refresh 路径,
 *        渲染器等 fetchNow 后想立即拿到 historyMap 时绕过冷却.
 *
 * ponytail: 并发保护 — 模块级 backfillInflight Promise. 同时多次调 (fire-and-forget
 *         那个 + IPC handler force:true 那个并发) 共享同一次 fetch, 避免 eastmoney
 *         限流/超时双倍. 修 "冷启动 + 刷新同时跑 backfill, 都失败" 这个具体 case.
 */
let backfillInflight = null;

async function triggerBackfill(opts = {}) {
  // Concurrency gate: 多个调用方共享同一次 in-flight fetch.
  // opts 里带 skipInflightGate=true 跳过 (测试用, 防止测试串行态被卡).
  if (!opts.skipInflightGate && backfillInflight) {
    return backfillInflight;
  }

  const httpGet = opts.httpGet || httpGetAdapter;
  const now = opts.now || (() => Date.now());
  const cfg = loadConfig();
  if (!opts.force && now() - (cfg.lastBackfillAt || 0) < 60 * 60 * 1000) {
    return { skipped: true, reason: "cooldown" };
  }
  const sched = opts.scheduler || scheduler || new MetalScheduler({ httpGet });
  const gate = opts.skipInflightGate
    ? null
    : (backfillInflight = (async () => {
        try {
          const gap = sched.detectHistoryGap(cfg.historyMap, METALS);
          if (gap.need.length === 0) {
            markBackfilled(now());
            return { skipped: true, reason: "no_gap" };
          }
          try {
            const items = gap.need.map((n) => ({
              id: n.id,
              secid: n.secid,
              unitDivisor: n.unitDivisor,
            }));
            const fetched = await fetchMetalKline(items, httpGet);
            const newHistory = pointsToHistoryMap(fetched, items);
            const merged = { ...cfg.historyMap };
            for (const [id, arr] of Object.entries(newHistory)) {
              const map = new Map();
              for (const p of [...(merged[id] || []), ...arr]) {
                map.set(p.date, p);
              }
              merged[id] = Array.from(map.values())
                .sort((a, b) => (a.date < b.date ? -1 : 1))
                .slice(-30);
            }
            saveHistoryMap(merged);
            markBackfilled(now());
            broadcast("metals:history:changed", { historyMap: merged });
            return { ok: true, backfilled: Object.keys(newHistory).length };
          } catch (err) {
            mainLog.warn(`[metals] backfill failed: ${err && err.message}`);
            return { ok: false, error: err && err.message };
          }
        } finally {
          if (!opts.skipInflightGate) backfillInflight = null;
        }
      })());
  return gate;
}

/**
 * v2.22 Task D1: 给 tray 用的简化 snapshot.
 * 复用模块级 quoteCache / fxCache + loadConfig() 拿 holdings.
 * 不持久化 quoteCache (live only, 跟原架构一致).
 */
function getTraySnapshot() {
  return {
    quotes: quoteCache && quoteCache.data ? { ...quoteCache.data } : {},
    fx: fxCache && typeof fxCache.rate === "number" ? { ...fxCache } : null,
    fetchedAt: quoteCache && quoteCache.fetchedAt ? quoteCache.fetchedAt : null,
    errors: quoteCache && quoteCache.errors ? { ...quoteCache.errors } : {},
    holdings:
      loadConfig() && loadConfig().holdings ? { ...loadConfig().holdings } : {},
  };
}

/**
 * v2.22 Task D1-refactor: 只注册 IPC handlers, 不启 scheduler.
 * 拆分前 registerMetalIpc 内部隐式启 scheduler, 跟调度生命周期混淆.
 * 现在: registerMetalIpc() 跟 startMetalScheduler() 互相独立, caller 显式控制.
 */
function registerMetalIpc() {
  ipcMain.handle("metals:list", () => loadConfig());

  ipcMain.handle("metals:history:get", () => {
    const cfg = loadConfig();
    return {
      historyMap: cfg.historyMap,
      source: METALS.reduce((acc, m) => {
        acc[m.id] = { secid: m.historySecid, label: m.proxyLabel };
        return acc;
      }, {}),
    };
  });

  ipcMain.handle("metals:config:update", (_evt, { patch }) =>
    saveConfig(patch),
  );

  ipcMain.handle("metals:holding:upsert", (_evt, { id, holding }) => {
    const cfg = loadConfig();
    cfg.holdings[id] = holding;
    persistConfig(cfg);
    return cfg;
  });

  ipcMain.handle("metals:holding:remove", (_evt, { id }) => {
    const cfg = loadConfig();
    cfg.holdings[id] = null;
    persistConfig(cfg);
    return cfg;
  });

  ipcMain.handle("metals:quote:fetch", async () => {
    if (!scheduler) return { ok: false, error: "scheduler not started" };
    await scheduler.fetchNow();
    // 串行等 backfill: renderer 拿到 fetchNow response 时 historyMap 已最新,
    // 避免"quote 出了但 30 天走势还在加载中"的竞态. 绕过 1h 冷却 (cooldown 是为
    // 防后台 5min tick 频繁打 eastmoney kline, 手动点刷新不受限).
    const cfg = loadConfig();
    if (scheduler.detectHistoryGap(cfg.historyMap, METALS).need.length > 0) {
      const r = await triggerBackfill({ force: true });
      if (!r.ok && r.reason !== "no_gap") {
        mainLog.warn(`[metals] fetch→backfill: ${r.error || r.reason}`);
      }
    }
    // 直接把当前 historyMap 拼进 response, 彻底消除"response 先到 broadcast 后到"
    // 竞态. renderer 拿到 fetchNow return 时 historyMap 字段已是最新.
    const latestCfg = loadConfig();
    return {
      ok: true,
      quotes: quoteCache,
      fx: fxCache,
      historyMap: latestCfg.historyMap || {},
    };
  });

  ipcMain.handle("metals:quote:state", () => ({
    scheduler: scheduler ? scheduler.getState() : { status: "idle" },
    quotes: quoteCache,
    fx: fxCache,
  }));
}

/**
 * v2.22 Task D1: 接受 opts.onUpdateTray 回调, scheduler onUpdate 时调用.
 * tray 直接读模块级 quoteCache / fxCache (无 IPC 通道), 走 getTraySnapshot().
 */
function startMetalScheduler(opts = {}) {
  if (scheduler) return;
  const onUpdateTray =
    typeof opts.onUpdateTray === "function" ? opts.onUpdateTray : null;
  const getConfig =
    typeof opts.getConfig === "function" ? opts.getConfig : null;
  scheduler = new MetalScheduler({
    httpGet: httpGetAdapter,
    onUpdate: (update) => {
      if (update.quotes || update.errors) {
        quoteCache = {
          data: update.quotes || {},
          errors: update.errors || {},
          fetchedAt: update.fetchedAt,
        };
        if (update.fx && update.fx.CNY_PER_USD) {
          fxCache = {
            rate: update.fx.CNY_PER_USD.rate,
            fetchedAt: update.fetchedAt,
          };
        }
        broadcast("metals:quote:changed", { quotes: quoteCache, fx: fxCache });
        if (onUpdateTray) {
          try {
            onUpdateTray(getTraySnapshot());
          } catch (err) {
            /* noop */
          }
        }
        if (getConfig) {
          try {
            const {
              checkWatchlistMetalUpdates,
              makeWatchlistSendNotification,
            } = require("./watchlist");
            const { getMetalById } = require("../metals/metal-config");
            checkWatchlistMetalUpdates({
              quoteMap: quoteCache.data,
              sendNotification: makeWatchlistSendNotification(getConfig),
              getMetalLabel: (id) => {
                const m = getMetalById(id);
                return (m && m.shortName) || id;
              },
            });
          } catch (err) {
            /* noop — watchlist 是 best-effort */
          }
        }
        const cfg = loadConfig();
        if (!cfg.historyMap || typeof cfg.historyMap !== "object")
          cfg.historyMap = {};
        scheduler.snapshotDailyClose(quoteCache.data, cfg.historyMap);
        saveHistoryMap(cfg.historyMap);
        triggerBackfill().catch(() => {
          /* noop */
        });
      }
      if (update.state) {
        broadcast("metals:quote:state-changed", update.state);
      }
    },
  });
  scheduler.start();
  triggerBackfill().catch(() => {
    /* noop */
  });
}

function stopMetalScheduler() {
  if (scheduler) {
    scheduler.stop();
    scheduler = null;
  }
}

module.exports = {
  registerMetalIpc,
  startMetalScheduler,
  stopMetalScheduler,
  loadConfig,
  getTraySnapshot,
  triggerBackfill,
  saveHistoryMap,
  markBackfilled,
};
