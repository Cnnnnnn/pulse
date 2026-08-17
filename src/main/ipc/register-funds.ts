// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type { IpcMain } from "electron";
const { ipcMain }: { ipcMain: IpcMain } = require("electron");
import { HttpClient } from "../http-client";
import * as fundStore from "../funds/fund-store";
import * as fundHistoryStore from "../funds/fund-history-store";
const _hs: any = fundHistoryStore;
const _fs: any = fundStore;
import { searchFunds } from "../../funds/fund-search";
import { fetchFundNavBatch } from "../../funds/fund-fetcher";
import { pickEffectiveNavNumber } from "../../funds/fund-nav-merge";
import { fetchFundNavHistory, fetchIndexHistory } from "../../funds/fund-nav-history";
import * as fundNavHistoryStore from "../funds/fund-history-store";
import type { IpcChannelMap } from "../../shared/ipc-contracts";

export function registerFundsHandlers(ctx: any) {
  const { safeHandle, threwResponse, fundScheduler } = ctx;

  safeHandle("funds:list", () => ({ ok: true, ..._fs.loadAll() }), {
    onError: (err: any) => threwResponse(err, { holdings: [], deletedIds: [] }),
  });

  safeHandle(
    "funds:add",
    (_event: unknown, input: IpcChannelMap["funds:add"]["args"][0]) => {
      const out = _fs.add(input);
      const sched = fundScheduler();
      if (sched && out.holding) {
        sched.fetchNow().catch(() => {});
      }
      return { ok: true, holding: out.holding, holdings: out.all.holdings };
    },
    {
      logIf: (err: any) => !(err && err.name === "ValidationError"),
      onError: (err: any) => {
        if (err && err.name === "ValidationError") {
          return { ok: false, reason: "validation", error: err.message };
        }
        return threwResponse(err);
      },
    },
  );

  safeHandle(
    "funds:update",
    (
      _event: unknown,
      id: IpcChannelMap["funds:update"]["args"][0],
      patch: IpcChannelMap["funds:update"]["args"][1],
    ) => {
      const out = _fs.update(id, patch);
      if (!out) return { ok: false, reason: "not_found" };
      return { ok: true, holding: out.holding, holdings: out.all.holdings };
    },
    {
      logIf: (err: any) => !(err && err.name === "ValidationError"),
      onError: (err: any) => {
        if (err && err.name === "ValidationError") {
          return { ok: false, reason: "validation", error: err.message };
        }
        return threwResponse(err);
      },
    },
  );

  safeHandle(
    "funds:remove",
    (_event: unknown, id: IpcChannelMap["funds:remove"]["args"][0]) => {
    const out = _fs.remove(id);
    if (!out.ok) return out;
    const sched = fundScheduler();
    if (sched) {
      sched.fetchNow().catch(() => {});
    }
    return out;
    },
  );

  safeHandle(
    "funds:restore",
    (_event: unknown, id: IpcChannelMap["funds:restore"]["args"][0]) => {
    const out = _fs.restore(id);
    return out.ok ? { ok: true, holding: out.holding } : out;
    },
  );

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

  safeHandle(
    "funds:nav:fetch-codes",
    async (
      _event: unknown,
      codes: IpcChannelMap["funds:nav:fetch-codes"]["args"][0],
    ) => {
    const list = [
      ...new Set(
        (Array.isArray(codes) ? codes : [])
          .map((c: any) => String(c || "").trim())
          .filter((c: any) => /^\d{6}$/.test(c)),
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
    },
  );

  safeHandle(
    "funds:search",
    async (
      _event: unknown,
      query: IpcChannelMap["funds:search"]["args"][0],
    ) => {
      const httpClient = new HttpClient({ timeout: 6000, maxRetries: 0 });
      const results = await searchFunds(query, httpClient);
      return { ok: true, results };
    },
    { onError: (err: any) => threwResponse(err, { results: [] }) },
  );

  safeHandle(
    "funds:history:list",
    () => {
      const dailySnapshots = _hs.loadSnapshots();
      return { ok: true, dailySnapshots };
    },
    { onError: (err: any) => threwResponse(err, { dailySnapshots: [] }) },
  );

  // 2026-07-15: 缓存命中必须「条数 >= 请求天数」
  //   ponytail: 旧逻辑「有缓存就返回」会把历史上 30 天短缓存永久钉死, 用户切 3M/1Y 无效
  safeHandle(
    "funds:nav:history",
    async (
      _event: unknown,
      code: IpcChannelMap["funds:nav:history"]["args"][0],
      opts: IpcChannelMap["funds:nav:history"]["args"][1],
    ) => {
    const requestedDays = Math.max(1, Number(opts && opts.days) || 365);
    const cached = _hs.loadNavHistory(code);
    if (_hs.isNavCacheSufficient(cached, requestedDays)) {
      return { ok: true, series: cached, cached: true };
    }
    const httpClient = new HttpClient({ timeout: 8000, maxRetries: 0 });
    const out = await fetchFundNavHistory(code, httpClient, { days: requestedDays });
    if (out.ok) {
      // 新拉的更长才覆盖; 基金上市不足时接口可能返回更短, 保留较长的那份
      const series =
        out.series.length >= cached.length ? out.series : cached;
      _hs.saveNavHistory(code, series);
      return { ok: true, series, reason: null, cached: false };
    }
    if (cached.length) return { ok: true, series: cached, cached: true, reason: out.reason };
    return out;
    },
  );

  // T-C1a: 基准指数历史 (沪深300 等). 先读缓存, miss 再拉取并写回.
  safeHandle(
    "funds:index:history",
    async (
      _event: unknown,
      symbol: IpcChannelMap["funds:index:history"]["args"][0],
      opts: IpcChannelMap["funds:index:history"]["args"][1],
    ) => {
    const requestedDays = Math.max(1, Number(opts && opts.days) || 365);
    const cached = _hs.loadIndexHistory(symbol);
    if (_hs.isNavCacheSufficient(cached, requestedDays)) {
      return { ok: true, series: cached, cached: true };
    }
    const httpClient = new HttpClient({ timeout: 8000, maxRetries: 0 });
    const out = await fetchIndexHistory(symbol, httpClient, { days: requestedDays });
    if (out.ok) {
      const series =
        out.series.length >= cached.length ? out.series : cached;
      _hs.saveIndexHistory(symbol, series);
      return { ok: true, series, reason: null, cached: false };
    }
    if (cached.length) return { ok: true, series: cached, cached: true, reason: out.reason };
    return out;
    },
  );

  safeHandle(
    "funds:set-nav-source",
    (_event: unknown, source: IpcChannelMap["funds:set-nav-source"]["args"][0]) => {
    const all = _fs.setNavSource(source);
    return { ok: true, navSource: all.navSource };
    },
  );

  safeHandle(
    "funds:backfill",
    (_event: unknown, code: IpcChannelMap["funds:backfill"]["args"][0]) => {
    const sched = fundScheduler();
    const cache =
      sched && sched.getLastNavForCode ? sched.getLastNavForCode(code) : null;
    const { navSource } = _fs.loadAll();
    const nav = pickEffectiveNavNumber(cache, navSource);
    if (!nav) {
      return { ok: false, reason: "no_nav_cached" };
    }
    return _fs.backfillFromNav(code, nav);
    },
  );

  safeHandle("funds:alert-prefs:get", () => {
    const { alertPrefs } = _fs.loadAll();
    return { ok: true, alertPrefs };
  });

  safeHandle(
    "funds:alert-prefs:set",
    (
      _event: unknown,
      patch: IpcChannelMap["funds:alert-prefs:set"]["args"][0],
    ) => {
    const all = _fs.setAlertPrefs(patch || {});
    return { ok: true, alertPrefs: all.alertPrefs };
    },
  );
}

module.exports = { registerFundsHandlers };
