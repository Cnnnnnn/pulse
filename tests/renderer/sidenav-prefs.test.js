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
    expect(p.version).toBe(2);
    expect(p.order).toEqual(NAV_KEYS_LIST);
    expect(p.hidden).toEqual([]);
    expect(p.favorites).toEqual([]);
  });

  it("savePrefs → loadPrefs 还原 (round-trip, legacy funds alias → invest)", () => {
    const original = {
      version: 2,
      order: ["invest", "news", "versions"],
      hidden: ["invest"],
      favorites: ["news"],
    };
    savePrefs(original);
    const got = loadPrefs();
    expect(got).toEqual(original);
  });

  it("savePrefs: legacy key 'funds'/'metals' → alias 为 'invest' (v4 迁移)", () => {
    savePrefs({
      version: 2,
      order: ["funds", "news", "metals"],
      hidden: ["metals"],
      favorites: [],
    });
    const got = loadPrefs();
    expect(got.order).toEqual(["invest", "news"]);
    expect(got.hidden).toEqual(["invest"]);
  });

  it("loadPrefs: localStorage 损坏 (JSON parse fail) → 返 DEFAULTS", () => {
    localStorage.setItem(STORAGE_KEY_FOR_TESTS, "not json {{{");
    const p = loadPrefs();
    expect(p.order).toEqual(NAV_KEYS_LIST);
    expect(p.hidden).toEqual([]);
    expect(p.favorites).toEqual([]);
  });

  it("loadPrefs: version 不匹配 → 返 DEFAULTS", () => {
    localStorage.setItem(
      STORAGE_KEY_FOR_TESTS,
      JSON.stringify({ version: 99, order: [], hidden: [], favorites: [] }),
    );
    const p = loadPrefs();
    expect(p.order).toEqual(NAV_KEYS_LIST);
  });

  it("loadPrefs: 过滤未知 key + legacy alias (防御)", () => {
    localStorage.setItem(
      STORAGE_KEY_FOR_TESTS,
      JSON.stringify({
        version: 2,
        order: ["funds", "evil-key", "versions"],
        hidden: ["another-evil"],
        favorites: ["metals", "evil-fav"],
      }),
    );
    const p = loadPrefs();
    expect(p.order).toEqual(["invest", "versions"]);
    expect(p.hidden).toEqual([]);
    expect(p.favorites).toEqual(["invest"]);
  });

  it("hideItem: 加 key 到 hidden", () => {
    const p0 = resetPrefs();
    const p1 = hideItem(p0, "invest");
    expect(p1.hidden).toEqual(["invest"]);
    expect(p0.hidden).toEqual([]); // 不修改原 prefs
  });

  it("hideItem: 幂等 (重复加不重复)", () => {
    const p = hideItem(hideItem(resetPrefs(), "invest"), "invest");
    expect(p.hidden).toEqual(["invest"]);
  });

  it("hideItem: 未知 key 忽略", () => {
    const p = hideItem(resetPrefs(), "evil-key");
    expect(p.hidden).toEqual([]);
  });

  it("restoreItem: 从 hidden 移除", () => {
    const p0 = hideItem(resetPrefs(), "invest");
    const p1 = restoreItem(p0, "invest");
    expect(p1.hidden).toEqual([]);
    expect(p0.hidden).toEqual(["invest"]); // 不修改原 prefs
  });

  it("restoreItem: key 不在 hidden → noop", () => {
    const p0 = hideItem(resetPrefs(), "invest");
    const p1 = restoreItem(p0, "worldcup");
    expect(p1.hidden).toEqual(["invest"]);
  });

  it("listVisible: 按 order 排, 排除 hidden", () => {
    const p = {
      version: 2,
      order: ["funds", "news", "versions", "metals"],
      hidden: ["metals"],
      favorites: [],
    };
    // 注: listVisible 不做 legacy alias/filter, 直接用 prefs.order/hidden.
    // order filter hidden → ["funds", "news", "versions"]
    // 兜底: NAV_KEYS 中漏掉 + 非 hidden → 加 worldcup/invest/ai-usage/github/games
    //   (metals 在 hidden 不加, funds 不在 NAV_KEYS 也不加 — 但已经在 order 保留)
    // 最终 Set: funds, news, versions, worldcup, invest, ai-usage, github, games
    expect(new Set(listVisible(p))).toEqual(
      new Set(["funds", "news", "versions", "worldcup", "invest", "ai-usage", "github", "games"]),
    );
  });

  it("listVisible: prefs 为 null → 返 NAV_KEYS_LIST", () => {
    expect(listVisible(null)).toEqual(NAV_KEYS_LIST);
  });

  // ponytail: bug 回归 — 老版本升级后 prefs.order 短于 NAV_KEYS_LIST (如 v2.79 → v2.80+ 加 github/games),
  // listVisible 必须把漏掉的 known key 兜底视为可见, 跟 effectiveVisibleItems (navStore.js) 口径一致.
  // 修前 listVisible 返 5 项, listHidden 误报 "已隐藏 (2)" 与侧边栏显示矛盾.
  it("listVisible: prefs.order 短于 NAV_KEYS_LIST → 兜底追加漏掉的 known key (regression: 升级后已隐藏误报)", () => {
    const p = {
      version: 2,
      order: ["news", "worldcup", "invest", "ai-usage", "versions"], // 老版本 order, 缺 github/games
      hidden: [],
      favorites: [],
    };
    const visible = listVisible(p);
    // 5 个老 order 项 + 兜底 2 个 (github, games) = 全部 7 个
    expect(visible).toHaveLength(NAV_KEYS_LIST.length);
    expect(new Set(visible)).toEqual(new Set(NAV_KEYS_LIST));
    // 兜底项必须在末尾
    expect(visible).toEqual(["news", "worldcup", "invest", "ai-usage", "versions", "github", "games"]);
  });

  it("listHidden: NAV_KEYS 中 prefs.hidden 标记的项 (按 NAV_KEYS 默认顺序)", () => {
    const p = {
      version: 2,
      order: NAV_KEYS_LIST,
      hidden: ["invest", "worldcup"],
      favorites: [],
    };
    // 顺序按 NAV_KEYS_LIST 排, 不是按 hidden 数组
    expect(new Set(listHidden(p))).toEqual(new Set(["invest", "worldcup"]));
    expect(listHidden(p)).toEqual(["worldcup", "invest"]);
  });

  // ponytail: bug 回归 — 升级后 prefs.order 短, 但 prefs.hidden = [] → listHidden 必须返 [],
  // 不能误报 "已隐藏".
  it("listHidden: prefs.order 短但 prefs.hidden 空 → 返 [] (regression: 已隐藏误报)", () => {
    const p = {
      version: 2,
      order: ["news", "worldcup", "invest", "ai-usage", "versions"],
      hidden: [],
      favorites: [],
    };
    expect(listHidden(p)).toEqual([]);
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

  // P-N+ v3 (2026-07-10): 'ithome' / 'wechat-hot' 归一到 'news'.
  // v4 (2026-07-13): 'funds' / 'metals' / 'stocks' 归一到 'invest'.
  // round-trip 保留顺序, 旧 key 写盘后被 alias 替换.
  it("v3+v4 迁移: loadPrefs alias 'ithome'/'wechat-hot' → 'news', 'funds' → 'invest'", () => {
    localStorage.setItem(
      STORAGE_KEY_FOR_TESTS,
      JSON.stringify({
        version: 2,
        order: ["ithome", "worldcup", "wechat-hot", "funds"],
        hidden: ["ithome"],
        favorites: ["wechat-hot"],
      }),
    );
    const p = loadPrefs();
    expect(p.order).toEqual(["news", "worldcup", "invest"]);
    expect(p.hidden).toEqual(["news"]); // dedupe 后
    expect(p.favorites).toEqual(["news"]);
  });

  it("v3 迁移: savePrefs alias 旧 key → 'news' 写盘", () => {
    savePrefs({
      version: 2,
      order: ["ithome", "worldcup"],
      hidden: [],
      favorites: ["wechat-hot"],
    });
    const raw = localStorage.getItem(STORAGE_KEY_FOR_TESTS);
    const parsed = JSON.parse(raw);
    expect(parsed.order).toEqual(["news", "worldcup"]);
    expect(parsed.favorites).toEqual(["news"]);
  });
});

