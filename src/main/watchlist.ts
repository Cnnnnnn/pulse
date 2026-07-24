/**
 * src/main/watchlist.ts
 *
 * I2 v1: pinned app 升级通知
 * I2 v2: + fund 净值异动 + keyword 热搜/新闻匹配
 *
 * Spec: docs/superpowers/specs/2026-06-23-i2-watchlist-design.md
 */

const { Notification: ElectronNotification } = require("electron");
const stateStore = require("./state-store.ts");
const { mainLog } = require("./log.ts");
const { inQuietHours } = require("./notification-policy.ts");
const { pickEffectiveNavNumber } = require("../funds/fund-nav-merge");

/** ponytail: 基金净值相对上次通知变动 ≥ 此值才再提醒 */
export const FUND_NAV_CHANGE_PCT = 2;
/** ponytail: 贵金属现货价相对上次通知变动 ≥ 此值才再提醒 */
export const METAL_PRICE_CHANGE_PCT = 2;

type WatchItem = {
  type?: string;
  ref?: string;
  appName?: string;
  lastNotifiedVersion?: string;
  latestVersion?: string;
  lastNotifiedNav?: number;
  lastNotifiedPrice?: number;
  lastMatchKey?: string;
};

function appRef(w: WatchItem | null | undefined): string | null {
  if (!w) return null;
  if (w.type === "app" || !w.type) return w.ref || w.appName || null;
  return null;
}

function mergeWatchlistPatches(watchlist: WatchItem[], patches: any[]): WatchItem[] {
  const byKey = new Map(
    patches.map((p) => [stateStore.watchlistItemKey(p), p]),
  );
  return watchlist.map((w) => {
    const patch = byKey.get(stateStore.watchlistItemKey(w));
    return patch ? { ...w, ...patch } : w;
  });
}

type PersistDeps = {
  watchlist: WatchItem[];
  saveWatchlist?: (w: WatchItem[]) => void;
  sendNotification?: ((n: { title: string; body: string }) => void) | null;
  log?: any;
};

function persistAndNotify(deps: PersistDeps, out: any, notifyFn: (it: any) => { title: string; body: string }) {
  const {
    watchlist,
    saveWatchlist = stateStore.saveWatchlist,
    sendNotification = null,
    log = mainLog,
  } = deps;
  const hasWork =
    (out.items && out.items.length > 0) ||
    (out.baselines && out.baselines.length > 0);
  if (!hasWork) return out;

  let updated = watchlist;
  if (out.baselines && out.baselines.length > 0) {
    updated = mergeWatchlistPatches(updated, out.baselines);
  }
  if (out.items && out.items.length > 0) {
    updated = mergeWatchlistPatches(updated, out.items);
  }

  try {
    saveWatchlist(updated);
  } catch (err: any) {
    if (log && typeof log.warn === "function") {
      log.warn(`[watchlist] saveWatchlist failed: ${err && err.message}`);
    }
  }

  if (typeof sendNotification === "function" && out.items) {
    for (const it of out.items) {
      try {
        sendNotification(notifyFn(it));
      } catch (err: any) {
        if (log && typeof log.warn === "function") {
          log.warn(
            `[watchlist] sendNotification failed: ${err && err.message}`,
          );
        }
      }
    }
  }
  return out;
}

/**
 * @param getConfig
 * @returns
 */
export function makeWatchlistSendNotification(getConfig?: () => any) {
  return (n: { title: string; body: string }) => {
    const cfg = typeof getConfig === "function" ? getConfig() || {} : {};
    const notif = cfg.notifications || {};
    if (
      notif.quiet_hours_start &&
      notif.quiet_hours_end &&
      inQuietHours(new Date(), notif.quiet_hours_start, notif.quiet_hours_end)
    ) {
      return;
    }
    if (
      !ElectronNotification.isSupported ||
      !ElectronNotification.isSupported()
    ) {
      return;
    }
    new ElectronNotification({
      title: n.title,
      body: n.body,
      silent: false,
    }).show();
  };
}

export type CheckResult = {
  checked: number;
  notified: number;
  items: any[];
  baselines: any[];
};

/**
 * @param results
 * @param watchlist
 */
