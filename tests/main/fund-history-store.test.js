/**
 * tests/main/fund-history-store.test.js
 */

import { describe, it, expect, beforeEach } from "vitest";
const fs = require("fs");
const path = require("path");
const os = require("os");
const fundStore = require("../../src/main/fund-store.js");
const fundHistoryStore = require("../../src/main/fund-history-store.js");

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
