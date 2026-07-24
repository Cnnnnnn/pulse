/**
 * tests/main/notification-policy.test.js
 *
 * notification-policy.js 是 v2.46 唯一缺测试的核心 module.
 * 3 个 pure function: parseHHMM / inQuietHours / suppressedByCooldown.
 *
 * 业务: Quiet hours 抑制 + cooldown 抑制. 决定一个 app 升级要不要弹通知.
 */
import { describe, it, expect } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const {
  parseHHMM,
  inQuietHours,
  suppressedByCooldown,
} = requireMain("notification-policy");
describe("parseHHMM", () => {
  it("合法输入: '08:00' / '23:30' / '0:00'", () => {
    expect(parseHHMM("08:00")).toBe(480);
    expect(parseHHMM("23:30")).toBe(1410);
    expect(parseHHMM("0:00")).toBe(0);
  });

  it("单数字 hour 可 (9:00), 单数字 min 不行 (9:5)", () => {
    // regex 要求 min 2 位 ('(\\d{2})$'), hour 容忍 1-2 位
    // 这是 input format 严格性选择, 不补 padding, 因为 UX 上用户填 "9:5" 不规范
    expect(parseHHMM("9:00")).toBe(540);
    expect(parseHHMM("9:5")).toBeNull();
  });

  it("非法输入返 null", () => {
    expect(parseHHMM("")).toBeNull();
    expect(parseHHMM("25:00")).toBeNull();   // h>23
    expect(parseHHMM("12:60")).toBeNull();   // min>59
    expect(parseHHMM("abc")).toBeNull();
    expect(parseHHMM("12")).toBeNull();
    expect(parseHHMM("12:34:56")).toBeNull();
    expect(parseHHMM(null)).toBeNull();
    expect(parseHHMM(undefined)).toBeNull();
    expect(parseHHMM(1234)).toBeNull();
  });
});

describe("inQuietHours", () => {
  it("start/end 非法 → 返 false (不抑制)", () => {
    const now = new Date("2026-06-25T03:00:00");
    expect(inQuietHours(now, "bad", "08:00")).toBe(false);
    expect(inQuietHours(now, "23:00", "bad")).toBe(false);
    expect(inQuietHours(now, null, null)).toBe(false);
  });

  it("start === end → 0 长度窗口 = 不抑制", () => {
    const now = new Date("2026-06-25T12:00:00");
    expect(inQuietHours(now, "12:00", "12:00")).toBe(false);
  });

  it("同日窗口: 09:00-17:00, 16:00 命中, 18:00 不命中, 08:59 不命中", () => {
    const at16 = new Date("2026-06-25T16:00:00");
    const at18 = new Date("2026-06-25T18:00:00");
    const at859 = new Date("2026-06-25T08:59:00");
    expect(inQuietHours(at16, "09:00", "17:00")).toBe(true);
    expect(inQuietHours(at18, "09:00", "17:00")).toBe(false);
    expect(inQuietHours(at859, "09:00", "17:00")).toBe(false);
  });

  it("同日窗口: 边界 (09:00 含, 17:00 不含)", () => {
    const at9 = new Date("2026-06-25T09:00:00");
    const at17 = new Date("2026-06-25T17:00:00");
    expect(inQuietHours(at9, "09:00", "17:00")).toBe(true);
    expect(inQuietHours(at17, "09:00", "17:00")).toBe(false);
  });

  it("跨午夜窗口: 23:00-08:00, 02:00 命中 (凌晨), 12:00 不命中 (白天)", () => {
    const at2 = new Date("2026-06-25T02:00:00");
    const at12 = new Date("2026-06-25T12:00:00");
    const at23 = new Date("2026-06-25T23:00:00");
    const at755 = new Date("2026-06-25T07:55:00");
    expect(inQuietHours(at2, "23:00", "08:00")).toBe(true);
    expect(inQuietHours(at12, "23:00", "08:00")).toBe(false);
    expect(inQuietHours(at23, "23:00", "08:00")).toBe(true);
    expect(inQuietHours(at755, "23:00", "08:00")).toBe(true);
  });

  it("跨午夜窗口: 边界 (23:00 含, 08:00 不含)", () => {
    const at8 = new Date("2026-06-25T08:00:00");
    expect(inQuietHours(at8, "23:00", "08:00")).toBe(false);
  });
});

