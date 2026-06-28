// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadPrefs,
  savePrefs,
  hideItem,
  restoreItem,
  listVisible,
  listHidden,
  resetPrefs,
  reorderItems,
  STORAGE_KEY_FOR_TESTS,
  DEFAULTS_FOR_TESTS,
} from "../../src/renderer/components/sidenav-prefs.js";
import { NAV_KEYS_LIST } from "../../src/renderer/worldcup/navStore.js";

describe("sidenav-prefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadPrefs: 默认值 (无 localStorage)", () => {
    const p = loadPrefs();
    expect(p.version).toBe(1);
    expect(p.order).toEqual(NAV_KEYS_LIST);
    expect(p.hidden).toEqual([]);
  });

  it("savePrefs → loadPrefs 还原 (round-trip)", () => {
    const original = {
      version: 1,
      order: ["funds", "ithome", "versions"],
      hidden: ["metals"],
    };
    savePrefs(original);
    const got = loadPrefs();
    expect(got).toEqual(original);
  });

  it("loadPrefs: localStorage 损坏 (JSON parse fail) → 返 DEFAULTS", () => {
    localStorage.setItem(STORAGE_KEY_FOR_TESTS, "not json {{{");
    const p = loadPrefs();
    expect(p.order).toEqual(NAV_KEYS_LIST);
    expect(p.hidden).toEqual([]);
  });

  it("loadPrefs: version 不匹配 → 返 DEFAULTS", () => {
    localStorage.setItem(
      STORAGE_KEY_FOR_TESTS,
      JSON.stringify({ version: 99, order: [], hidden: [] }),
    );
    const p = loadPrefs();
    expect(p.order).toEqual(NAV_KEYS_LIST);
  });

  it("loadPrefs: 过滤未知 key (防御)", () => {
    localStorage.setItem(
      STORAGE_KEY_FOR_TESTS,
      JSON.stringify({
        version: 1,
        order: ["funds", "evil-key", "versions"],
        hidden: ["another-evil"],
      }),
    );
    const p = loadPrefs();
    expect(p.order).toEqual(["funds", "versions"]);
    expect(p.hidden).toEqual([]);
  });

  it("hideItem: 加 key 到 hidden", () => {
    const p0 = resetPrefs();
    const p1 = hideItem(p0, "metals");
    expect(p1.hidden).toEqual(["metals"]);
    expect(p0.hidden).toEqual([]); // 不修改原 prefs
  });

  it("hideItem: 幂等 (重复加不重复)", () => {
    const p = hideItem(hideItem(resetPrefs(), "metals"), "metals");
    expect(p.hidden).toEqual(["metals"]);
  });

  it("hideItem: 未知 key 忽略", () => {
    const p = hideItem(resetPrefs(), "evil-key");
    expect(p.hidden).toEqual([]);
  });

  it("restoreItem: 从 hidden 移除", () => {
    const p0 = hideItem(resetPrefs(), "metals");
    const p1 = restoreItem(p0, "metals");
    expect(p1.hidden).toEqual([]);
    expect(p0.hidden).toEqual(["metals"]); // 不修改原 prefs
  });

  it("restoreItem: key 不在 hidden → noop", () => {
    const p0 = hideItem(resetPrefs(), "metals");
    const p1 = restoreItem(p0, "worldcup");
    expect(p1.hidden).toEqual(["metals"]);
  });

  it("listVisible: 按 order 排, 排除 hidden", () => {
    const p = {
      version: 1,
      order: ["funds", "ithome", "versions", "metals"],
      hidden: ["metals"],
    };
    expect(listVisible(p)).toEqual(["funds", "ithome", "versions"]);
  });

  it("listVisible: prefs 为 null → 返 NAV_KEYS_LIST", () => {
    expect(listVisible(null)).toEqual(NAV_KEYS_LIST);
  });

  it("listHidden: NAV_KEYS_LIST - visible (按 NAV_KEYS_LIST 顺序)", () => {
    const p = {
      version: 1,
      order: NAV_KEYS_LIST,
      hidden: ["metals", "worldcup"],
    };
    // 顺序按 NAV_KEYS_LIST 排, 不是按 hidden 数组
    expect(new Set(listHidden(p))).toEqual(new Set(["metals", "worldcup"]));
    expect(listHidden(p)).toEqual(["worldcup", "metals"]);
  });

  it("savePrefs: JSON.stringify 抛错 → console.warn + 返 false, 不抛", () => {
    // happy-dom 的 localStorage.setItem 不抛 quota — 测试 savePrefs 内部错误兜底
    let warned = false;
    const origWarn = console.warn;
    console.warn = () => {
      warned = true;
    };
    const origJSON = JSON.stringify;
    JSON.stringify = () => {
      throw new Error("circular reference");
    };
    let ok;
    try {
      ok = savePrefs(resetPrefs());
    } finally {
      JSON.stringify = origJSON;
      console.warn = origWarn;
    }
    expect(ok).toBe(false);
    expect(warned).toBe(true);
  });
});

describe("sidenav-prefs: reorderItems", () => {
  beforeEach(() => localStorage.clear());

  it("reorderItems: from → to 'before'", () => {
    const p0 = resetPrefs(); // [ithome, wechat-hot, worldcup, funds, metals, stocks, ai-usage, versions] (Phase 32 stock-detail 合并到选股)
    const p1 = reorderItems(p0, "ithome", "funds", "before");
    expect(p1.order).toEqual([
      "wechat-hot",
      "worldcup",
      "ithome",
      "funds",
      "metals",
      "stocks",
      "ai-usage",
      "versions",
    ]);
  });

  it("reorderItems: from → to 'after'", () => {
    const p0 = resetPrefs();
    const p1 = reorderItems(p0, "ithome", "funds", "after");
    expect(p1.order).toEqual([
      "wechat-hot",
      "worldcup",
      "funds",
      "ithome",
      "metals",
      "stocks",
      "ai-usage",
      "versions",
    ]);
  });

  it("reorderItems: from === to → noop (同一 ref)", () => {
    const p0 = resetPrefs();
    const p1 = reorderItems(p0, "ithome", "ithome", "before");
    expect(p1).toBe(p0);
  });

  it("reorderItems: from 在 to 之后 → 'after' 正确", () => {
    const p0 = resetPrefs();
    const p1 = reorderItems(p0, "versions", "ithome", "after");
    expect(p1.order[1]).toBe("versions"); // versions 应当到 ithome 之后
  });

  it("reorderItems: from 未知 key → 返新 prefs 但 order 不变", () => {
    const p0 = resetPrefs();
    const p1 = reorderItems(p0, "evil", "ithome", "before");
    expect(p1.order).toEqual(p0.order);
  });

  it("reorderItems: to 未知 key → 返新 prefs 但 order 不变", () => {
    const p0 = resetPrefs();
    const p1 = reorderItems(p0, "ithome", "evil", "before");
    expect(p1.order).toEqual(p0.order);
  });

  it("reorderItems: 不修改原 prefs", () => {
    const p0 = resetPrefs();
    const before = p0.order.slice();
    reorderItems(p0, "ithome", "funds", "before");
    expect(p0.order).toEqual(before);
  });

  it("DEFAULTS_FOR_TESTS: 8 个 nav key (Phase 32 stock-detail 合并到选股)", () => {
    expect(DEFAULTS_FOR_TESTS.order).toHaveLength(8);
    expect(DEFAULTS_FOR_TESTS.hidden).toEqual([]);
  });
});
