/**
 * src/main/fund-alerts.js
 *
 * I8 v1: 持仓盈亏/收益率越过用户设阈值 → 系统通知.
 *
 * 设计:
 *   - 纯逻辑: checkFundAlertsPure(...) → { checked, notified, items, nextLastNotified }
 *   - 副作用: checkFundAlerts(deps) → 上面 + 写回 lastNotified + 发通知
 *   - 去重: 中性区间清空; 同方向需再越过 2pp 才重复提醒 (ponytail: RE_ALERT_STEP_PCT)
 *   - 静默期: 由 sendNotification 调用方 inQuietHours 处理
 */
"use strict";

const { calcFundMetrics } = require("../../funds/fundCalc");
const { resolveNavSnapshot } = require("../../funds/fund-nav-merge");

const DEFAULT_ALERT_PREFS = {
  enabled: false,
  profitPct: 10,
  lossPct: -5,
  lastNotified: {},
};

/** ponytail: 同方向重复提醒最小间隔 (百分点) */
const RE_ALERT_STEP_PCT = 2;

function normalizeAlertPrefs(raw) {
  const out = {
    enabled: false,
    profitPct: DEFAULT_ALERT_PREFS.profitPct,
    lossPct: DEFAULT_ALERT_PREFS.lossPct,
    lastNotified: {},
  };
  if (!raw || typeof raw !== "object") return out;
  out.enabled = !!raw.enabled;
  const profit = Number(raw.profitPct);
  const loss = Number(raw.lossPct);
  out.profitPct = Number.isFinite(profit)
    ? profit
    : DEFAULT_ALERT_PREFS.profitPct;
  out.lossPct = Number.isFinite(loss) ? loss : DEFAULT_ALERT_PREFS.lossPct;
  if (raw.lastNotified && typeof raw.lastNotified === "object") {
    const ln = {};
    for (const [id, v] of Object.entries(raw.lastNotified)) {
      if (typeof id !== "string" || !v || typeof v !== "object") continue;
      const entry = {};
      if (Number.isFinite(v.profit)) entry.profit = v.profit;
      if (Number.isFinite(v.loss)) entry.loss = v.loss;
      if (Object.keys(entry).length > 0) ln[id] = entry;
    }
    out.lastNotified = ln;
  }
  return out;
}

function fmtMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "¥0.00";
  const sign = v < 0 ? "-" : "";
  return `${sign}¥${Math.abs(v).toFixed(2)}`;
}

function fmtPct(p) {
  const v = Number(p);
  if (!Number.isFinite(v)) return "0.00%";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

/**
 * @param {object} args
 * @param {Array} args.holdings
 * @param {Record<string, object>} args.navMap
 * @param {object} [args.alertPrefs]
 * @param {string} [args.navSource]
 * @returns {{ checked: number, notified: number, items: Array, nextLastNotified: object }}
 */
function checkFundAlertsPure({ holdings, navMap, alertPrefs, navSource }) {
  const prefs = normalizeAlertPrefs(alertPrefs);
  const empty = {
    checked: 0,
    notified: 0,
    items: [],
    nextLastNotified: { ...prefs.lastNotified },
  };
  if (!prefs.enabled) return empty;
  if (!Array.isArray(holdings) || holdings.length === 0) return empty;

  const map = navMap && typeof navMap === "object" ? navMap : {};
  const nextLast = { ...prefs.lastNotified };
  const items = [];

  for (const h of holdings) {
    if (!h || typeof h.id !== "string") continue;
    const code = h.code;
    const snap = code ? map[code] : null;
    const resolved = resolveNavSnapshot(snap, navSource);
    const m = calcFundMetrics(h, resolved);
    if (m.costValue <= 0 || m.marketValue <= 0) continue;

    const prev = nextLast[h.id] || {};
    const profitPct = m.profitPct;

    if (profitPct >= prefs.profitPct) {
      const should =
        prev.profit == null || profitPct >= prev.profit + RE_ALERT_STEP_PCT;
      if (should) {
        items.push({
          holdingId: h.id,
          code: h.code,
          name: h.name || h.code,
          kind: "profit",
          profitPct,
          profit: m.profit,
        });
        nextLast[h.id] = { profit: profitPct };
      }
    } else if (profitPct <= prefs.lossPct) {
      const should =
        prev.loss == null || profitPct <= prev.loss - RE_ALERT_STEP_PCT;
      if (should) {
        items.push({
          holdingId: h.id,
          code: h.code,
          name: h.name || h.code,
          kind: "loss",
          profitPct,
          profit: m.profit,
        });
        nextLast[h.id] = { loss: profitPct };
      }
    } else {
      delete nextLast[h.id];
    }
  }

  return {
    checked: holdings.length,
    notified: items.length,
    items,
    nextLastNotified: nextLast,
  };
}

/**
 * @param {object} deps
 * @param {Array} deps.holdings
 * @param {Record<string, object>} deps.navMap
 * @param {object} [deps.alertPrefs]
 * @param {string} [deps.navSource]
 * @param {Function} [deps.sendNotification]
 * @param {Function} [deps.saveAlertPrefs]
 * @param {object} [deps.log]
 */
function checkFundAlerts(deps) {
  const {
    holdings,
    navMap,
    alertPrefs,
    navSource,
    sendNotification = null,
    saveAlertPrefs = null,
    log = null,
  } = deps || {};

  const out = checkFundAlertsPure({
    holdings,
    navMap,
    alertPrefs,
    navSource,
  });
  if (out.notified === 0) return out;

  if (typeof saveAlertPrefs === "function") {
    try {
      saveAlertPrefs({ lastNotified: out.nextLastNotified });
    } catch (err) {
      if (log && typeof log.warn === "function") {
        log.warn(`[fund-alerts] saveAlertPrefs failed: ${err && err.message}`);
      }
    }
  }

  if (typeof sendNotification === "function") {
    for (const it of out.items) {
      try {
        const isProfit = it.kind === "profit";
        sendNotification({
          title: isProfit ? `💰 ${it.name} 盈利提醒` : `📉 ${it.name} 亏损提醒`,
          body: `收益率 ${fmtPct(it.profitPct)}，盈亏 ${fmtMoney(it.profit)}`,
        });
      } catch (err) {
        if (log && typeof log.warn === "function") {
          log.warn(
            `[fund-alerts] sendNotification failed: ${err && err.message}`,
          );
        }
      }
    }
  }

  return out;
}

module.exports = {
  DEFAULT_ALERT_PREFS,
  RE_ALERT_STEP_PCT,
  normalizeAlertPrefs,
  checkFundAlertsPure,
  checkFundAlerts,
  fmtMoney,
  fmtPct,
};
