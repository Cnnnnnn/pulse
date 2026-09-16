/**
 * tests/ai-usage/state-store-ai-usage.test.js
 *
 * TDD for state-store.js load/save AI usage snapshot.
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §4.3
 */

import { describe, test, expect, beforeEach } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  loadAiUsageSnapshot,
  saveAiUsageSnapshot,
  saveAll,
} = requireMain("state-store");

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

// ── ai_usage_alert_prefs 白名单回归 ──────────────────────────────
//
// ⚠️ normalizeAiUsageAlertPrefs 是**白名单式**的: 新增 prefs 子字段若没加进
// 白名单, saveAiUsageAlertPrefs 会静默丢弃 (跟 PRESERVE_FIELDS 同一类坑).
// 这条用例专门钉住 authWarned 能落盘 + 读回.

describe("state-store — ai_usage_alert_prefs.authWarned 落盘往返", () => {
  let statePath: string;
  beforeEach(() => {
    statePath = tmpStatePath();
  });

  test("save → load: authWarned 子字段不被白名单过滤掉", () => {
    const ss = requireMain("state-store");
    ss.saveAiUsageAlertPrefs({ authWarned: { codex: 1789000000000 } }, statePath);
    const back = ss.loadAiUsageAlertPrefs(statePath);
    expect(back.authWarned).toEqual({ codex: 1789000000000 });
  });

  test("不带 authWarned 的 patch 不会清掉已有记录", () => {
    const ss = requireMain("state-store");
    ss.saveAiUsageAlertPrefs({ authWarned: { codex: 111 } }, statePath);
    ss.saveAiUsageAlertPrefs({ absMinPct: 66 }, statePath);
    const back = ss.loadAiUsageAlertPrefs(statePath);
    expect(back.absMinPct).toBe(66);
    expect(back.authWarned).toEqual({ codex: 111 });
  });

  test("清空记录 (空对象) 能落盘 —— 恢复路径靠这个", () => {
    const ss = requireMain("state-store");
    ss.saveAiUsageAlertPrefs({ authWarned: { codex: 111 } }, statePath);
    ss.saveAiUsageAlertPrefs({ authWarned: {} }, statePath);
    expect(ss.loadAiUsageAlertPrefs(statePath).authWarned).toEqual({});
  });

  test("坏数据 (字符串) 被规整成空对象, 不污染下游", () => {
    const ss = requireMain("state-store");
    ss.saveAiUsageAlertPrefs({ authWarned: "garbage" }, statePath);
    expect(ss.loadAiUsageAlertPrefs(statePath).authWarned).toEqual({});
  });
});
