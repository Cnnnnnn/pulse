/**
 * tests/main/ai-usage-alerts.test.js
 */

import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const {
  checkAiUsageAlertsPure,
  checkAiUsageAlerts,
} = requireMain("ai-usage-alerts");
const { todayKey, addDays } = require("../../src/ai-usage/history-series");

describe("checkAiUsageAlertsPure", () => {
  it("无尖峰 → 不通知", () => {
    const today = todayKey();
    const r = checkAiUsageAlertsPure({
      providerId: "minimax",
      historyDays: [{ date: today, percent: 10 }],
      alertPrefs: { enabled: true, lastNotified: {} },
    });
    expect(r.notified).toBe(0);
  });

  it("尖峰 → 通知 + 写 lastNotified", () => {
    const today = todayKey();
    const days = [];
    for (let i = 6; i >= 1; i--) {
      days.push({ date: addDays(today, -i), percent: 20 });
    }
    days.push({ date: today, percent: 85 });
    const r = checkAiUsageAlertsPure({
      providerId: "minimax",
      historyDays: days,
      alertPrefs: { enabled: true, lastNotified: {} },
    });
    expect(r.notified).toBe(1);
    expect(r.nextLastNotified.minimax.date).toBe(today);
    expect(r.nextLastNotified.minimax.percent).toBe(85);
  });
});

describe("checkAiUsageAlerts", () => {
  it("发通知并保存 prefs", async () => {
    const today = todayKey();
    const days = [];
    for (let i = 6; i >= 1; i--) {
      days.push({ date: addDays(today, -i), percent: 15 });
    }
    days.push({ date: today, percent: 90 });
    const saveAlertPrefs = vi.fn();
    const sendNotification = vi.fn();
    const r = await checkAiUsageAlerts({
      providers: ["minimax"],
      loadHistoryProvider: () => ({ days }),
      loadAlertPrefs: () => ({ enabled: true, lastNotified: {} }),
      saveAlertPrefs,
      sendNotification,
      listTasks: async () => ({
        tasks: [{ title: "修 bug", msgCount: 12 }],
      }),
    });
    expect(r.notified).toBe(1);
    expect(saveAlertPrefs).toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("MiniMax") }),
    );
  });
});
