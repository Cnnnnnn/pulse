/**
 * tests/renderer/worldcup-betsStore.test.js
 *
 * betsStore.js 单测:
 *   - computeBetsStats 纯函数 (聚合 / ROI / 边界)
 *   - actions: load / upsert / remove 通过 mock window.api
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  computeBetsStats,
  worldcupBets,
  betsLoaded,
  loadWorldcupBets,
  upsertWorldcupBet,
  removeWorldcupBet,
} from "../../src/renderer/worldcup/betsStore.js";

describe("computeBetsStats", () => {
  it("returns zeros + roi=null for empty dates", () => {
    const r = computeBetsStats({}, []);
    expect(r).toEqual({
      totalStake: 0,
      totalPnl: 0,
      filled: 0,
      unfilled: 0,
      roi: null,
    });
  });

  it("aggregates all dates with entries", () => {
    const r = computeBetsStats(
      {
        "2026-06-12": { stake: 100, pnl: 120 },
        "2026-06-13": { stake: 50, pnl: -80 },
      },
      ["2026-06-12", "2026-06-13", "2026-06-14"],
    );
    expect(r.totalStake).toBe(150);
    expect(r.totalPnl).toBe(40);
    expect(r.filled).toBe(2);
    expect(r.unfilled).toBe(1);
    expect(r.roi).toBeCloseTo(40 / 150);
  });

  it("skips dates without entries", () => {
    const r = computeBetsStats(
      { "2026-06-12": { stake: 100, pnl: 50 } },
      ["2026-06-12", "2026-06-13"],
    );
    expect(r.filled).toBe(1);
    expect(r.unfilled).toBe(1);
  });

  it("roi is null when totalStake=0", () => {
    const r = computeBetsStats(
      {
        "2026-06-12": { stake: 0, pnl: 200 }, // 白嫖赢
        "2026-06-13": { stake: 0, pnl: 0 },
      },
      ["2026-06-12", "2026-06-13"],
    );
    expect(r.totalStake).toBe(0);
    expect(r.totalPnl).toBe(200);
    expect(r.filled).toBe(2);
    expect(r.roi).toBeNull();
  });

  it("handles missing betsMap gracefully", () => {
    const r = computeBetsStats(null, ["2026-06-12"]);
    expect(r.filled).toBe(0);
    expect(r.unfilled).toBe(1);
  });
});

describe("betsStore actions (via window.api mock)", () => {
  let originalApi;

  beforeEach(() => {
    worldcupBets.value = {};
    betsLoaded.value = false;
    originalApi = global.window && global.window.api;
  });

  afterEach(() => {
    if (global.window) {
      if (originalApi) global.window.api = originalApi;
      else delete global.window.api;
    }
  });

  it("loadWorldcupBets calls api + populates signal", async () => {
    global.window = global.window || {};
    global.window.api = {
      worldcupLoadBets: async () => ({
        ok: true,
        worldcupBets: { "2026-06-12": { stake: 100, pnl: 50 } },
      }),
    };
    const ok = await loadWorldcupBets();
    expect(ok).toBe(true);
    expect(betsLoaded.value).toBe(true);
    expect(worldcupBets.value["2026-06-12"]).toMatchObject({
      stake: 100,
      pnl: 50,
    });
  });

  it("loadWorldcupBets returns false when api missing", async () => {
    global.window = global.window || {};
    delete global.window.api;
    const ok = await loadWorldcupBets();
    expect(ok).toBe(false);
  });

  it("upsertWorldcupBet merges entry into signal", async () => {
    global.window = global.window || {};
    global.window.api = {
      worldcupUpsertBet: async (payload) => ({
        ok: true,
        entry: { ...payload, updatedAt: 1000 },
      }),
    };
    const r = await upsertWorldcupBet({
      date: "2026-06-12",
      stake: 100,
      pnl: 50,
    });
    expect(r.ok).toBe(true);
    expect(worldcupBets.value["2026-06-12"]).toMatchObject({
      stake: 100,
      pnl: 50,
    });
  });

  it("upsertWorldcupBet returns ok=false on api failure", async () => {
    global.window = global.window || {};
    global.window.api = {
      worldcupUpsertBet: async () => ({ ok: false, reason: "invalid_stake" }),
    };
    const r = await upsertWorldcupBet({
      date: "2026-06-12",
      stake: -1,
      pnl: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_stake");
  });

  it("removeWorldcupBet deletes from signal", async () => {
    global.window = global.window || {};
    worldcupBets.value = { "2026-06-12": { stake: 100, pnl: 0 } };
    global.window.api = {
      worldcupRemoveBet: async () => ({ ok: true }),
    };
    const r = await removeWorldcupBet("2026-06-12");
    expect(r.ok).toBe(true);
    expect(worldcupBets.value["2026-06-12"]).toBeUndefined();
  });

  it("removeWorldcupBet handles missing api", async () => {
    global.window = global.window || {};
    delete global.window.api;
    const r = await removeWorldcupBet("2026-06-12");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("ipc_unavailable");
  });
});
