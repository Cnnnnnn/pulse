/**
 * tests/main/worldcup-bracket-state-store.test.js
 *
 * TDD for loadWorldcupBracket / saveWorldcupBracket in src/main/state-store.js.
 * Pattern: see existing loadWorldcupTxt / saveWorldcupTxt (same module).
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const fs = require("fs");
const os = require("os");
const path = require("path");
const stateStore = requireMain("state-store");

function tmpStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-state-"));
  return path.join(dir, "state.json");
}

describe("worldcup bracket snapshot (state-store)", () => {
  let statePath;
  beforeEach(() => {
    statePath = tmpStatePath();
  });
  afterEach(() => {
    try {
      fs.rmSync(path.dirname(statePath), { recursive: true, force: true });
    } catch {
      /* noop */
    }
  });

  test("loadWorldcupBracket returns null when missing", () => {
    expect(stateStore.loadWorldcupBracket(statePath)).toBeNull();
  });

  test("saveWorldcupBracket then load roundtrip", () => {
    const snapshot = {
      version: 1,
      computedAt: 12345,
      projected: true,
      r32: [],
      r16: [],
      qf: [],
      sf: [],
      final: null,
      third: null,
      thirdPlacedAdvancing: [],
      annexCIndex: -1,
      warnings: [],
    };
    stateStore.saveWorldcupBracket(snapshot, statePath);
    const loaded = stateStore.loadWorldcupBracket(statePath);
    expect(loaded).toEqual(snapshot);
  });

  test("saveWorldcupBracket preserves other state.json fields", () => {
    stateStore.saveLastOpened({ foo: "bar" }, statePath);
    const snapshot = {
      version: 1,
      computedAt: 1,
      projected: false,
      r32: [],
      r16: [],
      qf: [],
      sf: [],
      final: null,
      third: null,
      thirdPlacedAdvancing: [],
      annexCIndex: 0,
      warnings: [],
    };
    stateStore.saveWorldcupBracket(snapshot, statePath);
    const last = stateStore.loadLastOpened(statePath);
    expect(last).toEqual({ foo: "bar" });
  });

  test("saveWorldcupBracket throws TypeError on invalid input", () => {
    expect(() => stateStore.saveWorldcupBracket(null, statePath)).toThrow(TypeError);
    expect(() => stateStore.saveWorldcupBracket("string", statePath)).toThrow(TypeError);
  });
});