export function checkWatchlistUpdatesPure(results: any[], watchlist: WatchItem[]): CheckResult {
  if (!Array.isArray(watchlist) || watchlist.length === 0) {
    return { checked: 0, notified: 0, items: [], baselines: [] };
  }
  if (!Array.isArray(results)) {
    return { checked: 0, notified: 0, items: [], baselines: [] };
  }
  const byName = new Map<string, any>();
  for (const r of results) {
    if (r && typeof r.name === "string") byName.set(r.name, r);
  }
  const items: any[] = [];
  let checked = 0;
  for (const w of watchlist) {
    if (w.type !== "app") continue;
    checked++;
    const name = appRef(w);
    if (!name) continue;
    const r = byName.get(name);
    if (!r || !r.hasUpdate) continue;
    if (w.lastNotifiedVersion === r.latestVersion) continue;
    items.push({
      type: "app",
      ref: name,
      lastNotifiedVersion: r.latestVersion,
      latestVersion: r.latestVersion,
    });
  }
  return { checked, notified: items.length, items, baselines: [] };
}

/**
 * @param args
 * @param args.watchlist
 * @param args.navMap
 * @param args.navSource
 */
export function checkWatchlistFundUpdatesPure({ watchlist, navMap, navSource }: { watchlist: WatchItem[]; navMap: Record<string, any>; navSource?: string }): CheckResult {
  if (!Array.isArray(watchlist) || watchlist.length === 0) {
    return { checked: 0, notified: 0, items: [], baselines: [] };
  }
  const map = navMap && typeof navMap === "object" ? navMap : {};
  const items: any[] = [];
  const baselines: any[] = [];
  let checked = 0;

  for (const w of watchlist) {
    if (w.type !== "fund") continue;
    checked++;
    const code = w.ref;
    const snap = code ? map[code] : null;
    const nav = pickEffectiveNavNumber(snap, navSource);
    if (!nav || nav <= 0) continue;

    if (w.lastNotifiedNav == null) {
      baselines.push({ type: "fund", ref: code, lastNotifiedNav: nav });
      continue;
    }

    const changePct =
      (Math.abs(nav - w.lastNotifiedNav) / w.lastNotifiedNav) * 100;
    if (changePct < FUND_NAV_CHANGE_PCT) continue;

    const dir = nav >= w.lastNotifiedNav ? "涨" : "跌";
    items.push({
      type: "fund",
      ref: code,
      lastNotifiedNav: nav,
      nav,
      changePct,
      dir,
    });
  }

  return { checked, notified: items.length, items, baselines };
}

/**
 * @param watchlist
 * @param headlines
 */
export function checkWatchlistKeywordUpdatesPure(watchlist: WatchItem[], headlines: any[]): CheckResult {
  if (!Array.isArray(watchlist) || watchlist.length === 0) {
    return { checked: 0, notified: 0, items: [], baselines: [] };
  }
  if (!Array.isArray(headlines)) {
    return { checked: 0, notified: 0, items: [], baselines: [] };
  }
  const items: any[] = [];
  const baselines: any[] = [];
  let checked = 0;

  for (const w of watchlist) {
    if (w.type !== "keyword") continue;
    checked++;
    const kw = w.ref;
    if (!kw) continue;
    const lower = kw.toLowerCase();
    const hit = headlines.find(
      (h) =>
        h &&
        typeof h.title === "string" &&
        h.title.toLowerCase().includes(lower),
    );
    if (!hit) continue;

    if (w.lastMatchKey == null) {
      baselines.push({ type: "keyword", ref: kw, lastMatchKey: hit.title });
      continue;
    }
    if (w.lastMatchKey === hit.title) continue;

    items.push({
      type: "keyword",
      ref: kw,
      lastMatchKey: hit.title,
      matchTitle: hit.title,
    });
  }

  return { checked, notified: items.length, items, baselines };
}

/**
 * @param args
 * @param args.watchlist
 * @param args.quoteMap
 */
export function checkWatchlistMetalUpdatesPure({ watchlist, quoteMap }: { watchlist: WatchItem[]; quoteMap: Record<string, { price: number }> }): CheckResult {
  if (!Array.isArray(watchlist) || watchlist.length === 0) {
    return { checked: 0, notified: 0, items: [], baselines: [] };
  }
  const map = quoteMap && typeof quoteMap === "object" ? quoteMap : {};
  const items: any[] = [];
  const baselines: any[] = [];
  let checked = 0;

  for (const w of watchlist) {
    if (w.type !== "metal") continue;
    checked++;
    const id = w.ref;
    const quote = id ? map[id] : null;
    const price = quote && Number.isFinite(quote.price) ? quote.price : null;
    if (!price || price <= 0) continue;

    if (w.lastNotifiedPrice == null) {
      baselines.push({ type: "metal", ref: id, lastNotifiedPrice: price });
      continue;
    }

    const changePct =
      (Math.abs(price - w.lastNotifiedPrice) / w.lastNotifiedPrice) * 100;
    if (changePct < METAL_PRICE_CHANGE_PCT) continue;

    const dir = price >= w.lastNotifiedPrice ? "涨" : "跌";
    items.push({
      type: "metal",
      ref: id,
      lastNotifiedPrice: price,
      price,
      changePct,
      dir,
    });
  }

  return { checked, notified: items.length, items, baselines };
}

