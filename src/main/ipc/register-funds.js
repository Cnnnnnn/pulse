const { ipcMain } = require("electron");
const { HttpClient } = require("../http-client");
const fundStore = require("../fund-store");
const fundHistoryStore = require("../fund-history-store");
const { searchFunds } = require("../../funds/fund-search");
const { fetchFundNavBatch } = require("../../funds/fund-fetcher");
const { pickEffectiveNavNumber } = require("../../funds/fund-nav-merge");

function registerFundsHandlers(ctx) {
  const { safeHandle, threwResponse, fundScheduler } = ctx;

  safeHandle("funds:list", () => ({ ok: true, ...fundStore.loadAll() }), {
    onError: (err) => threwResponse(err, { holdings: [], deletedIds: [] }),
  });

  safeHandle(
    "funds:add",
    (_event, input) => {
      const out = fundStore.add(input);
      const sched = fundScheduler();
      if (sched && out.holding) {
        sched.fetchNow().catch(() => {});
      }
      return { ok: true, holding: out.holding, holdings: out.all.holdings };
    },
    {
      logIf: (err) => !(err && err.name === "ValidationError"),
      onError: (err) => {
        if (err && err.name === "ValidationError") {
          return { ok: false, reason: "validation", error: err.message };
        }
        return threwResponse(err);
      },
    },
  );

  safeHandle(
    "funds:update",
    (_event, id, patch) => {
      const out = fundStore.update(id, patch);
      if (!out) return { ok: false, reason: "not_found" };
      return { ok: true, holding: out.holding, holdings: out.all.holdings };
    },
    {
      logIf: (err) => !(err && err.name === "ValidationError"),
      onError: (err) => {
        if (err && err.name === "ValidationError") {
          return { ok: false, reason: "validation", error: err.message };
        }
        return threwResponse(err);
      },
    },
  );

  safeHandle("funds:remove", (_event, id) => {
    const out = fundStore.remove(id);
    if (!out.ok) return out;
    const sched = fundScheduler();
    if (sched) {
      sched.fetchNow().catch(() => {});
    }
    return out;
  });

  safeHandle("funds:restore", (_event, id) => {
    const out = fundStore.restore(id);
    return out.ok ? { ok: true, holding: out.holding } : out;
  });

  ipcMain.handle("funds:nav:fetch", async () => {
    const sched = fundScheduler();
    if (!sched) return { ok: false, reason: "no_scheduler" };
    return sched.fetchNow();
  });

  ipcMain.handle("funds:nav:state", () => {
    const sched = fundScheduler();
    if (!sched)
      return {
        ok: false,
        reason: "no_scheduler",
        status: "closed",
        lastFetch: null,
        nextFetch: null,
      };
    return { ok: true, ...sched.getState() };
  });

  safeHandle("funds:nav:fetch-codes", async (_event, codes) => {
    const list = [
      ...new Set(
        (Array.isArray(codes) ? codes : [])
          .map((c) => String(c || "").trim())
          .filter((c) => /^\d{6}$/.test(c)),
      ),
    ];
    if (list.length === 0) return { ok: false, reason: "invalid_codes" };
    const httpClient = new HttpClient({ timeout: 5000, maxRetries: 0 });
    const out = await fetchFundNavBatch(list, httpClient, {
      concurrency: 4,
      timeoutMs: 5000,
    });
    const sched = fundScheduler();
    if (sched && sched.cacheNavResults) sched.cacheNavResults(out.results);
    return { ok: true, ...out };
  });

  safeHandle(
    "funds:search",
    async (_event, query) => {
      const httpClient = new HttpClient({ timeout: 6000, maxRetries: 0 });
      const results = await searchFunds(query, httpClient);
      return { ok: true, results };
    },
    { onError: (err) => threwResponse(err, { results: [] }) },
  );

  safeHandle(
    "funds:history:list",
    () => {
      const dailySnapshots = fundHistoryStore.loadSnapshots();
      return { ok: true, dailySnapshots };
    },
    { onError: (err) => threwResponse(err, { dailySnapshots: [] }) },
  );

  safeHandle("funds:set-nav-source", (_event, source) => {
    const all = fundStore.setNavSource(source);
    return { ok: true, navSource: all.navSource };
  });

  safeHandle("funds:backfill", (_event, code) => {
    const sched = fundScheduler();
    const cache =
      sched && sched.getLastNavForCode ? sched.getLastNavForCode(code) : null;
    const { navSource } = fundStore.loadAll();
    const nav = pickEffectiveNavNumber(cache, navSource);
    if (!nav) {
      return { ok: false, reason: "no_nav_cached" };
    }
    return fundStore.backfillFromNav(code, nav);
  });

  safeHandle("funds:alert-prefs:get", () => {
    const { alertPrefs } = fundStore.loadAll();
    return { ok: true, alertPrefs };
  });

  safeHandle("funds:alert-prefs:set", (_event, patch) => {
    const all = fundStore.setAlertPrefs(patch || {});
    return { ok: true, alertPrefs: all.alertPrefs };
  });
}

module.exports = { registerFundsHandlers };
