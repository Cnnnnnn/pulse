import { describe, it, expect } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const {
  TRAY_SEGMENTS,
  DEFAULT_PREFS,
  normalizePrefs,
} = requireMain("tray-menu-prefs");
describe("tray-menu-prefs: TRAY_SEGMENTS 单一真相", () => {
  it("包含 6 个 segment,key 集合为 updates/ai_usage/worldcup/metals/check_action/config_action", () => {
    expect(TRAY_SEGMENTS).toHaveLength(6);
    expect(TRAY_SEGMENTS.map((s) => s.key).sort()).toEqual([
      "ai_usage",
      "check_action",
      "config_action",
      "metals",
      "updates",
      "worldcup",
    ]);
    expect(TRAY_SEGMENTS.every((s) => typeof s.label === "string" && s.label.length > 0)).toBe(true);
  });
});

describe("tray-menu-prefs: DEFAULT_PREFS", () => {
  it("version=1,segments 包含 6 个 key 且全为 true", () => {
    expect(DEFAULT_PREFS.version).toBe(1);
    expect(Object.keys(DEFAULT_PREFS.segments).sort()).toEqual([
      "ai_usage",
      "check_action",
      "config_action",
      "metals",
      "updates",
      "worldcup",
    ]);
    expect(Object.values(DEFAULT_PREFS.segments).every((v) => v === true)).toBe(true);
  });
});

describe("tray-menu-prefs: normalizePrefs 纯函数", () => {
  it("只 updates:false → 其他 5 项仍 true", () => {
    const r = normalizePrefs({ segments: { updates: false } });
    expect(r.segments.updates).toBe(false);
    expect(r.segments.ai_usage).toBe(true);
    expect(r.segments.worldcup).toBe(true);
    expect(r.segments.metals).toBe(true);
    expect(r.segments.check_action).toBe(true);
    expect(r.segments.config_action).toBe(true);
    expect(r.version).toBe(1);
  });

  it("未知 key:true → 被丢弃,6 项齐全", () => {
    const r = normalizePrefs({
      segments: { unknown_key: true, evil: false, updates: false },
    });
    expect(Object.keys(r.segments).sort()).toEqual([
      "ai_usage",
      "check_action",
      "config_action",
      "metals",
      "updates",
      "worldcup",
    ]);
    expect(r.segments.updates).toBe(false);
    expect(r.segments.ai_usage).toBe(true);
  });

  it("空 segments:{} → 全部 6 项为 true", () => {
    const r = normalizePrefs({ segments: {} });
    expect(Object.values(r.segments).every((v) => v === true)).toBe(true);
    expect(Object.keys(r.segments)).toHaveLength(6);
  });

  it("null / undefined input → 返回 DEFAULT_PREFS", () => {
    expect(normalizePrefs(null)).toBe(DEFAULT_PREFS);
    expect(normalizePrefs(undefined)).toBe(DEFAULT_PREFS);
    expect(normalizePrefs({})).toBe(DEFAULT_PREFS);
    expect(normalizePrefs("foo")).toBe(DEFAULT_PREFS);
    expect(normalizePrefs(123)).toBe(DEFAULT_PREFS);
  });

  it("value 不是 boolean → 补默认 true", () => {
    const r = normalizePrefs({
      segments: { updates: "false", ai_usage: null, worldcup: 0 },
    });
    expect(r.segments.updates).toBe(true);
    expect(r.segments.ai_usage).toBe(true);
    expect(r.segments.worldcup).toBe(true);
  });

  it("不应该 mutate 入参 (返回新对象)", () => {
    const input = { segments: { updates: false } };
    const snap = JSON.parse(JSON.stringify(input));
    normalizePrefs(input);
    expect(input).toEqual(snap);
  });
});
