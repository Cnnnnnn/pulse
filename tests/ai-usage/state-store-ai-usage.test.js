/**
 * tests/ai-usage/state-store-ai-usage.test.js
 *
 * TDD for state-store.js load/save AI usage snapshot.
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §4.3
 */

import { describe, test, expect, beforeEach } from "vitest";
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  loadAiUsageSnapshot,
  saveAiUsageSnapshot,
  saveAll,
} = require("../../src/main/state-store");

function tmpStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-usage-state-"));
  return path.join(dir, "state.json");
}

const FAKE_SNAPSHOT = {
  provider: "minimax",
  region: "cn",
  fetchedAt: 1700000000000,
  endpoint: "https://www.minimaxi.com/v1/token_plan/remains",
  windows: {
    "5h": {
      total: 6000,
      remaining: 4200,
      used: 1800,
      resetAt: 1700003600000,
      resetInSec: 3600,
      label: "5 小时滚动窗口",
    },
    weekly: null,
  },
  credits: null,
};

describe("state-store: AI usage snapshot", () => {
  let statePath;

  beforeEach(() => {
    statePath = tmpStatePath();
  });

  test("loadAiUsageSnapshot returns null when state.json absent", () => {
    expect(loadAiUsageSnapshot(statePath)).toBe(null);
  });

  test("loadAiUsageSnapshot returns null when ai_usage field missing", () => {
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: {} }));
    expect(loadAiUsageSnapshot(statePath)).toBe(null);
  });

  test("saveAiUsageSnapshot + loadAiUsageSnapshot round-trip", () => {
    saveAiUsageSnapshot(FAKE_SNAPSHOT, statePath);
    const loaded = loadAiUsageSnapshot(statePath);
    expect(loaded).not.toBe(null);
    expect(loaded.provider).toBe("minimax");
    expect(loaded.fetchedAt).toBe(1700000000000);
    expect(loaded.windows["5h"].total).toBe(6000);
    expect(loaded.windows["5h"].remaining).toBe(4200);
    expect(loaded.windows["5h"].used).toBe(1800);
    expect(loaded.windows["5h"].resetInSec).toBe(3600);
  });

  test("saveAiUsageSnapshot overwrites previous snapshot (no merge)", () => {
    saveAiUsageSnapshot(FAKE_SNAPSHOT, statePath);
    const newer = { ...FAKE_SNAPSHOT, fetchedAt: 1700000999999 };
    saveAiUsageSnapshot(newer, statePath);
    const loaded = loadAiUsageSnapshot(statePath);
    expect(loaded.fetchedAt).toBe(1700000999999);
  });

  test("saveAiUsageSnapshot preserves apps field", () => {
    saveAll(
      [
        {
          name: "Cursor",
          installed_version: "1.0.0",
          latest_version: "1.0.0",
          has_update: false,
          status: "up_to_date",
          source: "brew_formulae",
          note: "",
        },
      ],
      statePath,
    );
    saveAiUsageSnapshot(FAKE_SNAPSHOT, statePath);
    const s = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(s.apps.Cursor.installed_version).toBe("1.0.0");
  });

  test("saveAiUsageSnapshot rejects non-object input", () => {
    expect(() => saveAiUsageSnapshot(null, statePath)).toThrow();
    expect(() => saveAiUsageSnapshot("hi", statePath)).toThrow();
    expect(() => saveAiUsageSnapshot(42, statePath)).toThrow();
  });

  test("loadAiUsageSnapshot ignores non-object ai_usage value", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({ v: 1, apps: {}, ai_usage: "garbage" }),
    );
    expect(loadAiUsageSnapshot(statePath)).toBe(null);
  });
});