type CheckDeps = {
  watchlist?: WatchItem[];
  saveWatchlist?: (w: WatchItem[]) => void;
  sendNotification?: ((n: any) => void) | null;
  log?: any;
  results?: any[];
  navMap?: Record<string, any>;
  navSource?: string;
  headlines?: any[];
  quoteMap?: Record<string, { price: number }>;
  getMetalLabel?: ((id: string) => string) | null;
};

export function checkWatchlistUpdates(deps: CheckDeps = {}): CheckResult {
  const {
    results,
    watchlist = stateStore.loadWatchlist(),
    sendNotification = null,
    saveWatchlist = stateStore.saveWatchlist,
    log = mainLog,
  } = deps;
  const out = checkWatchlistUpdatesPure(results || [], watchlist);
  if (out.notified === 0 && out.baselines.length === 0) return out;
  return persistAndNotify(
    { watchlist, saveWatchlist, sendNotification, log },
    out,
    (it) => ({
      title: `⭐ ${it.ref} 升级`,
      body: `新版本 ${it.latestVersion}`,
    }),
  );
}

export function checkWatchlistFundUpdates(deps: CheckDeps = {}): CheckResult {
  const {
    navMap,
    navSource,
    watchlist = stateStore.loadWatchlist(),
    sendNotification = null,
    saveWatchlist = stateStore.saveWatchlist,
    log = mainLog,
  } = deps;
  const out = checkWatchlistFundUpdatesPure({ watchlist, navMap: navMap || {}, navSource });
  if (out.notified === 0 && out.baselines.length === 0) return out;
  return persistAndNotify(
    { watchlist, saveWatchlist, sendNotification, log },
    out,
    (it) => ({
      title: `💰 基金 ${it.ref} 净值${it.dir}`,
      body: `现价 ${Number(it.nav).toFixed(4)}，较上次提醒变动 ${it.changePct.toFixed(2)}%`,
    }),
  );
}

export function checkWatchlistKeywordUpdates(deps: CheckDeps = {}): CheckResult {
  const {
    headlines,
    watchlist = stateStore.loadWatchlist(),
    sendNotification = null,
    saveWatchlist = stateStore.saveWatchlist,
    log = mainLog,
  } = deps;
  const out = checkWatchlistKeywordUpdatesPure(watchlist, headlines || []);
  if (out.notified === 0 && out.baselines.length === 0) return out;
  return persistAndNotify(
    { watchlist, saveWatchlist, sendNotification, log },
    out,
    (it) => ({
      title: `🔍 关键词「${it.ref}」`,
      body: it.matchTitle,
    }),
  );
}

export function checkWatchlistMetalUpdates(deps: CheckDeps = {}): CheckResult {
  const {
    quoteMap,
    watchlist = stateStore.loadWatchlist(),
    sendNotification = null,
    saveWatchlist = stateStore.saveWatchlist,
    log = mainLog,
    getMetalLabel = null,
  } = deps;
  const out = checkWatchlistMetalUpdatesPure({ watchlist, quoteMap: quoteMap || {} });
  if (out.notified === 0 && out.baselines.length === 0) return out;
  return persistAndNotify(
    { watchlist, saveWatchlist, sendNotification, log },
    out,
    (it) => {
      const name =
        typeof getMetalLabel === "function"
          ? getMetalLabel(it.ref) || it.ref
          : it.ref;
      return {
        title: `🥇 ${name} 价格${it.dir}`,
        body: `现价 ${Number(it.price).toFixed(2)}，较上次提醒变动 ${it.changePct.toFixed(2)}%`,
      };
    },
  );
}

module.exports = {
  FUND_NAV_CHANGE_PCT,
  METAL_PRICE_CHANGE_PCT,
  makeWatchlistSendNotification,
  checkWatchlistUpdatesPure,
  checkWatchlistFundUpdatesPure,
  checkWatchlistKeywordUpdatesPure,
  checkWatchlistMetalUpdatesPure,
  checkWatchlistUpdates,
  checkWatchlistFundUpdates,
  checkWatchlistKeywordUpdates,
  checkWatchlistMetalUpdates,
};