/**
 * src/main/funds/fund-alerts.ts
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

export const DEFAULT_ALERT_PREFS = {
  enabled: false,
  profitPct: 10,
  lossPct: -5,
  lastNotified: {},
} as const;

/** ponytail: 同方向重复提醒最小间隔 (百分点) */
export const RE_ALERT_STEP_PCT = 2;

type AlertPrefs = {
  enabled: boolean;
  profitPct: number;
  lossPct: number;
  lastNotified: Record<string, { profit?: number; loss?: number }>;
};

export function normalizeAlertPrefs(raw: unknown): AlertPrefs {
  const out: AlertPrefs = {
    enabled: false,
    profitPct: DEFAULT_ALERT_PREFS.profitPct,
    lossPct: DEFAULT_ALERT_PREFS.lossPct,
    lastNotified: {},
  };
  if (!raw || typeof raw !== "object") return out;
  out.enabled = !!(raw as any).enabled;
  const profit = Number((raw as any).profitPct);
  const loss = Number((raw as any).lossPct);
  out.profitPct = Number.isFinite(profit)
    ? profit
    : DEFAULT_ALERT_PREFS.profitPct;
  out.lossPct = Number.isFinite(loss) ? loss : DEFAULT_ALERT_PREFS.lossPct;
  const rawLn = (raw as any).lastNotified;
  if (rawLn && typeof rawLn === "object") {
    const ln: Record<string, { profit?: number; loss?: number }> = {};
    for (const [id, v] of Object.entries(rawLn) as [string, any][]) {
      if (typeof id !== "string" || !v || typeof v !== "object") continue;
      const entry: { profit?: number; loss?: number } = {};
      if (Number.isFinite(v.profit)) entry.profit = v.profit;
      if (Number.isFinite(v.loss)) entry.loss = v.loss;
      if (Object.keys(entry).length > 0) ln[id] = entry;
    }
    out.lastNotified = ln;
  }
  return out;
}

function fmtMoney(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "¥0.00";
  const sign = v < 0 ? "-" : "";
  return `${sign}¥${Math.abs(v).toFixed(2)}`;
}

function fmtPct(p: unknown): string {
  const v = Number(p);
  if (!Number.isFinite(v)) return "0.00%";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

export type AlertItem = {
  holdingId: string;
  code: string;
  name: string;
  kind: "profit" | "loss";
  profitPct: number;
  profit: number;
};

export type CheckResult = {
  checked: number;
  notified: number;
  items: AlertItem[];
  nextLastNotified: Record<string, { profit?: number; loss?: number }>;
};

export function checkFundAlertsPure({ holdings, navMap, alertPrefs, navSource }: any): CheckResult {
  const prefs = normalizeAlertPrefs(alertPrefs);
  const empty: CheckResult = {
    checked: 0,
    notified: 0,
    items: [],
    nextLastNotified: { ...prefs.lastNotified },
  };
  if (!prefs.enabled) return empty;
  if (!Array.isArray(holdings) || holdings.length === 0) return empty;

  const map = navMap && typeof navMap === "object" ? navMap : {};
  const nextLast: Record<string, { profit?: number; loss?: number }> = { ...prefs.lastNotified };
  const items: AlertItem[] = [];

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

type CheckFundAlertsDeps = {
  holdings?: any[];
  navMap?: Record<string, any>;
  alertPrefs?: any;
  navSource?: string;
  sendNotification?: ((n: { title: string; body: string }) => void) | null;
  saveAlertPrefs?: (prefs: any) => void;
  log?: any;
};

export function checkFundAlerts(deps: CheckFundAlertsDeps = {}): CheckResult {
  const {
    holdings,
    navMap,
    alertPrefs,
    navSource,
    sendNotification = null,
    saveAlertPrefs = null,
    log = null,
  } = deps;

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
    } catch (err: any) {
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
      } catch (err: any) {
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
} satisfies typeof module.exports;
