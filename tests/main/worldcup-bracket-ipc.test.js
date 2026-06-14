/**
 * tests/main/worldcup-bracket-ipc.test.js
 *
 * TDD for src/main/worldcup/bracket.js — IPC handler that
 * orchestrates fetcher → parser → scores → bracket-rules → state-store.
 *
 * Pattern: see worldcup-bracket-state-store.test.js for state-store helper.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
const fs = require("fs");
const os = require("os");
const path = require("path");

function tmpStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-ipc-"));
  return path.join(dir, "state.json");
}

const FULL_GROUP_STANDINGS = {
  A: { winner: "Mexico", runnerUp: "South Africa", third: { name: "South Korea", pts: 3, gd: 0, gf: 2 } },
  B: { winner: "Canada", runnerUp: "Switzerland", third: { name: "Qatar", pts: 3, gd: 0, gf: 2 } },
  C: { winner: "Brazil", runnerUp: "Morocco", third: { name: "Scotland", pts: 3, gd: 0, gf: 2 } },
  D: { winner: "USA", runnerUp: "Paraguay", third: { name: "Australia", pts: 3, gd: 0, gf: 2 } },
  E: { winner: "Germany", runnerUp: "Curaçao", third: { name: "Ivory Coast", pts: 3, gd: 0, gf: 2 } },
  F: { winner: "Netherlands", runnerUp: "Japan", third: { name: "Sweden", pts: 3, gd: 0, gf: 2 } },
  G: { winner: "Belgium", runnerUp: "Egypt", third: { name: "Iran", pts: 3, gd: 0, gf: 2 } },
  H: { winner: "Spain", runnerUp: "Cape Verde", third: { name: "Saudi Arabia", pts: 3, gd: 0, gf: 2 } },
  I: { winner: "France", runnerUp: "Senegal", third: { name: "Iraq", pts: 3, gd: 0, gf: 2 } },
  J: { winner: "Argentina", runnerUp: "Algeria", third: { name: "Austria", pts: 3, gd: 0, gf: 2 } },
  K: { winner: "Portugal", runnerUp: "DR Congo", third: { name: "Colombia", pts: 3, gd: 0, gf: 2 } },
  L: { winner: "England", runnerUp: "Croatia", third: { name: "Ghana", pts: 3, gd: 0, gf: 2 } },
};

function stubFetcher() {
  return { ok: true, data: { name: "World Cup 2026", groups: [], matches: [] } };
}
function stubScores() { return {}; }
function stubTeamsData() { return []; }

describe("worldcup bracket IPC handler", () => {
  let statePath;
  beforeEach(() => { statePath = tmpStatePath(); });
  afterEach(() => {
    try { fs.rmSync(path.dirname(statePath), { recursive: true, force: true }); } catch {}
  });

  test("computeWorldcupBracket returns ok+snapshot and writes state", async () => {
    const { computeWorldcupBracket } = require("../../src/main/worldcup/bracket");
    const r = await computeWorldcupBracket({
      statePath,
      fetcher: stubFetcher,
      scores: stubScores,
      teamsData: stubTeamsData,
      groupStandings: FULL_GROUP_STANDINGS,
    });
    expect(r.ok).toBe(true);
    expect(r.snapshot).toBeDefined();
    expect(r.snapshot.r32).toHaveLength(16);
    const stateStore = require("../../src/main/state-store");
    const loaded = stateStore.loadWorldcupBracket(statePath);
    expect(loaded).toBeDefined();
    expect(loaded.r32).toHaveLength(16);
  });

  test("computeWorldcupBracket returns ok:false when fetcher throws", async () => {
    const { computeWorldcupBracket } = require("../../src/main/worldcup/bracket");
    const r = await computeWorldcupBracket({
      statePath,
      fetcher: () => { throw new Error("network down"); },
    });
    expect(r.ok).toBe(false);
    expect(r.reason || r.error).toBeDefined();
    const stateStore = require("../../src/main/state-store");
    expect(stateStore.loadWorldcupBracket(statePath)).toBeNull();
  });

  test("computeWorldcupBracket returns ok:false when fetcher returns ok:false", async () => {
    const { computeWorldcupBracket } = require("../../src/main/worldcup/bracket");
    const r = await computeWorldcupBracket({
      statePath,
      fetcher: () => ({ ok: false, reason: "fetch_failed" }),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });

  test("loadWorldcupBracket returns null when absent", () => {
    const { loadWorldcupBracket } = require("../../src/main/worldcup/bracket");
    const r = loadWorldcupBracket({ statePath });
    expect(r.ok).toBe(true);
    expect(r.snapshot).toBeNull();
  });

  test("loadWorldcupBracket returns saved snapshot after compute", async () => {
    const { computeWorldcupBracket, loadWorldcupBracket } = require("../../src/main/worldcup/bracket");
    await computeWorldcupBracket({
      statePath,
      fetcher: stubFetcher,
      scores: stubScores,
      teamsData: stubTeamsData,
      groupStandings: FULL_GROUP_STANDINGS,
    });
    const r = loadWorldcupBracket({ statePath });
    expect(r.ok).toBe(true);
    expect(r.snapshot.r32).toHaveLength(16);
  });
});