describe("suppressedByCooldown", () => {
  const APP_A = { name: "A", has_update: true };
  const APP_B = { name: "B", has_update: true };
  const APP_C = { name: "C", has_update: false }; // 没更新 → 不入列

  it("cooldownMs=0 或负 → 返空 (禁用抑制)", () => {
    const results = [APP_A];
    const state = { apps: { A: { last_notified: Date.now() } } };
    expect(suppressedByCooldown(results, state, 0)).toEqual([]);
    expect(suppressedByCooldown(results, state, -1)).toEqual([]);
  });

  it("cooldown 窗口内 → 抑制; 窗口外 → 不抑制", () => {
    const now = 1_700_000_000_000;
    const HOUR = 60 * 60 * 1000;
    const results = [APP_A];
    // 刚通知 (now-1min) → 抑制
    const recent = { apps: { A: { last_notified: now - 60_000 } } };
    expect(suppressedByCooldown(results, recent, 24 * HOUR, now)).toEqual(["A"]);
    // 25h 前通知 → 不抑制
    const old = { apps: { A: { last_notified: now - 25 * HOUR } } };
    expect(suppressedByCooldown(results, old, 24 * HOUR, now)).toEqual([]);
  });

  it("没 last_notified → 不抑制 (首次通知)", () => {
    const now = 1_700_000_000_000;
    const results = [APP_A];
    const state = { apps: { A: {} } }; // 没 last_notified
    expect(suppressedByCooldown(results, state, 24 * 60 * 60 * 1000, now)).toEqual([]);
  });

  it("has_update=false → 跳过 (不检查 cooldown)", () => {
    const now = 1_700_000_000_000;
    const results = [APP_C]; // has_update: false
    const state = { apps: { C: { last_notified: now - 1000 } } };
    expect(suppressedByCooldown(results, state, 24 * 60 * 60 * 1000, now)).toEqual([]);
  });

  it("混合: A 抑制 + B 不抑制 + C 跳过", () => {
    const now = 1_700_000_000_000;
    const HOUR = 60 * 60 * 1000;
    const results = [APP_A, APP_B, APP_C];
    const state = {
      apps: {
        A: { last_notified: now - HOUR },        // 抑制
        B: { last_notified: now - 25 * HOUR },   // 25h 前, 超过 24h cooldown
        // C 没 last_notified
      },
    };
    const out = suppressedByCooldown(results, state, 24 * HOUR, now);
    expect(out).toEqual(["A"]);
  });

  it("边界: 正好 24h 整 → 不算抑制 (严格小于)", () => {
    const now = 1_700_000_000_000;
    const HOUR = 60 * 60 * 1000;
    const results = [APP_A];
    const state = { apps: { A: { last_notified: now - 24 * HOUR } } };
    expect(suppressedByCooldown(results, state, 24 * HOUR, now)).toEqual([]);
  });

  it("state=null / undefined / apps={} → 全部首次 (不抑制)", () => {
    const results = [APP_A, APP_B];
    expect(suppressedByCooldown(results, null, 24 * 60 * 60 * 1000, 1_700_000_000_000)).toEqual([]);
    expect(suppressedByCooldown(results, undefined, 24 * 60 * 60 * 1000, 1_700_000_000_000)).toEqual([]);
    expect(suppressedByCooldown(results, {}, 24 * 60 * 60 * 1000, 1_700_000_000_000)).toEqual([]);
  });

  it("result.name 缺 / 空 / 非字符串 → 跳过", () => {
    const now = 1_700_000_000_000;
    const HOUR = 60 * 60 * 1000;
    const results = [
      { has_update: true },             // 无 name
      { name: "", has_update: true },   // 空 name
      APP_A,                            // 合法
    ];
    const state = { apps: { A: { last_notified: now - HOUR } } };
    expect(suppressedByCooldown(results, state, 24 * HOUR, now)).toEqual(["A"]);
  });

  it("last_notified 非 number → 跳过 (首次)", () => {
    const now = 1_700_000_000_000;
    const HOUR = 60 * 60 * 1000;
    const results = [APP_A];
    const state = { apps: { A: { last_notified: "yesterday" } } };
    expect(suppressedByCooldown(results, state, 24 * HOUR, now)).toEqual([]);
  });

  it("不传 now → 用 Date.now() (不会因为 NOW 巧合失败)", () => {
    const state = { apps: { A: { last_notified: Date.now() - 1000 } } };
    expect(suppressedByCooldown([APP_A], state, 60000)).toEqual(["A"]);
  });
});
