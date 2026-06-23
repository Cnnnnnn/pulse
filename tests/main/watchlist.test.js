/**
 * tests/main/watchlist.test.js
 *
 * 2026-06-23: I2 v1 — pure checker + side-effect checker.
 */

import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const {
  checkWatchlistUpdatesPure,
  checkWatchlistUpdates,
} = require("../../src/main/watchlist");

describe("checkWatchlistUpdatesPure", () => {
  it("空 watchlist → 0/0/[]", () => {
    expect(checkWatchlistUpdatesPure([], [])).toEqual({
      checked: 0,
      notified: 0,
      items: [],
    });
  });

  it("空 results → 0 notified, checked 反映 watchlist 长度", () => {
    const wl = [
      { appName: "VSCode", lastNotifiedVersion: null },
      { appName: "Slack", lastNotifiedVersion: null },
    ];
    const r = checkWatchlistUpdatesPure([], wl);
    expect(r).toMatchObject({ checked: 2, notified: 0, items: [] });
  });

  it("pinned app 有更新 → 加入 items", () => {
    const wl = [{ appName: "VSCode", lastNotifiedVersion: null }];
    const results = [
      { name: "VSCode", hasUpdate: true, latestVersion: "1.95.3" },
      { name: "Slack", hasUpdate: false, latestVersion: "1.0.0" },
    ];
    const r = checkWatchlistUpdatesPure(results, wl);
    expect(r.notified).toBe(1);
    expect(r.items).toEqual([
      { appName: "VSCode", latestVersion: "1.95.3" },
    ]);
  });

  it("pinned app 没更新 → 不加入", () => {
    const wl = [{ appName: "VSCode", lastNotifiedVersion: null }];
    const results = [
      { name: "VSCode", hasUpdate: false, latestVersion: "1.95.2" },
    ];
    const r = checkWatchlistUpdatesPure(results, wl);
    expect(r.notified).toBe(0);
  });

  it("lastNotifiedVersion 匹配 → 跳过 (去重)", () => {
    const wl = [
      { appName: "VSCode", lastNotifiedVersion: "1.95.3" },
    ];
    const results = [
      { name: "VSCode", hasUpdate: true, latestVersion: "1.95.3" },
    ];
    const r = checkWatchlistUpdatesPure(results, wl);
    expect(r.notified).toBe(0);
  });

  it("lastNotifiedVersion 不匹配 (升到新版本) → 触发", () => {
    const wl = [
      { appName: "VSCode", lastNotifiedVersion: "1.95.2" },
    ];
    const results = [
      { name: "VSCode", hasUpdate: true, latestVersion: "1.95.3" },
    ];
    const r = checkWatchlistUpdatesPure(results, wl);
    expect(r.notified).toBe(1);
  });

  it("脏数据 (appName 不是 string) → 过滤", () => {
    const wl = [
      { appName: "VSCode", lastNotifiedVersion: null },
      { appName: 42, lastNotifiedVersion: null }, // 脏
      null, // 脏
    ];
    const results = [
      { name: "VSCode", hasUpdate: true, latestVersion: "1.0.0" },
    ];
    const r = checkWatchlistUpdatesPure(results, wl);
    expect(r.checked).toBe(3); // 算 checked
    expect(r.notified).toBe(1); // 只 VSCode 真有更新
  });

  it("results 不是 array → 返 0/0/[]", () => {
    const wl = [{ appName: "VSCode", lastNotifiedVersion: null }];
    expect(checkWatchlistUpdatesPure(null, wl).notified).toBe(0);
  });

  it("多 pinned app 各自独立", () => {
    const wl = [
      { appName: "VSCode", lastNotifiedVersion: "1.95.2" },
      { appName: "Slack", lastNotifiedVersion: null },
      { appName: "Chrome", lastNotifiedVersion: "120.0" },
    ];
    const results = [
      { name: "VSCode", hasUpdate: true, latestVersion: "1.95.3" }, // new
      { name: "Slack", hasUpdate: true, latestVersion: "4.0.0" },    // new
      { name: "Chrome", hasUpdate: true, latestVersion: "120.0" },  // dup
    ];
    const r = checkWatchlistUpdatesPure(results, wl);
    expect(r.notified).toBe(2);
    expect(r.items.map((i) => i.appName).sort()).toEqual(["Slack", "VSCode"]);
  });
});

describe("checkWatchlistUpdates (副作用)", () => {
  it("无新版本 → 不调 saveWatchlist / sendNotification", () => {
    const saveWatchlist = vi.fn();
    const sendNotification = vi.fn();
    const r = checkWatchlistUpdates({
      results: [],
      watchlist: [{ appName: "VSCode", lastNotifiedVersion: null }],
      saveWatchlist,
      sendNotification,
    });
    expect(r.notified).toBe(0);
    expect(saveWatchlist).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("有通知 → 调 saveWatchlist (写回 lastNotifiedVersion) + sendNotification", () => {
    const saveWatchlist = vi.fn();
    const sendNotification = vi.fn();
    const watchlist = [
      { appName: "VSCode", lastNotifiedVersion: null, addedAt: 1 },
    ];
    checkWatchlistUpdates({
      results: [{ name: "VSCode", hasUpdate: true, latestVersion: "1.95.3" }],
      watchlist,
      saveWatchlist,
      sendNotification,
    });
    expect(saveWatchlist).toHaveBeenCalledOnce();
    const saved = saveWatchlist.mock.calls[0][0];
    expect(saved[0].lastNotifiedVersion).toBe("1.95.3");
    expect(saved[0].addedAt).toBe(1); // 保留原 addedAt
    expect(sendNotification).toHaveBeenCalledOnce();
    expect(sendNotification).toHaveBeenCalledWith({
      title: "⭐ VSCode 升级",
      body: "新版本 1.95.3",
    });
  });

  it("saveWatchlist 抛错 → 不阻断, log.warn 走 log", () => {
    const saveWatchlist = vi.fn(() => {
      throw new Error("disk full");
    });
    const log = { warn: vi.fn() };
    const sendNotification = vi.fn();
    const r = checkWatchlistUpdates({
      results: [{ name: "VSCode", hasUpdate: true, latestVersion: "1.0" }],
      watchlist: [{ appName: "VSCode", lastNotifiedVersion: null }],
      saveWatchlist,
      sendNotification,
      log,
    });
    expect(r.notified).toBe(1);
    expect(log.warn).toHaveBeenCalled();
    // sendNotification 仍然调 (best effort)
    expect(sendNotification).toHaveBeenCalled();
  });

  it("无 sendNotification → 只写 lastNotifiedVersion, 不发通知 (fallback)", () => {
    const saveWatchlist = vi.fn();
    const r = checkWatchlistUpdates({
      results: [{ name: "VSCode", hasUpdate: true, latestVersion: "1.0" }],
      watchlist: [{ appName: "VSCode", lastNotifiedVersion: null }],
      saveWatchlist,
      // sendNotification 故意不传
    });
    expect(r.notified).toBe(1);
    expect(saveWatchlist).toHaveBeenCalled();
  });
});