/**
 * tests/main/fund-alerts.test.js
 *
 * 2026-06-24: I8 v1 — 基金盈亏阈值提醒.
 */

import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

const {
  checkFundAlertsPure,
  checkFundAlerts,
  normalizeAlertPrefs,
  RE_ALERT_STEP_PCT,
} = requireMain("funds/fund-alerts");

const holding = {
  id: "h1",
  code: "000001",
  name: "华夏成长",
  shares: 1000,
  costNav: 1.0,
};

const navProfit = {
  nav: 1.15,
  dayChange: 0.01,
};

const navLoss = {
  nav: 0.9,
  dayChange: -0.01,
};

const prefsEnabled = {
  enabled: true,
  profitPct: 10,
  lossPct: -5,
  lastNotified: {},
};

describe("normalizeAlertPrefs", () => {
  it("默认关闭 + 10 / -5", () => {
    const p = normalizeAlertPrefs(null);
    expect(p.enabled).toBe(false);
    expect(p.profitPct).toBe(10);
    expect(p.lossPct).toBe(-5);
  });
});

describe("checkFundAlertsPure", () => {
  it("未启用 → 0 notified", () => {
    const r = checkFundAlertsPure({
      holdings: [holding],
      navMap: { "000001": navProfit },
      alertPrefs: { enabled: false, profitPct: 10, lossPct: -5 },
    });
    expect(r.notified).toBe(0);
  });

  it("盈利越过阈值 → 触发", () => {
    const r = checkFundAlertsPure({
      holdings: [holding],
      navMap: { "000001": navProfit },
      alertPrefs: prefsEnabled,
    });
    expect(r.notified).toBe(1);
    expect(r.items[0]).toMatchObject({
      holdingId: "h1",
      kind: "profit",
    });
    expect(r.nextLastNotified.h1.profit).toBeCloseTo(15, 1);
  });

  it("亏损越过阈值 → 触发", () => {
    const r = checkFundAlertsPure({
      holdings: [holding],
      navMap: { "000001": navLoss },
      alertPrefs: prefsEnabled,
    });
    expect(r.notified).toBe(1);
    expect(r.items[0].kind).toBe("loss");
  });

  it("中性区间 → 清空 lastNotified", () => {
    const r = checkFundAlertsPure({
      holdings: [holding],
      navMap: { "000001": { nav: 1.02, dayChange: 0 } },
      alertPrefs: {
        ...prefsEnabled,
        lastNotified: { h1: { profit: 12 } },
      },
    });
    expect(r.notified).toBe(0);
    expect(r.nextLastNotified.h1).toBeUndefined();
  });

  it("已提醒盈利后小幅波动 → 跳过", () => {
    const r = checkFundAlertsPure({
      holdings: [holding],
      navMap: { "000001": { nav: 1.12, dayChange: 0 } },
      alertPrefs: {
        ...prefsEnabled,
        lastNotified: { h1: { profit: 12 } },
      },
    });
    expect(r.notified).toBe(0);
  });

  it(`盈利再涨 ${RE_ALERT_STEP_PCT}pp → 再提醒`, () => {
    const r = checkFundAlertsPure({
      holdings: [holding],
      navMap: { "000001": navProfit },
      alertPrefs: {
        ...prefsEnabled,
        lastNotified: { h1: { profit: 12 } },
      },
    });
    expect(r.notified).toBe(1);
    expect(r.nextLastNotified.h1.profit).toBeCloseTo(15, 1);
  });

  it("无净值 → 跳过", () => {
    const r = checkFundAlertsPure({
      holdings: [holding],
      navMap: {},
      alertPrefs: prefsEnabled,
    });
    expect(r.notified).toBe(0);
  });
});

describe("checkFundAlerts (副作用)", () => {
  it("有通知 → saveAlertPrefs + sendNotification", () => {
    const saveAlertPrefs = vi.fn();
    const sendNotification = vi.fn();
    checkFundAlerts({
      holdings: [holding],
      navMap: { "000001": navProfit },
      alertPrefs: prefsEnabled,
      saveAlertPrefs,
      sendNotification,
    });
    expect(saveAlertPrefs).toHaveBeenCalledOnce();
    expect(sendNotification).toHaveBeenCalledOnce();
    expect(sendNotification.mock.calls[0][0].title).toContain("盈利提醒");
  });

  it("无触发 → 不写盘不发通知", () => {
    const saveAlertPrefs = vi.fn();
    const sendNotification = vi.fn();
    checkFundAlerts({
      holdings: [holding],
      navMap: { "000001": { nav: 1.02, dayChange: 0 } },
      alertPrefs: prefsEnabled,
      saveAlertPrefs,
      sendNotification,
    });
    expect(saveAlertPrefs).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