describe("sidenav-prefs: reorderItems", () => {
  beforeEach(() => localStorage.clear());

  it("reorderItems: from → to 'before'", () => {
    // v4 2026-07-13: funds + metals + stocks 合并成 'invest' (5 顶级 nav).
    const p0 = resetPrefs(); // [news, worldcup, invest, ai-usage, versions, github, games]
    const p1 = reorderItems(p0, "news", "invest", "before");
    expect(p1.order).toEqual([
      "worldcup",
      "news",
      "invest",
      "ai-usage",
      "versions",
      "github",
      "games",
    ]);
  });

  it("reorderItems: from → to 'after'", () => {
    const p0 = resetPrefs();
    const p1 = reorderItems(p0, "news", "invest", "after");
    expect(p1.order).toEqual([
      "worldcup",
      "invest",
      "news",
      "ai-usage",
      "versions",
      "github",
      "games",
    ]);
  });

  it("reorderItems: from === to → noop (同一 ref)", () => {
    const p0 = resetPrefs();
    const p1 = reorderItems(p0, "news", "news", "before");
    expect(p1).toBe(p0);
  });

  it("reorderItems: from 在 to 之后 → 'after' 正确", () => {
    const p0 = resetPrefs();
    const p1 = reorderItems(p0, "versions", "news", "after");
    expect(p1.order[1]).toBe("versions"); // versions 应当到 news 之后
  });

  it("reorderItems: from 未知 key → 返新 prefs 但 order 不变", () => {
    const p0 = resetPrefs();
    const p1 = reorderItems(p0, "evil", "news", "before");
    expect(p1.order).toEqual(p0.order);
  });

  it("reorderItems: to 未知 key → 返新 prefs 但 order 不变", () => {
    const p0 = resetPrefs();
    const p1 = reorderItems(p0, "news", "evil", "before");
    expect(p1.order).toEqual(p0.order);
  });

  it("reorderItems: 不修改原 prefs", () => {
    const p0 = resetPrefs();
    const before = p0.order.slice();
    reorderItems(p0, "news", "funds", "before");
    expect(p0.order).toEqual(before);
  });

  it("DEFAULTS_FOR_TESTS: 7 个 nav key (投资 nav 合并 + GitHub 收录 + 游戏优惠)", () => {
    expect(DEFAULTS_FOR_TESTS.order).toHaveLength(7);
    expect(DEFAULTS_FOR_TESTS.hidden).toEqual([]);
  });
});
