/**
 * tests/main/fund-history-store.test.js
 */

import { describe, it, expect, beforeEach } from "vitest";
const fs = require("fs");
const path = require("path");
const os = require("os");
const fundStore = require("../../src/main/funds/fund-store.js");
const fundHistoryStore = require("../../src/main/funds/fund-history-store.js");

let tmpPath;

beforeEach(() => {
  tmpPath = path.join(
    os.tmpdir(),
    `pulse-fund-history-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  fs.writeFileSync(
    tmpPath,
    JSON.stringify({ v: 1, ts: 0, apps: {}, mutes: {} }),
  );
});

describe("recordFromNavMap", () => {
  it("写入当天快照且 add 持仓不丢失", () => {
    fundStore.add(
      { code: "000001", name: "测试", shares: 1000, costNav: 1.0 },
      tmpPath,
    );
    const navMap = {
      "000001": {
        code: "000001",
        name: "测试",
        nav: 1.0,
        estimatedNav: 1.05,
        dayChange: 0.05,
        dayChangePct: 5,
      },
    };
    const r = fundHistoryStore.recordFromNavMap(
      navMap,
      new Date("2026-06-12T15:00:00+08:00"),
      tmpPath,
    );
    expect(r.ok).toBe(true);
    expect(r.entry.date).toBe("2026-06-12");
    expect(r.entry.todayProfit).toBe(50);

    fundStore.add(
      { code: "000002", name: "b", shares: 100, costNav: 2.0 },
      tmpPath,
    );
    const snaps = fundHistoryStore.loadSnapshots(tmpPath);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].todayProfit).toBe(50);
  });
});

describe("navHistory persistence", () => {
  it("navHistory round-trip by code", () => {
    const series = [{ date: "2026-07-10", nav: 1.23 }];
    fundHistoryStore.saveNavHistory("000001", series, tmpPath);
    expect(fundHistoryStore.loadNavHistory("000001", tmpPath)).toEqual(series);
  });
  it("missing code returns empty array", () => {
    expect(fundHistoryStore.loadNavHistory("999999", tmpPath)).toEqual([]);
  });
});

// 2026-07-15: 修复「切 1M/3M/1Y 全显示 1 个月」— 短缓存不得命中长窗口请求
describe("isNavCacheSufficient", () => {
  it("30 条不够撑 365 天请求", () => {
    const short = Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, nav: 1 }));
    expect(fundHistoryStore.isNavCacheSufficient(short, 365)).toBe(false);
  });
  it("365 条够撑 90 / 365", () => {
    const long = Array.from({ length: 365 }, (_, i) => ({ date: `d${i}`, nav: 1 }));
    expect(fundHistoryStore.isNavCacheSufficient(long, 90)).toBe(true);
    expect(fundHistoryStore.isNavCacheSufficient(long, 365)).toBe(true);
  });
  it("空 / 非数组不够", () => {
    expect(fundHistoryStore.isNavCacheSufficient([], 30)).toBe(false);
    expect(fundHistoryStore.isNavCacheSufficient(null, 30)).toBe(false);
  });
});