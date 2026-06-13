/**
 * tests/main/state-store.test.js
 *
 * Phase 27: mutes schema + set/clear/expire/clean.
 *
 * 覆盖:
 *   - isMuteActive (纯函数, 边界: until=0=forever, until<now=expired, until>now=active)
 *   - cleanExpiredMutes (纯函数, 过滤掉过期项, 不 mutate 原对象)
 *   - getMutes (load 失败 → {}, 旧 state 缺 mutes → {}, 过期项不返)
 *   - setMute (新 mute, 写盘, 旧 mutes 保留, 过期项清理)
 *   - clearMute (删除存在的/不存在的, 写盘, 过期项清理)
 *   - 输入校验 (name 空, until 非法)
 *   - 老 state.json (无 mutes 字段) 兼容
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  load,
  getMutes,
  setMute,
  clearMute,
  isMuteActive,
  cleanExpiredMutes,
  saveAll,
  markNotified,
  loadLastOpened,
  saveLastOpened,
  loadActiveCategory,
  saveActiveCategory,
  cleanExpiredTaskSummaries,
  loadTaskSummaries,
  saveTaskSummary,
  loadAISessionsConfig,
  saveAISessionsConfig,
  TASK_SUMMARIES_GC_DAYS,
  loadLLMClassifyCache,
  saveLLMClassifyCache,
} from "../../src/main/state-store.js";

let tmpDir;
let statePath;
const NOW = 1750000000000; // 固定时间便于断言

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "state-store-test-"));
  statePath = path.join(tmpDir, "state.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── isMuteActive (纯函数) ─────────────────────────────

describe("isMuteActive (Phase 27 pure fn)", () => {
  it("null/非对象 → false", () => {
    expect(isMuteActive(null, NOW)).toBe(false);
    expect(isMuteActive(undefined, NOW)).toBe(false);
    expect(isMuteActive("foo", NOW)).toBe(false);
    expect(isMuteActive(123, NOW)).toBe(false);
  });

  it("until=0 → 永远有效", () => {
    expect(isMuteActive({ until: 0 }, NOW)).toBe(true);
    expect(isMuteActive({ until: 0, reason: "manual" }, NOW)).toBe(true);
  });

  it("until>now → 还有效", () => {
    expect(isMuteActive({ until: NOW + 1000 }, NOW)).toBe(true);
  });

  it("until<now → 过期", () => {
    expect(isMuteActive({ until: NOW - 1 }, NOW)).toBe(false);
    expect(isMuteActive({ until: NOW - 999999 }, NOW)).toBe(false);
  });

  it("until=now → 过期 (now < until 严格)", () => {
    // 边界: now 恰好等于 until, 视为过期
    expect(isMuteActive({ until: NOW }, NOW)).toBe(false);
  });
});

// ─── cleanExpiredMutes (纯函数) ────────────────────────

describe("cleanExpiredMutes (Phase 27 pure fn)", () => {
  it("空/非对象 → {}", () => {
    expect(cleanExpiredMutes(null, NOW)).toEqual({});
    expect(cleanExpiredMutes(undefined, NOW)).toEqual({});
    expect(cleanExpiredMutes("foo", NOW)).toEqual({});
  });

  it("混合: 留 forever + 留 future + 丢 past", () => {
    const input = {
      A: { until: 0, reason: "manual" }, // 永远 → 留
      B: { until: NOW + 10000, reason: "manual" }, // future → 留
      C: { until: NOW - 1, reason: "manual" }, // past → 丢
      D: { until: NOW - 999999, reason: "manual" }, // past → 丢
    };
    expect(cleanExpiredMutes(input, NOW)).toEqual({
      A: { until: 0, reason: "manual" },
      B: { until: NOW + 10000, reason: "manual" },
    });
  });

  it("不 mutate 原对象", () => {
    const input = { A: { until: 0 }, B: { until: NOW - 1 } };
    const before = JSON.stringify(input);
    cleanExpiredMutes(input, NOW);
    expect(JSON.stringify(input)).toBe(before);
  });
});

// ─── getMutes (load 路径) ───────────────────────────────

describe("getMutes (Phase 27 read)", () => {
  it("文件不存在 → {}", () => {
    expect(getMutes(statePath, NOW)).toEqual({});
  });

  it("老 state.json (无 mutes 字段) → {} (向后兼容)", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({ v: 1, ts: 1, apps: { Cursor: { name: "Cursor" } } }),
      "utf-8",
    );
    expect(getMutes(statePath, NOW)).toEqual({});
  });

  it("mutes 是数组 (损坏) → {}", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({ v: 1, apps: {}, mutes: [] }),
      "utf-8",
    );
    expect(getMutes(statePath, NOW)).toEqual({});
  });

  it("返回时过滤掉过期项", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {
          A: { until: 0, reason: "manual" },
          B: { until: NOW + 100, reason: "manual" },
          C: { until: NOW - 1, reason: "manual" },
        },
      }),
      "utf-8",
    );
    expect(getMutes(statePath, NOW)).toEqual({
      A: { until: 0, reason: "manual" },
      B: { until: NOW + 100, reason: "manual" },
    });
  });

  it("不自动写盘 (只读)", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: { A: { until: NOW - 1, reason: "manual" } },
      }),
      "utf-8",
    );
    getMutes(statePath, NOW);
    // 写盘时间 ts 跟原来一致 (未被 cleanExpiredMutes 写回)
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.mutes).toEqual({ A: { until: NOW - 1, reason: "manual" } });
  });
});

// ─── setMute (写盘) ─────────────────────────────────────

describe("setMute (Phase 27 write)", () => {
  it("新 mute: 写入 mutes 字段, 落盘", () => {
    const result = setMute(
      "Cursor",
      NOW + 7 * 24 * 3600 * 1000,
      "manual",
      statePath,
    );
    expect(result.mutes).toEqual({
      Cursor: { until: NOW + 7 * 24 * 3600 * 1000, reason: "manual" },
    });
    // 写盘
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.mutes).toEqual({
      Cursor: { until: NOW + 7 * 24 * 3600 * 1000, reason: "manual" },
    });
  });

  it("until=0 (永远)", () => {
    const result = setMute("Cursor", 0, "manual", statePath);
    expect(result.mutes.Cursor.until).toBe(0);
  });

  it('reason 缺省 → "manual"', () => {
    const result = setMute("Cursor", NOW + 1000, undefined, statePath);
    expect(result.mutes.Cursor.reason).toBe("manual");
  });

  it("保留旧 mutes", () => {
    setMute("Cursor", 0, "manual", statePath);
    setMute("Kimi", NOW + 1000, "manual", statePath);
    const result = getMutes(statePath, NOW);
    expect(Object.keys(result).sort()).toEqual(["Cursor", "Kimi"]);
  });

  it("同名覆盖: 新值替旧值", () => {
    setMute("Cursor", NOW + 100, "manual", statePath);
    setMute("Cursor", 0, "manual", statePath);
    const result = getMutes(statePath, NOW);
    expect(result.Cursor.until).toBe(0);
  });

  it("写盘时清理过期项", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {
          OldApp: { until: NOW - 9999, reason: "manual" },
        },
      }),
      "utf-8",
    );
    setMute("NewApp", NOW + 100, "manual", statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.mutes).toEqual({
      NewApp: { until: NOW + 100, reason: "manual" },
    });
  });

  it("保留 apps 字段 (不归 0)", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: { Cursor: { name: "Cursor", latest_version: "3.6" } },
        mutes: {},
      }),
      "utf-8",
    );
    setMute("Cursor", 0, "manual", statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.apps.Cursor.latest_version).toBe("3.6");
  });

  it("name 空 → TypeError", () => {
    expect(() => setMute("", 0, "manual", statePath)).toThrow(TypeError);
    expect(() => setMute(null, 0, "manual", statePath)).toThrow(TypeError);
  });

  it("until 非法 → TypeError", () => {
    expect(() => setMute("Cursor", -1, "manual", statePath)).toThrow(TypeError);
    expect(() => setMute("Cursor", NaN, "manual", statePath)).toThrow(
      TypeError,
    );
    expect(() => setMute("Cursor", Infinity, "manual", statePath)).toThrow(
      TypeError,
    );
    expect(() => setMute("Cursor", "1000", "manual", statePath)).toThrow(
      TypeError,
    );
  });
});

// ─── clearMute (写盘) ───────────────────────────────────

describe("clearMute (Phase 27 write)", () => {
  it("删除存在的 mute", () => {
    setMute("Cursor", 0, "manual", statePath);
    setMute("Kimi", 0, "manual", statePath);
    clearMute("Cursor", statePath);
    const result = getMutes(statePath, NOW);
    expect(result).toEqual({ Kimi: { until: 0, reason: "manual" } });
  });

  it("删除不存在的 mute → noop", () => {
    setMute("Cursor", 0, "manual", statePath);
    clearMute("NoSuchApp", statePath);
    const result = getMutes(statePath, NOW);
    expect(Object.keys(result)).toEqual(["Cursor"]);
  });

  it("写盘时清理过期项 (跟 setMute 行为一致)", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {
          Old: { until: NOW - 1, reason: "manual" },
          Active: { until: NOW + 100, reason: "manual" },
        },
      }),
      "utf-8",
    );
    clearMute("Active", statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.mutes).toEqual({});
  });

  it("name 空 → TypeError", () => {
    expect(() => clearMute("", statePath)).toThrow(TypeError);
  });
});

// ─── load() 兼容老 state.json ─────────────────────────

describe("load() mutes 兼容 (Phase 27)", () => {
  it("老 state.json 无 mutes → load 不 mutate, 仍可读 (mutes undefined)", () => {
    // load() 是纯读, 不强制注入 mutes. 兼容老的 state.json 形状.
    fs.writeFileSync(
      statePath,
      JSON.stringify({ v: 1, apps: { Cursor: {} } }),
      "utf-8",
    );
    const s = load(statePath);
    expect(s.mutes).toBeUndefined();
  });

  it("saveAll 写 mutes 字段 (跟 apps 平级)", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: { A: { until: 0, reason: "manual" } },
      }),
      "utf-8",
    );
    saveAll(
      [
        {
          name: "Cursor",
          latest_version: "3.6",
          has_update: false,
          status: "up_to_date",
        },
      ],
      statePath,
    );
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.mutes).toEqual({ A: { until: 0, reason: "manual" } });
    expect(raw.apps.Cursor.latest_version).toBe("3.6");
  });

  it("saveAll 写盘时清过期", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: { A: { until: NOW - 1, reason: "manual" } },
      }),
      "utf-8",
    );
    saveAll([], statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.mutes).toEqual({});
  });
});

// ─── Phase 29: Last-opened ─────────────────────────────────────

describe("loadLastOpened / saveLastOpened (Phase 29)", () => {
  it("文件不存在 → {}", () => {
    expect(loadLastOpened(statePath)).toEqual({});
  });

  it("老 state.json (无 last_opened 字段) → {} (向后兼容)", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({ v: 1, apps: { Cursor: { name: "Cursor" } } }),
      "utf-8",
    );
    expect(loadLastOpened(statePath)).toEqual({});
  });

  it("last_opened 是数组 (损坏) → {}", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({ v: 1, apps: {}, last_opened: [] }),
      "utf-8",
    );
    expect(loadLastOpened(statePath)).toEqual({});
  });

  it("读出 last_opened map", () => {
    const lo = {
      Cursor: { ms: 1750000000000, source: "spotlight" },
      WorkBuddy: { ms: null, source: "unknown" },
    };
    fs.writeFileSync(
      statePath,
      JSON.stringify({ v: 1, apps: {}, last_opened: lo }),
      "utf-8",
    );
    expect(loadLastOpened(statePath)).toEqual(lo);
  });

  it("saveLastOpened 写入 + 原子", () => {
    const map = { Cursor: { ms: 1750000000000, source: "spotlight" } };
    saveLastOpened(map, statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.last_opened).toEqual(map);
  });

  it("saveLastOpened 保留 apps 字段 (不归 0)", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: { Cursor: { name: "Cursor", latest_version: "3.6" } },
        mutes: {},
      }),
      "utf-8",
    );
    saveLastOpened(
      { Kimi: { ms: 1700000000000, source: "spotlight" } },
      statePath,
    );
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.apps.Cursor.latest_version).toBe("3.6");
    expect(raw.last_opened.Kimi.ms).toBe(1700000000000);
  });

  it("saveLastOpened 保留 mutes 字段", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: { Cursor: { until: 0, reason: "manual" } },
      }),
      "utf-8",
    );
    saveLastOpened({ Kimi: { ms: 1700000000000, source: "atime" } }, statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.mutes.Cursor.until).toBe(0);
    expect(raw.last_opened.Kimi.source).toBe("atime");
  });

  it("saveLastOpened 写盘时清过期 mutes", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: { Old: { until: NOW - 1, reason: "manual" } },
      }),
      "utf-8",
    );
    saveLastOpened({ X: { ms: 1, source: "spotlight" } }, statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.mutes).toEqual({});
  });

  it("saveLastOpened 校验: map 必须是 plain object", () => {
    expect(() => saveLastOpened(null, statePath)).toThrow(TypeError);
    expect(() => saveLastOpened("foo", statePath)).toThrow(TypeError);
    expect(() => saveLastOpened([], statePath)).toThrow(TypeError);
  });

  it("saveAll 写盘时保留 last_opened 字段", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        last_opened: { X: { ms: 123, source: "spotlight" } },
      }),
      "utf-8",
    );
    saveAll(
      [
        {
          name: "Cursor",
          latest_version: "3.6",
          has_update: false,
          status: "up_to_date",
        },
      ],
      statePath,
    );
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.last_opened.X.ms).toBe(123);
  });

  it("saveAll 写盘时保留 worldcupBets 字段", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        worldcupBets: {
          "2026-06-12": {
            date: "2026-06-12",
            stake: 100,
            pnl: 50,
            note: "",
            updatedAt: 1,
          },
        },
      }),
      "utf-8",
    );
    saveAll(
      [
        {
          name: "Cursor",
          latest_version: "3.6",
          has_update: false,
          status: "up_to_date",
        },
      ],
      statePath,
    );
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.worldcupBets["2026-06-12"]).toMatchObject({
      stake: 100,
      pnl: 50,
    });
  });

  it("markNotified 写盘时保留 last_opened 字段", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: { Cursor: { name: "Cursor" } },
        mutes: {},
        last_opened: { Cursor: { ms: 999, source: "spotlight" } },
      }),
      "utf-8",
    );
    markNotified(["Cursor"], statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.last_opened.Cursor.ms).toBe(999);
  });

  it("clearMute 写盘时保留 last_opened 字段", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: { Cursor: { until: 0, reason: "manual" } },
        last_opened: { Cursor: { ms: 999, source: "spotlight" } },
      }),
      "utf-8",
    );
    clearMute("Cursor", statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.last_opened.Cursor.ms).toBe(999);
  });
});

// ─── loadActiveCategory / saveActiveCategory (Phase A) ───

describe("loadActiveCategory / saveActiveCategory (Phase A)", () => {
  it('文件不存在 → "all" (兜底)', () => {
    expect(loadActiveCategory(statePath)).toBe("all");
  });

  it('老 state.json (无 active_category 字段) → "all" (向后兼容)', () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        last_opened: {},
      }),
      "utf-8",
    );
    expect(loadActiveCategory(statePath)).toBe("all");
  });

  it('active_category 是非 string (数字 / 数组 / null) → "all" 兜底', () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        active_category: 123,
      }),
      "utf-8",
    );
    expect(loadActiveCategory(statePath)).toBe("all");

    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        active_category: null,
      }),
      "utf-8",
    );
    expect(loadActiveCategory(statePath)).toBe("all");

    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        active_category: ["a", "b"],
      }),
      "utf-8",
    );
    expect(loadActiveCategory(statePath)).toBe("all");
  });

  it("saveActiveCategory 写入 + load 回读一致 (round-trip)", () => {
    const next1 = saveActiveCategory("ai", statePath);
    expect(next1.active_category).toBe("ai");
    expect(loadActiveCategory(statePath)).toBe("ai");

    const next2 = saveActiveCategory("dev", statePath);
    expect(next2.active_category).toBe("dev");
    expect(loadActiveCategory(statePath)).toBe("dev");

    const next3 = saveActiveCategory("all", statePath);
    expect(next3.active_category).toBe("all");
    expect(loadActiveCategory(statePath)).toBe("all");
  });

  it("saveActiveCategory 保留 apps / mutes / last_opened 字段", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: { Cursor: { name: "Cursor" } },
        mutes: { Cursor: { until: 0, reason: "manual" } },
        last_opened: { Cursor: { ms: 999, source: "spotlight" } },
      }),
      "utf-8",
    );
    saveActiveCategory("ai", statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.apps.Cursor.name).toBe("Cursor");
    expect(raw.mutes.Cursor.until).toBe(0);
    expect(raw.last_opened.Cursor.ms).toBe(999);
    expect(raw.active_category).toBe("ai");
  });

  it("saveActiveCategory 校验: id 必须是 non-empty string", () => {
    expect(() => saveActiveCategory("", statePath)).toThrow(TypeError);
    expect(() => saveActiveCategory(null, statePath)).toThrow(TypeError);
    expect(() => saveActiveCategory(123, statePath)).toThrow(TypeError);
  });

  it("setMute / clearMute 写盘时保留 active_category 字段", () => {
    saveActiveCategory("ai", statePath);
    setMute("Kimi", 0, "manual", statePath);
    expect(loadActiveCategory(statePath)).toBe("ai");
    clearMute("Kimi", statePath);
    expect(loadActiveCategory(statePath)).toBe("ai");
  });
});

// ─── loadTaskSummaries / saveTaskSummary (重做版任务总结缓存) ───

describe("loadTaskSummaries / saveTaskSummary", () => {
  it("文件不存在 → {}", () => {
    expect(loadTaskSummaries(statePath)).toEqual({});
  });

  it("老 state.json (无 task_summaries 字段) → {} (向后兼容)", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        last_opened: {},
        active_category: "all",
      }),
      "utf-8",
    );
    expect(loadTaskSummaries(statePath)).toEqual({});
  });

  it("task_summaries 是数组 (损坏) → {}", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        task_summaries: ["bad"],
      }),
      "utf-8",
    );
    expect(loadTaskSummaries(statePath)).toEqual({});
  });

  it("saveTaskSummary 写入 + loadTaskSummaries 回读 (round-trip)", () => {
    const entry = {
      taskKey: "cursor:uuid-1",
      sessionId: "uuid-1",
      appName: "cursor",
      title: "修复 tray 图标",
      userGoal: "修 Pulse tray icon",
      outcome: "已修复",
      provider: "deepseek",
      model: "deepseek-chat",
      generatedAt: Date.now(),
      contentHash: "4-abc123",
      dateKey: "2026-06-07",
    };
    saveTaskSummary(entry, statePath);
    const out = loadTaskSummaries(statePath);
    expect(out["cursor:uuid-1"]).toMatchObject({
      taskKey: "cursor:uuid-1",
      appName: "cursor",
      title: "修复 tray 图标",
      userGoal: "修 Pulse tray icon",
      outcome: "已修复",
      contentHash: "4-abc123",
    });
  });

  it("saveTaskSummary 缺 generatedAt → 自动补 now", () => {
    saveTaskSummary({ taskKey: "codex:s1", title: "x" }, statePath);
    const out = loadTaskSummaries(statePath);
    expect(typeof out["codex:s1"].generatedAt).toBe("number");
    expect(out["codex:s1"].generatedAt).toBeGreaterThan(0);
  });

  it("saveTaskSummary 保留 apps / mutes / last_opened / active_category", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: { Cursor: { name: "Cursor" } },
        mutes: { Cursor: { until: 0, reason: "manual" } },
        last_opened: { Cursor: { ms: 999, source: "spotlight" } },
        active_category: "dev",
      }),
      "utf-8",
    );
    saveTaskSummary({ taskKey: "cursor:u1", title: "x" }, statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.apps.Cursor.name).toBe("Cursor");
    expect(raw.mutes.Cursor.until).toBe(0);
    expect(raw.last_opened.Cursor.ms).toBe(999);
    expect(raw.active_category).toBe("dev");
  });

  it("saveTaskSummary 校验: taskKey 必须有", () => {
    expect(() => saveTaskSummary({}, statePath)).toThrow(TypeError);
    expect(() => saveTaskSummary({ taskKey: "" }, statePath)).toThrow(
      TypeError,
    );
  });

  it("cleanExpiredTaskSummaries: 30 天外 GC", () => {
    const NOW2 = 1750000000000;
    const old = {
      "cursor:a": { taskKey: "cursor:a", generatedAt: NOW2 - 60 * 86400_000 },
      "cursor:b": { taskKey: "cursor:b", generatedAt: NOW2 - 25 * 86400_000 }, // 25d → 留
      "codex:c": { taskKey: "codex:c", generatedAt: NOW2 - 7 * 86400_000 },
      "no-ts": { taskKey: "no-ts" }, // 无 generatedAt → 删
    };
    const out = cleanExpiredTaskSummaries(old, NOW2);
    expect(out["cursor:a"]).toBeUndefined();
    expect(out["cursor:b"]).toBeDefined();
    expect(out["codex:c"]).toBeDefined();
    expect(out["no-ts"]).toBeUndefined();
  });

  it("setMute / saveAISessionsConfig 写盘时保留 task_summaries", () => {
    saveTaskSummary({ taskKey: "cursor:u1", title: "x" }, statePath);
    saveAISessionsConfig({ enabled: true, provider: "deepseek" }, statePath);
    setMute("Kimi", 0, "manual", statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.task_summaries["cursor:u1"]).toBeDefined();
    expect(raw.ai_sessions_config.enabled).toBe(true);
  });

  it("saveAll / setMute / saveLastOpened 写盘时保留 reminders / recentActivity", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: { X: { name: "X" } },
        mutes: {},
        reminders: [{ id: "r-1", title: "开会", status: "pending" }],
        recentActivity: [
          { ts: 1, kind: "ithome-view", ref: "2026-06-13", label: "新闻" },
          { ts: 2, kind: "app-upgrade", ref: "Cursor", label: "Cursor 已升级" },
        ],
      }),
      "utf-8",
    );
    saveAll([{ name: "X", status: "up_to_date" }], statePath);
    setMute("Kimi", 0, "manual", statePath);
    saveLastOpened({ Cursor: { ms: 1, source: "test" } }, statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.reminders).toHaveLength(1);
    expect(raw.reminders[0].id).toBe("r-1");
    expect(raw.recentActivity).toHaveLength(2);
    expect(raw.recentActivity[1].kind).toBe("app-upgrade");
  });

  it("TASK_SUMMARIES_GC_DAYS 常量 = 30", () => {
    expect(TASK_SUMMARIES_GC_DAYS).toBe(30);
  });

  it("旧 daily_digests / daily_digest_v2 / last_digest_attempts 字段写盘时被丢弃", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        daily_digests: { "2026-06-07": { dateKey: "2026-06-07" } },
        daily_digest_v2: { "2026-06-07": { dateKey: "2026-06-07" } },
        last_digest_attempts: [{ phase: "probe" }],
      }),
      "utf-8",
    );
    saveTaskSummary({ taskKey: "cursor:u1", title: "x" }, statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.daily_digests).toBeUndefined();
    expect(raw.daily_digest_v2).toBeUndefined();
    expect(raw.last_digest_attempts).toBeUndefined();
    expect(raw.task_summaries["cursor:u1"]).toBeDefined();
  });
});

// ─── loadAISessionsConfig / saveAISessionsConfig (Phase B) ───

describe("loadAISessionsConfig / saveAISessionsConfig (Phase B)", () => {
  it("文件不存在 → null", () => {
    expect(loadAISessionsConfig(statePath)).toBeNull();
  });

  it("老 state.json (无 ai_sessions_config 字段) → null", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({ v: 1, apps: {}, mutes: {} }),
      "utf-8",
    );
    expect(loadAISessionsConfig(statePath)).toBeNull();
  });

  it("saveAISessionsConfig 写入 + load 回读 (round-trip)", () => {
    const cfg = {
      enabled: true,
      provider: "ollama",
      model: "qwen3.5:9b",
      ollama: { host: "http://localhost:11434" },
    };
    saveAISessionsConfig(cfg, statePath);
    const out = loadAISessionsConfig(statePath);
    expect(out).toMatchObject(cfg);
  });

  it("saveAISessionsConfig 保留 task_summaries 字段", () => {
    saveTaskSummary({ taskKey: "cursor:u1", title: "x" }, statePath);
    saveAISessionsConfig({ enabled: true, provider: "deepseek" }, statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.task_summaries["cursor:u1"]).toBeDefined();
    expect(raw.ai_sessions_config.enabled).toBe(true);
  });

  it("saveAISessionsConfig 校验: cfg 必须是 object 或 null", () => {
    expect(() => saveAISessionsConfig(123, statePath)).toThrow(TypeError);
    expect(() => saveAISessionsConfig("str", statePath)).toThrow(TypeError);
  });
});

// ─── loadLLMClassifyCache / saveLLMClassifyCache (Step B) ───

describe("loadLLMClassifyCache / saveLLMClassifyCache (Step B LLM classify)", () => {
  it("文件不存在 → loadLLMClassifyCache 返 {}", () => {
    expect(loadLLMClassifyCache(statePath)).toEqual({});
  });

  it("老 state.json (无 classify_llm_cache 字段) → {}", () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({ v: 1, apps: {}, mutes: {} }),
      "utf-8",
    );
    expect(loadLLMClassifyCache(statePath)).toEqual({});
  });

  it("saveLLMClassifyCache 写入 + load 回读 (round-trip)", () => {
    saveLLMClassifyCache({ kimi: "ai", chrome: "browser" }, statePath);
    expect(loadLLMClassifyCache(statePath)).toEqual({
      kimi: "ai",
      chrome: "browser",
    });
  });

  it("saveLLMClassifyCache 合并: 新值覆盖旧值, 旧值保留", () => {
    saveLLMClassifyCache({ kimi: "ai", chrome: "browser" }, statePath);
    saveLLMClassifyCache({ kimi: "dev", spotify: "media" }, statePath);
    expect(loadLLMClassifyCache(statePath)).toEqual({
      kimi: "dev", // 覆盖
      chrome: "browser", // 保留
      spotify: "media", // 新增
    });
  });

  it("saveLLMClassifyCache 过滤非 string / 空值", () => {
    // 注: JS 整数 key 会自动转 string '123', 这是 by-design 行为
    // 这里只测空 key / 空 value 被滤掉
    saveLLMClassifyCache({ "": "ai", kimi: "ai", valid: "" }, statePath);
    expect(loadLLMClassifyCache(statePath)).toEqual({ kimi: "ai" });
  });

  it("saveLLMClassifyCache 校验: map 必须是 plain object", () => {
    expect(() => saveLLMClassifyCache(null, statePath)).toThrow(TypeError);
    expect(() => saveLLMClassifyCache([], statePath)).toThrow(TypeError);
    expect(() => saveLLMClassifyCache(123, statePath)).toThrow(TypeError);
  });

  it("saveLLMClassifyCache 不破坏其他字段 (apps / mutes / task_summaries / ai_sessions_config)", () => {
    saveTaskSummary({ taskKey: "cursor:u1", title: "x" }, statePath);
    saveAISessionsConfig({ enabled: true, provider: "deepseek" }, statePath);
    saveLLMClassifyCache({ kimi: "ai" }, statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.task_summaries["cursor:u1"]).toBeDefined();
    expect(raw.ai_sessions_config.enabled).toBe(true);
    expect(raw.classify_llm_cache).toEqual({ kimi: "ai" });
  });
});
