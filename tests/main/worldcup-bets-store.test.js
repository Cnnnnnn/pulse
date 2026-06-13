/**
 * tests/main/worldcup-bets-store.test.js
 *
 * bets-store.js 单测 — 覆盖:
 *   - loadAll: 空 / 损坏文件 / 已有数据
 *   - upsert: 新增 / 覆盖 / 不影响其他字段
 *   - remove: 删除 / 不存在的 date
 *   - 校验: date / stake / pnl / note
 *   - 边界: stake=0 (白嫖), pnl<0 (亏)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
const betsStore = require("../../src/main/worldcup/bets-store.js");

function tmpStatePath() {
  const dir = join(
    tmpdir(),
    `pulse-bets-store-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

describe("bets-store", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
  });

  it("loadAll returns empty when state file missing", () => {
    const r = betsStore.loadAll(p);
    expect(r.worldcupBets).toEqual({});
  });

  it("upsert adds a new entry", () => {
    const r = betsStore.upsert({ date: "2026-06-12", stake: 100, pnl: 120 }, p);
    expect(r.ok).toBe(true);
    expect(r.entry).toMatchObject({
      date: "2026-06-12",
      stake: 100,
      pnl: 120,
      note: "",
    });
    const all = betsStore.loadAll(p);
    expect(all.worldcupBets["2026-06-12"]).toMatchObject({
      stake: 100,
      pnl: 120,
    });
  });

  it("upsert overwrites existing date", () => {
    betsStore.upsert({ date: "2026-06-12", stake: 100, pnl: 120 }, p);
    const r = betsStore.upsert({ date: "2026-06-12", stake: 200, pnl: -80 }, p);
    expect(r.ok).toBe(true);
    expect(betsStore.loadAll(p).worldcupBets["2026-06-12"]).toMatchObject({
      stake: 200,
      pnl: -80,
    });
  });

  it("upsert ensures apps/mutes shell so state-store.load can read bets later", () => {
    betsStore.upsert({ date: "2026-06-12", stake: 50, pnl: 0 }, p);
    const stateStore = require("../../src/main/state-store.js");
    const loaded = stateStore.load(p);
    expect(loaded).not.toBeNull();
    expect(loaded.apps).toEqual({});
    expect(loaded.worldcupBets["2026-06-12"]).toMatchObject({
      stake: 50,
      pnl: 0,
    });
  });

  it("upsert preserves other state keys (no clobber)", () => {
    writeFileSync(p, JSON.stringify({ apps: {}, mutes: {}, someOtherKey: 1 }));
    betsStore.upsert({ date: "2026-06-12", stake: 50, pnl: 0 }, p);
    const raw = JSON.parse(require("fs").readFileSync(p, "utf-8"));
    expect(raw.apps).toEqual({});
    expect(raw.mutes).toEqual({});
    expect(raw.someOtherKey).toBe(1);
    expect(raw.worldcupBets["2026-06-12"]).toMatchObject({
      stake: 50,
      pnl: 0,
    });
  });

  it("upsert sets updatedAt", () => {
    const before = Date.now();
    const r = betsStore.upsert({ date: "2026-06-12", stake: 100, pnl: 0 }, p);
    expect(r.entry.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("upsert accepts note", () => {
    const r = betsStore.upsert(
      { date: "2026-06-12", stake: 100, pnl: 0, note: "阿根廷输了" },
      p,
    );
    expect(r.entry.note).toBe("阿根廷输了");
  });

  it("remove deletes the date entry", () => {
    betsStore.upsert({ date: "2026-06-12", stake: 100, pnl: 0 }, p);
    const r = betsStore.remove("2026-06-12", p);
    expect(r.ok).toBe(true);
    expect(betsStore.loadAll(p).worldcupBets["2026-06-12"]).toBeUndefined();
  });

  it("remove on missing date returns ok=false", () => {
    const r = betsStore.remove("1999-01-01", p);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_found");
  });

  it("remove on missing state returns ok=false", () => {
    const r = betsStore.remove("2026-06-12", p);
    expect(r.ok).toBe(false);
  });

  it("rejects invalid date format", () => {
    expect(() =>
      betsStore.upsert({ date: "2026/06/12", stake: 0, pnl: 0 }, p),
    ).toThrow(/invalid_date/);
  });

  it("rejects negative stake", () => {
    expect(() =>
      betsStore.upsert({ date: "2026-06-12", stake: -1, pnl: 0 }, p),
    ).toThrow(/invalid_stake/);
  });

  it("rejects non-number stake/pnl", () => {
    expect(() =>
      betsStore.upsert({ date: "2026-06-12", stake: "abc", pnl: 0 }, p),
    ).toThrow();
    expect(() =>
      betsStore.upsert({ date: "2026-06-12", stake: 0, pnl: "xyz" }, p),
    ).toThrow();
  });

  it("rejects NaN/Infinity stake/pnl", () => {
    expect(() =>
      betsStore.upsert({ date: "2026-06-12", stake: NaN, pnl: 0 }, p),
    ).toThrow();
    expect(() =>
      betsStore.upsert({ date: "2026-06-12", stake: 100, pnl: Infinity }, p),
    ).toThrow();
  });

  it("rejects stake/pnl > 1e9", () => {
    expect(() =>
      betsStore.upsert({ date: "2026-06-12", stake: 1e10, pnl: 0 }, p),
    ).toThrow();
  });

  it("rejects note > 200 chars", () => {
    const longNote = "x".repeat(201);
    expect(() =>
      betsStore.upsert(
        { date: "2026-06-12", stake: 0, pnl: 0, note: longNote },
        p,
      ),
    ).toThrow(/invalid_note/);
  });

  it("accepts stake = 0 (白嫖合法)", () => {
    const r = betsStore.upsert({ date: "2026-06-12", stake: 0, pnl: 200 }, p);
    expect(r.ok).toBe(true);
  });

  it("accepts negative pnl (亏)", () => {
    const r = betsStore.upsert(
      { date: "2026-06-12", stake: 100, pnl: -100 },
      p,
    );
    expect(r.ok).toBe(true);
  });

  it("handles corrupt state.json gracefully", () => {
    writeFileSync(p, "{not json");
    const r = betsStore.loadAll(p);
    expect(r.worldcupBets).toEqual({});
  });
});
