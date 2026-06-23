/**
 * tests/main/version-history.test.js
 *
 * 2026-06-14: App rollback · version history layer.
 *
 * 覆盖:
 *   - recordUpgrade: 写入头部 / 多次写入倒序 / cap 2 / 输入校验
 *   - listHistory: 空 app → [] / 不存在的 app → []
 *   - deleteEntry: 删指定 (app, to) / 删完清空 app 键 / 不存在返 0
 *   - getTotalSize: 跨多个 app 累加 / 空 → 0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  recordUpgrade,
  listHistory,
  deleteEntry,
  getTotalSize,
  HISTORY_CAP,
} from "../../src/main/version-history.js";
import * as stateStore from "../../src/main/state-store.js";

let tmpRoot;
let statePath;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-vh-test-"));
  statePath = path.join(tmpRoot, "state.json");
  // 注入: state-store 默认路径用 tmpRoot 当 userData
  // 通过 patchState 的 statePath 参数或 defaultPath 旁路 —
  // 简洁方式: 直接给所有 save 函数传 statePath
});
afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeEntry(to, opts = {}) {
  return {
    from: opts.from || "0",
    to,
    at: opts.at || Date.now(),
    backupPath: opts.backupPath || `/x/${to}.app`,
    source: opts.source || "brew_formulae",
    sizeBytes: opts.sizeBytes || 100,
  };
}

describe("recordUpgrade", () => {
  it("写入 entry 到 history[app] 头部", () => {
    recordUpgrade("Cursor", makeEntry("1.0.0"), statePath);
    const list = listHistory("Cursor", statePath);
    expect(list).toHaveLength(1);
    expect(list[0].to).toBe("1.0.0");
  });

  it("多次 → 倒序 (最新在 0)", () => {
    recordUpgrade("Cursor", makeEntry("1.0.0"), statePath);
    recordUpgrade("Cursor", makeEntry("2.0.0"), statePath);
    const list = listHistory("Cursor", statePath);
    expect(list.map((e) => e.to)).toEqual(["2.0.0", "1.0.0"]);
  });

  it(`cap=${HISTORY_CAP}: 写第 3 条时 state 数组 cap, 不再增长`, () => {
    recordUpgrade("Cursor", makeEntry("1.0.0"), statePath);
    recordUpgrade("Cursor", makeEntry("2.0.0"), statePath);
    recordUpgrade("Cursor", makeEntry("3.0.0"), statePath);
    const list = listHistory("Cursor", statePath);
    expect(list).toHaveLength(HISTORY_CAP);
    expect(list[0].to).toBe("3.0.0");
  });

  it("输入校验: appName 空 / entry 非法 → TypeError", () => {
    expect(() => recordUpgrade("", makeEntry("1.0.0"), statePath)).toThrow(TypeError);
    expect(() => recordUpgrade(null, makeEntry("1.0.0"), statePath)).toThrow(TypeError);
    expect(() => recordUpgrade("Cursor", null, statePath)).toThrow(TypeError);
    expect(() => recordUpgrade("Cursor", [], statePath)).toThrow(TypeError);
  });
});

describe("listHistory", () => {
  it("空 state → []", () => {
    expect(listHistory("Cursor", statePath)).toEqual([]);
  });

  it("app 不在 history → []", () => {
    recordUpgrade("Cursor", makeEntry("1.0.0"), statePath);
    expect(listHistory("Other", statePath)).toEqual([]);
  });

  it("读取落盘后的数据 (round-trip via state.json)", () => {
    recordUpgrade("Cursor", makeEntry("1.0.0"), statePath);
    // 模拟重启: 新读 state.json
    const fresh = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(fresh.version_history.Cursor[0].to).toBe("1.0.0");
  });
});

describe("deleteEntry", () => {
  it("删指定 (app, to) → freed = sizeBytes, 数组移除", () => {
    recordUpgrade("Cursor", makeEntry("1.0.0", { sizeBytes: 100 }), statePath);
    recordUpgrade("Cursor", makeEntry("2.0.0", { sizeBytes: 200 }), statePath);
    const freed = deleteEntry("Cursor", "1.0.0", statePath);
    expect(freed).toBe(100);
    const list = listHistory("Cursor", statePath);
    expect(list).toHaveLength(1);
    expect(list[0].to).toBe("2.0.0");
  });

  it("删完数组空 → app 键也删 (state.json 不留空 app)", () => {
    recordUpgrade("Cursor", makeEntry("1.0.0"), statePath);
    deleteEntry("Cursor", "1.0.0", statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.version_history).toEqual({});
  });

  it("to 不存在 → 返 0, 不 throw", () => {
    recordUpgrade("Cursor", makeEntry("1.0.0"), statePath);
    const freed = deleteEntry("Cursor", "9.9.9", statePath);
    expect(freed).toBe(0);
    expect(listHistory("Cursor", statePath)).toHaveLength(1);
  });
});

describe("getTotalSize", () => {
  it("累加 sizeBytes 跨多个 app", () => {
    recordUpgrade("Cursor", makeEntry("1.0.0", { sizeBytes: 100 }), statePath);
    recordUpgrade("Kimi", makeEntry("1.0.0", { sizeBytes: 50 }), statePath);
    expect(getTotalSize(statePath)).toBe(150);
  });

  it("无 entry → 0", () => {
    expect(getTotalSize(statePath)).toBe(0);
  });

  it("缺 sizeBytes 的 entry → 当 0 算 (不 throw)", () => {
    recordUpgrade("Cursor", { from: "a", to: "b", at: 1, backupPath: "/x", source: "brew" }, statePath);
    expect(getTotalSize(statePath)).toBe(0);
  });
});

// 注: version-history.js 通过参数显式传 statePath, 不需要 _setUserDataDirForTest hook.