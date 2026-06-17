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

const { ipcMain, webContents } = require('electron');
const { httpGet: httpClientGet } = require('./http-client.js');
const { MetalScheduler } = require('../metals/metal-scheduler.js');
const stateStore = require('./state-store.js');

const DEFAULT_CONFIG = {
  watchedIds: ['XAU', 'XAG', 'AU9999', 'AG9999'],
  holdings: { XAU: null, XAG: null, AU9999: null, AG9999: null },
  deletedIds: [],
};

let scheduler = null;
let quoteCache = { data: {}, errors: {}, fetchedAt: null };
let fxCache = { rate: null, fetchedAt: null };

/**
 * Adapter: Pulse's httpClient returns { status, body, headers, error? }.
 * The metals fetchers expect (url, headers) => string|Buffer.
 * This adapter wraps the status check + JSON passthrough.
 */
function httpGetAdapter(url, headers) {
  return httpClientGet(url, { headers, timeoutMs: 8000 }).then((r) => {
    if (r.error) throw new Error(r.error);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return r.body; // string for JSON, Buffer for binary
  });
}

function loadConfig() {
  const state = stateStore.load();
  const stored = (state && state.metals) || {};
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    holdings: { ...DEFAULT_CONFIG.holdings, ...(stored.holdings || {}) },
  };
}

function persistConfig(metalsPayload) {
  const statePath = stateStore.defaultPath();
  const existing = stateStore.load(statePath);
  const nextState = Object.assign({}, existing || {}, {
    v: (existing && existing.v) || stateStore.SCHEMA_VERSION,
    ts: Date.now(),
    metals: metalsPayload,
  });
  stateStore.writeAtomic(statePath, nextState);
  return metalsPayload;
}

function saveConfig(patch) {
  const current = loadConfig();
  const next = { ...current, ...patch };
  return persistConfig(next);
}

function broadcast(channel, payload) {
  for (const wc of webContents.getAllWebContents()) {
    wc.send(channel, payload);
  }
}

function registerMetalIpc() {
  ipcMain.handle('metals:list', () => loadConfig());

  ipcMain.handle('metals:config:update', (_evt, { patch }) => saveConfig(patch));

  ipcMain.handle('metals:holding:upsert', (_evt, { id, holding }) => {
    const cfg = loadConfig();
    cfg.holdings[id] = holding;
    persistConfig(cfg);
    return cfg;
  });

  ipcMain.handle('metals:holding:remove', (_evt, { id }) => {
    const cfg = loadConfig();
    cfg.holdings[id] = null;
    persistConfig(cfg);
    return cfg;
  });

  ipcMain.handle('metals:quote:fetch', async () => {
    if (!scheduler) return { ok: false, error: 'scheduler not started' };
    await scheduler.fetchNow();
    return { ok: true, quotes: quoteCache, fx: fxCache };
  });

  ipcMain.handle('metals:quote:state', () => ({
    scheduler: scheduler ? scheduler.getState() : { status: 'idle' },
    quotes: quoteCache,
    fx: fxCache,
  }));
}

function startMetalScheduler() {
  if (scheduler) return;
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
        broadcast('metals:quote:changed', { quotes: quoteCache, fx: fxCache });
      }
      if (update.state) {
        broadcast('metals:quote:state', update.state);
      }
    },
  });
  scheduler.start();
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
};