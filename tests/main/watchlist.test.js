/**
 * tests/main/watchlist.test.js
 *
 * I2 v1 + v2 — app / fund / keyword checkers.
 */

import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const {
  checkWatchlistUpdatesPure,
  checkWatchlistUpdates,
  checkWatchlistFundUpdatesPure,
  checkWatchlistFundUpdates,
  checkWatchlistKeywordUpdatesPure,
  checkWatchlistKeywordUpdates,
  checkWatchlistMetalUpdatesPure,
  checkWatchlistMetalUpdates,
  FUND_NAV_CHANGE_PCT,
  METAL_PRICE_CHANGE_PCT,
} = require("../../src/main/watchlist");

const appItem = (ref, lastNotifiedVersion = null) => ({
  type: "app",
  ref,
  addedAt: 1,
  lastNotifiedVersion,
});

describe("checkWatchlistUpdatesPure (app)", () => {
  it("空 watchlist → 0/0/[]", () => {
    expect(checkWatchlistUpdatesPure([], [])).toEqual({
      checked: 0,
      notified: 0,
      items: [],
      baselines: [],
    });
  });

  it("pinned app 有更新 → 加入 items", () => {
    const wl = [appItem("VSCode")];
    const results = [
      { name: "VSCode", hasUpdate: true, latestVersion: "1.95.3" },
    ];
    const r = checkWatchlistUpdatesPure(results, wl);
    expect(r.notified).toBe(1);
    expect(r.items[0]).toMatchObject({
      type: "app",
      ref: "VSCode",
      latestVersion: "1.95.3",
    });
  });

  it("lastNotifiedVersion 匹配 → 跳过", () => {
    const wl = [appItem("VSCode", "1.95.3")];
    const results = [
      { name: "VSCode", hasUpdate: true, latestVersion: "1.95.3" },
    ];
    expect(checkWatchlistUpdatesPure(results, wl).notified).toBe(0);
  });
});

describe("checkWatchlistFundUpdatesPure", () => {
  const fundItem = (ref, lastNotifiedNav = null) => ({
    type: "fund",
    ref,
    addedAt: 1,
    lastNotifiedNav,
  });

  it("首次有净值 → baseline 不通知", () => {
    const r = checkWatchlistFundUpdatesPure({
      watchlist: [fundItem("000001")],
      navMap: { "000001": { nav: 1.1, dayChange: 0 } },
    });
    expect(r.notified).toBe(0);
    expect(r.baselines).toHaveLength(1);
    expect(r.baselines[0].lastNotifiedNav).toBe(1.1);
  });

  it(`净值变动 ≥ ${FUND_NAV_CHANGE_PCT}% → 通知`, () => {
    const r = checkWatchlistFundUpdatesPure({
      watchlist: [fundItem("000001", 1.0)],
      navMap: { "000001": { nav: 1.03, dayChange: 0 } },
    });
    expect(r.notified).toBe(1);
    expect(r.items[0].dir).toBe("涨");
  });
});

describe("checkWatchlistKeywordUpdatesPure", () => {
  const kwItem = (ref, lastMatchKey = null) => ({
    type: "keyword",
    ref,
    addedAt: 1,
    lastMatchKey,
  });

  it("首次匹配 → baseline", () => {
    const r = checkWatchlistKeywordUpdatesPure(
      [kwItem("苹果")],
      [{ title: "苹果发布新品" }],
    );
    expect(r.notified).toBe(0);
    expect(r.baselines[0].lastMatchKey).toBe("苹果发布新品");
  });

  it("新标题匹配 → 通知", () => {
    const r = checkWatchlistKeywordUpdatesPure(
      [kwItem("苹果", "旧标题")],
      [{ title: "苹果芯片突破" }],
    );
    expect(r.notified).toBe(1);
    expect(r.items[0].matchTitle).toBe("苹果芯片突破");
  });
});

describe("checkWatchlistUpdates (副作用)", () => {
  it("有通知 → saveWatchlist + sendNotification", () => {
    const saveWatchlist = vi.fn();
    const sendNotification = vi.fn();
    checkWatchlistUpdates({
      results: [{ name: "VSCode", hasUpdate: true, latestVersion: "1.0" }],
      watchlist: [appItem("VSCode")],
      saveWatchlist,
      sendNotification,
    });
    expect(saveWatchlist).toHaveBeenCalledOnce();
    expect(sendNotification).toHaveBeenCalledOnce();
  });
});

describe("checkWatchlistFundUpdates (副作用)", () => {
  it("baseline → 只写盘不发通知", () => {
    const saveWatchlist = vi.fn();
    const sendNotification = vi.fn();
    checkWatchlistFundUpdates({
      watchlist: [
        { type: "fund", ref: "000001", addedAt: 1, lastNotifiedNav: null },
      ],
      navMap: { "000001": { nav: 1.2, dayChange: 0 } },
      saveWatchlist,
      sendNotification,
    });
    expect(saveWatchlist).toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("checkWatchlistKeywordUpdates (副作用)", () => {
  it("新匹配 → 通知", () => {
    const sendNotification = vi.fn();
    checkWatchlistKeywordUpdates({
      watchlist: [
        { type: "keyword", ref: "AI", addedAt: 1, lastMatchKey: "旧" },
      ],
      headlines: [{ title: "AI 大模型" }],
      saveWatchlist: vi.fn(),
      sendNotification,
    });
    expect(sendNotification).toHaveBeenCalledOnce();
  });
});

describe("checkWatchlistMetalUpdatesPure", () => {
  const metalItem = (ref, lastNotifiedPrice = null) => ({
    type: "metal",
    ref,
    addedAt: 1,
    lastNotifiedPrice,
  });

  it("首次有报价 → baseline", () => {
    const r = checkWatchlistMetalUpdatesPure({
      watchlist: [metalItem("XAU")],
      quoteMap: { XAU: { price: 2300 } },
    });
    expect(r.notified).toBe(0);
    expect(r.baselines[0].lastNotifiedPrice).toBe(2300);
  });

  it(`价格变动 ≥ ${METAL_PRICE_CHANGE_PCT}% → 通知`, () => {
    const r = checkWatchlistMetalUpdatesPure({
      watchlist: [metalItem("XAU", 2300)],
      quoteMap: { XAU: { price: 2350 } },
    });
    expect(r.notified).toBe(1);
    expect(r.items[0].dir).toBe("涨");
  });
});

describe("checkWatchlistMetalUpdates (副作用)", () => {
  it("baseline → 只写盘", () => {
    const sendNotification = vi.fn();
    checkWatchlistMetalUpdates({
      watchlist: [
        { type: "metal", ref: "XAU", addedAt: 1, lastNotifiedPrice: null },
      ],
      quoteMap: { XAU: { price: 100 } },
      saveWatchlist: vi.fn(),
      sendNotification,
    });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
