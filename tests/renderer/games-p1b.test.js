// @vitest-environment happy-dom
/**
 * tests/renderer/games-p1b.test.js
 *
 * P1b 批次测试：B 组合徽章（badges.js / BadgeWall / 引擎）+ F 分享图（shareImage.js / ShareImageModal）。
 *
 * 覆盖：
 *  - badges.js 纯函数：BUILTIN_BADGE_RULES（8 条）、buildBadgeCtx 计算、evaluateBadges 各规则命中/不命中。
 *  - shareImage.js 纯函数：buildSharePayload、exportShareImage（零 IPC 锚点下载）、renderShareImage（stub canvas 不抛）。
 *  - BadgeWall 组件：已点亮 + 未点亮（置灰）响应式渲染、a11y。
 *  - ShareImageModal 组件：生成/导出按钮触发、模板偏好持久化。
 *  - gamesStore 引擎：loadBadges 持久化、initCollectionEngines 随 wishlist 重算徽章并落盘、stop() 停止。
 *  - GamesLayout 装配：mount 调 loadRarityTiers/loadMetrics/loadBadges/initCollectionEngines，unmount 调 stop。
 *
 * 纯本地：no network；localStorage 用 happy-dom 环境自带。
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { h } from "preact";
import { render, cleanup, fireEvent, act } from "@testing-library/preact";
import {
  BUILTIN_BADGE_RULES,
  buildBadgeCtx,
  evaluateBadges,
} from "../../src/renderer/games/badges.js";
import * as shareImage from "../../src/renderer/games/shareImage.js";
import * as store from "../../src/renderer/games/gamesStore.js";
import { normalizeEntry } from "../../src/renderer/games/types.js";
import { DEFAULT_RARITY_TIERS } from "../../src/renderer/games/rarityTiers.js";
import { BadgeWall } from "../../src/renderer/games/BadgeWall.jsx";
import { ShareImageModal } from "../../src/renderer/games/ShareImageModal.jsx";

// ── mock gamesStore：仅拦截会触 IPC 的 loader，保留真实 initCollectionEngines / loadBadges 等 ──
vi.mock("../../src/renderer/games/gamesStore.js", async () => {
  const actual = await vi.importActual(
    "../../src/renderer/games/gamesStore.js",
  );
  return {
    ...actual,
    loadGameDeals: vi.fn(() => Promise.resolve()),
    loadGamesSettings: vi.fn(() => Promise.resolve()),
    loadWishlist: vi.fn(() => Promise.resolve()),
    loadFx: vi.fn(() => Promise.resolve()),
    enrichSteamLowest: vi.fn(() => Promise.resolve()),
    enrichXboxLowest: vi.fn(() => Promise.resolve()),
    clearGamesNewFree: vi.fn(),
    clearGamesNewDrop: vi.fn(),
    // 保留真实：loadRarityTiers / loadMetrics / loadBadges / initCollectionEngines
  };
});

// ── mock shareImage：保留真实纯函数，仅把渲染/导出包成 spy 便于断言 ──
vi.mock("../../src/renderer/games/shareImage.js", async () => {
  const actual = await vi.importActual(
    "../../src/renderer/games/shareImage.js",
  );
  return {
    ...actual,
    renderShareImage: vi.fn(actual.renderShareImage),
    exportShareImage: vi.fn(actual.exportShareImage),
  };
});

// ── mock scheduler：追踪 start/stop/restart ──
const schedulerMocks = {
  start: vi.fn(),
  stop: vi.fn(),
  restart: vi.fn(),
  checkOnce: vi.fn(),
};
vi.mock("../../src/renderer/games/games-check-scheduler.js", () => ({
  createGamesCheckScheduler: vi.fn(() => schedulerMocks),
}));

import { GamesLayout } from "../../src/renderer/games/GamesLayout.jsx";

/** 重置 store 信号与 localStorage（单一真源，避免跨用例污染）。 */
function resetAll() {
  store.wishlist.value = [];
  store.folders.value = [];
  store.tags.value = [];
  store.metrics.value = {};
  store.rarityTiers.value = DEFAULT_RARITY_TIERS.map((t) => ({ ...t }));
  store.badgesEarned.value = {};
  store.noteRatingTarget.value = null;
  store.mergeCandidateKeys.value = [];
  store.expandedMergeKey.value = null;
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
}

/** 向 wishlist 直接塞一条规整条目。 */
function addEntry(key) {
  const [platform, id] = key.split(":");
  store.wishlist.value = [
    ...store.wishlist.value,
    normalizeEntry({
      key,
      platform,
      id,
      title: key,
      addedPrice: 0,
      currency: "USD",
    }),
  ];
}

function makeEntry(over = {}) {
  return {
    rating: 0,
    mergedMembers: null,
    mergedIds: [],
    folderId: null,
    tags: [],
    rarity: null,
    ...over,
  };
}

beforeEach(() => {
  resetAll();
});
afterEach(() => {
  cleanup();
  resetAll();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

/* ══════════════════════════════════════════════════════════════════
   badges.js 纯函数
   ════════════════════════════════════════════════════════════════ */

describe("BUILTIN_BADGE_RULES 结构", () => {
  it("共 8 条，每条含 id/name/desc/icon/test", () => {
    expect(BUILTIN_BADGE_RULES).toHaveLength(8);
    const ids = new Set();
    for (const r of BUILTIN_BADGE_RULES) {
      expect(typeof r.id).toBe("string");
      expect(typeof r.name).toBe("string");
      expect(typeof r.desc).toBe("string");
      expect(typeof r.icon).toBe("string");
      expect(typeof r.test).toBe("function");
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
    }
  });
});

describe("buildBadgeCtx — 上下文计算", () => {
  it("空列表：全 0 / false", () => {
    const ctx = buildBadgeCtx([]);
    expect(ctx).toEqual({
      total: 0,
      rated: 0,
      mergedCount: 0,
      maxPlatforms: 0,
      folderCount: 0,
      tagKinds: 0,
      hasLegendary: false,
    });
  });

  it("综合条目：total/rated/folderCount/tagKinds/hasLegendary 正确", () => {
    const entries = [
      makeEntry({ rating: 5, folderId: "f1", tags: ["a", "b"], rarity: "legendary" }),
      makeEntry({ rating: 0, folderId: "f1", tags: ["b", "c"] }),
      makeEntry({ rating: 3, folderId: "f2", tags: ["a"] }),
      makeEntry({ rating: 4, folderId: null, tags: ["c"] }),
    ];
    const ctx = buildBadgeCtx(entries);
    expect(ctx.total).toBe(4);
    expect(ctx.rated).toBe(3); // rating>0 数
    expect(ctx.folderCount).toBe(2); // f1, f2（去重，null 不计）
    expect(ctx.tagKinds).toBe(3); // a, b, c（去重）
    expect(ctx.hasLegendary).toBe(true);
  });

  it("合并条目计入 mergedCount 且 maxPlatforms 按成员数计", () => {
    const entries = [
      makeEntry({ mergedMembers: [{ platform: "steam" }, { platform: "epic" }, { platform: "gog" }] }),
      makeEntry({}), // 单条 → 平台数 1
    ];
    const ctx = buildBadgeCtx(entries);
    expect(ctx.mergedCount).toBe(1);
    expect(ctx.maxPlatforms).toBe(3); // 合并项 3 平台
  });

  it("mergedIds 非空也计入 mergedCount", () => {
    const ctx = buildBadgeCtx([makeEntry({ mergedIds: ["a", "b"] })]);
    expect(ctx.mergedCount).toBe(1);
  });
});

describe("evaluateBadges — 各规则命中/不命中", () => {
  it("first_10：满 10 款点亮，9 款不点亮", () => {
    expect(evaluateBadges(Array(10).fill(0).map(() => makeEntry()), buildBadgeCtx(Array(10).fill(0).map(() => makeEntry())))).toContainEqual({ id: "first_10", earnedAt: expect.any(String) });
    const nine = buildBadgeCtx(Array(9).fill(0).map(() => makeEntry()));
    const res9 = evaluateBadges(Array(9).fill(0).map(() => makeEntry()), nine);
    expect(res9.find((r) => r.id === "first_10")).toBeUndefined();
  });

  it("first_merge：有合并项点亮，无合并不点亮", () => {
    const hit = buildBadgeCtx([makeEntry({ mergedMembers: [{ platform: "steam" }] })]);
    expect(evaluateBadges([makeEntry({ mergedMembers: [{ platform: "steam" }] })], hit).some((r) => r.id === "first_merge")).toBe(true);
    const miss = buildBadgeCtx([makeEntry()]);
    expect(evaluateBadges([makeEntry()], miss).some((r) => r.id === "first_merge")).toBe(false);
  });

  it("multiplat：合并 ≥3 平台点亮，2 平台不点亮", () => {
    const hit = buildBadgeCtx([makeEntry({ mergedMembers: [{ platform: "a" }, { platform: "b" }, { platform: "c" }] })]);
    expect(evaluateBadges([makeEntry({ mergedMembers: [{ platform: "a" }, { platform: "b" }, { platform: "c" }] })], hit).some((r) => r.id === "multiplat")).toBe(true);
    const miss = buildBadgeCtx([makeEntry({ mergedMembers: [{ platform: "a" }, { platform: "b" }] })]);
    expect(evaluateBadges([makeEntry({ mergedMembers: [{ platform: "a" }, { platform: "b" }] })], miss).some((r) => r.id === "multiplat")).toBe(false);
  });

  it("fully_rated：全部已评分点亮，存在未评分不点亮；空集合不点亮", () => {
    const hit = buildBadgeCtx([makeEntry({ rating: 5 }), makeEntry({ rating: 4 })]);
    expect(evaluateBadges([makeEntry({ rating: 5 }), makeEntry({ rating: 4 })], hit).some((r) => r.id === "fully_rated")).toBe(true);
    const miss = buildBadgeCtx([makeEntry({ rating: 5 }), makeEntry({ rating: 0 })]);
    expect(evaluateBadges([makeEntry({ rating: 5 }), makeEntry({ rating: 0 })], miss).some((r) => r.id === "fully_rated")).toBe(false);
    const empty = buildBadgeCtx([]);
    expect(evaluateBadges([], empty).some((r) => r.id === "fully_rated")).toBe(false);
  });

  it("collector：满 50 款点亮，49 款不点亮", () => {
    const hitEntries = Array(50).fill(0).map(() => makeEntry());
    expect(evaluateBadges(hitEntries, buildBadgeCtx(hitEntries)).some((r) => r.id === "collector")).toBe(true);
    const missEntries = Array(49).fill(0).map(() => makeEntry());
    expect(evaluateBadges(missEntries, buildBadgeCtx(missEntries)).some((r) => r.id === "collector")).toBe(false);
  });

  it("folder_master：去重 folderId ≥3 点亮，2 个不点亮", () => {
    const hit = buildBadgeCtx([
      makeEntry({ folderId: "f1" }),
      makeEntry({ folderId: "f2" }),
      makeEntry({ folderId: "f3" }),
    ]);
    expect(evaluateBadges([makeEntry({ folderId: "f1" }), makeEntry({ folderId: "f2" }), makeEntry({ folderId: "f3" })], hit).some((r) => r.id === "folder_master")).toBe(true);
    const miss = buildBadgeCtx([makeEntry({ folderId: "f1" }), makeEntry({ folderId: "f2" })]);
    expect(evaluateBadges([makeEntry({ folderId: "f1" }), makeEntry({ folderId: "f2" })], miss).some((r) => r.id === "folder_master")).toBe(false);
  });

  it("tagged：去重标签 ≥5 点亮，4 个不点亮", () => {
    const hit = buildBadgeCtx([
      makeEntry({ tags: ["a"] }),
      makeEntry({ tags: ["b", "c"] }),
      makeEntry({ tags: ["d", "e"] }),
    ]);
    expect(evaluateBadges([makeEntry({ tags: ["a"] }), makeEntry({ tags: ["b", "c"] }), makeEntry({ tags: ["d", "e"] })], hit).some((r) => r.id === "tagged")).toBe(true);
    const miss = buildBadgeCtx([makeEntry({ tags: ["a", "b", "c", "d"] })]);
    expect(evaluateBadges([makeEntry({ tags: ["a", "b", "c", "d"] })], miss).some((r) => r.id === "tagged")).toBe(false);
  });

  it("legendary：存在 legendary 稀有度点亮，否则不点亮", () => {
    const hit = buildBadgeCtx([makeEntry({ rarity: "legendary" })]);
    expect(evaluateBadges([makeEntry({ rarity: "legendary" })], hit).some((r) => r.id === "legendary")).toBe(true);
    const miss = buildBadgeCtx([makeEntry({ rarity: "common" })]);
    expect(evaluateBadges([makeEntry({ rarity: "common" })], miss).some((r) => r.id === "legendary")).toBe(false);
  });

  it("earnedAt 为 ISO 字符串且返回 [{id, earnedAt}] 结构", () => {
    const res = evaluateBadges([makeEntry(), makeEntry()], buildBadgeCtx([makeEntry(), makeEntry()]));
    expect(Array.isArray(res)).toBe(true);
    for (const r of res) {
      expect(r).toHaveProperty("id");
      expect(typeof r.earnedAt).toBe("string");
      expect(() => new Date(r.earnedAt).toISOString()).not.toThrow();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════
   shareImage.js 纯函数
   ════════════════════════════════════════════════════════════════ */

describe("buildSharePayload", () => {
  it("汇总统计 / 稀有度分布 / 徽章数（按数量降序）", () => {
    const entries = [
      { rarity: "legendary" },
      { rarity: "epic" },
      { rarity: "epic" },
      { rarity: null },
    ];
    const stats = { total: 4, totalValue: 500, totalSaved: 120 };
    const badges = { legendary: { earnedAt: "x" }, collector: { earnedAt: "y" } };
    const tiers = [
      { id: "legendary", name: "传说", color: "var(--color-warning)" },
      { id: "epic", name: "史诗", color: "var(--color-info)" },
    ];
    const p = shareImage.buildSharePayload(entries, stats, badges, {
      tiers,
      title: "我的墙",
      achievementsProgress: {
        ach1: { unlocked: true, unlockedAt: "2026-07-01", current: 5 },
        ach2: { unlocked: false, unlockedAt: null, current: 2 },
        ach3: { unlocked: true, unlockedAt: "2026-07-02", current: 10 },
      },
    });
    expect(p.title).toBe("我的墙");
    expect(p.total).toBe(4);
    expect(p.totalValue).toBe(500);
    expect(p.totalSaved).toBe(120);
    expect(p.badgeCount).toBe(2);
    expect(p.achievementCount).toBe(2); // ach1 + ach3 unlocked
    const ids = p.rarityBreakdown.map((r) => r.id);
    expect(ids).toEqual(["epic", "legendary", "unranked"]);
    const epic = p.rarityBreakdown.find((r) => r.id === "epic");
    expect(epic.count).toBe(2);
    expect(epic.name).toBe("史诗");
  });

  it("空数据返回全 0 与安全结构", () => {
    const p = shareImage.buildSharePayload([], { total: 0 }, {}, {});
    expect(p.total).toBe(0);
    expect(p.rarityBreakdown).toEqual([]);
    expect(p.badgeCount).toBe(0);
    expect(p.title).toBe("我的游戏收藏墙"); // 默认标题
  });
});

describe("exportShareImage — 零 IPC 锚点下载", () => {
  it("canvas.toBlob → <a download> 触发下载，且不产生任何 fetch/IPC", async () => {
    const blob = { type: "image/png", size: 42 };
    const canvas = {
      toBlob: (cb) => cb(blob),
      toDataURL: () => "data:image/png;base64,AAAA",
    };
    const clickSpy = vi.fn();
    const realCreate = document.createElement.bind(document);
    const anchor = realCreate("a");
    anchor.click = clickSpy;
    const createSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag) => (tag === "a" ? anchor : realCreate(tag)));
    const urlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("network must not happen");
    });

    const res = await shareImage.exportShareImage(canvas, { filename: "my-share.png" });

    expect(anchor.download).toBe("my-share.png");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(urlSpy).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    createSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it("toBlob 不可用时降级 toDataURL 锚点下载", async () => {
    const canvas = {
      toBlob: undefined,
      toDataURL: () => "data:image/png;base64,ZZZZ",
    };
    const clickSpy = vi.fn();
    const realCreate = document.createElement.bind(document);
    const anchor = realCreate("a");
    anchor.click = clickSpy;
    vi.spyOn(document, "createElement").mockImplementation((tag) =>
      tag === "a" ? anchor : realCreate(tag),
    );
    const res = await shareImage.exportShareImage(canvas, { filename: "fallback.png" });
    expect(anchor.download).toBe("fallback.png");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
  });
});

describe("renderShareImage — 容错与绘制", () => {
  it("stub canvas（无 2d 上下文）下不抛且返回 false", () => {
    const canvas = { width: 1200, height: 630, getContext: () => null };
    expect(() =>
      shareImage.renderShareImage(canvas, shareImage.buildSharePayload([], { total: 0 }, {})),
    ).not.toThrow();
    expect(shareImage.renderShareImage(canvas, {})).toBe(false);
  });

  it("可用 2d 上下文下绘制（fillRect/fillText 被调用）并返回 true", () => {
    const calls = { fillRect: 0, fillText: 0 };
    const ctx = {
      fillStyle: "",
      font: "",
      textBaseline: "",
      textAlign: "",
      fillRect: () => {
        calls.fillRect += 1;
      },
      fillText: () => {
        calls.fillText += 1;
      },
      beginPath() {},
      moveTo() {},
      arcTo() {},
      closePath() {},
      fill() {},
      measureText: () => ({ width: 50 }),
    };
    const canvas = { width: 1200, height: 630, getContext: () => ctx };
    const payload = shareImage.buildSharePayload(
      [{ rarity: "epic" }, { rarity: "common" }],
      { total: 2, totalValue: 100, totalSaved: 10 },
      { legendary: { earnedAt: "2026-01-01T00:00:00.000Z" } },
      { title: "测试墙" },
    );
    const ok = shareImage.renderShareImage(canvas, payload);
    expect(ok).toBe(true);
    expect(calls.fillRect).toBeGreaterThan(0);
    expect(calls.fillText).toBeGreaterThan(0);
  });
});

/* ══════════════════════════════════════════════════════════════════
   组件：BadgeWall
   ════════════════════════════════════════════════════════════════ */

describe("组件：BadgeWall（P1b · B）", () => {
  it("渲染已点亮徽章 + 未点亮（置灰）目标，含计数与 a11y", () => {
    act(() => {
      store.badgesEarned.value = {
        first_10: { earnedAt: "2026-07-19T00:00:00.000Z" },
      };
    });
    const { container } = render(h(BadgeWall, {}));
    const earned = container.querySelectorAll(".badge-wall__item.is-earned");
    const locked = container.querySelectorAll(".badge-wall__item.is-locked");
    expect(earned).toHaveLength(1);
    expect(locked).toHaveLength(BUILTIN_BADGE_RULES.length - 1);
    expect(container.textContent).toContain("初露锋芒"); // 已点亮名称
    // a11y：已点亮条目 aria-label 含「已点亮徽章」
    expect(earned[0].getAttribute("aria-label")).toContain("已点亮徽章");
    expect(container.textContent).toContain("收藏满 50 款"); // 未点亮目标 desc
    // 获得日期 tabular-nums
    expect(container.querySelector(".badge-wall__date").className).toContain("badge-wall__date");
  });

  it("无任何徽章时全部置灰展示目标", () => {
    act(() => {
      store.badgesEarned.value = {};
    });
    const { container } = render(h(BadgeWall, {}));
    expect(container.querySelectorAll(".badge-wall__item.is-earned")).toHaveLength(0);
    expect(container.querySelectorAll(".badge-wall__item.is-locked")).toHaveLength(BUILTIN_BADGE_RULES.length);
  });

  it("订阅 badgesEarned：信号变化后响应式更新点亮集", () => {
    const { container } = render(h(BadgeWall, {}));
    expect(container.querySelectorAll(".badge-wall__item.is-earned")).toHaveLength(0);
    act(() => {
      store.badgesEarned.value = {
        collector: { earnedAt: "2026-07-19T00:00:00.000Z" },
      };
    });
    expect(container.querySelectorAll(".badge-wall__item.is-earned")).toHaveLength(1);
    expect(container.textContent).toContain("收藏大师");
  });
});

/* ══════════════════════════════════════════════════════════════════
   组件：ShareImageModal
   ════════════════════════════════════════════════════════════════ */

describe("组件：ShareImageModal（P1b · F）", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("打开后「生成分享图」调用 renderShareImage，「导出 PNG」调用 exportShareImage", async () => {
    act(() => {
      store.wishlist.value = [
        normalizeEntry({ key: "steam:1", platform: "steam", id: "1", title: "G", addedPrice: 10, currency: "USD", rarity: "epic" }),
      ];
    });
    const { container } = render(h(ShareImageModal, { open: true, onClose: () => {} }));
    const genBtn = [...container.querySelectorAll(".modal-btn")].find((b) =>
      b.textContent.includes("生成分享图"),
    );
    const expBtn = [...container.querySelectorAll(".modal-btn")].find((b) =>
      b.textContent.includes("导出 PNG"),
    );
    expect(genBtn).toBeTruthy();
    expect(expBtn).toBeTruthy();

    fireEvent.click(genBtn);
    expect(shareImage.renderShareImage).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(expBtn);
    });
    expect(shareImage.exportShareImage).toHaveBeenCalled();
  });

  it("模板切换持久化到 pulse.games.share.templates.v1", () => {
    const { container } = render(h(ShareImageModal, { open: true, onClose: () => {} }));
    const select = container.querySelector("#share-template");
    expect(select).toBeTruthy();
    // 注：本环境 happy-dom + Preact 受控 <select> 下 fireEvent.change 不触发 onChange；
    // 用原生 Event 派发（与真实用户选择路径一致）确保 handler 执行。
    act(() => {
      select.value = "minimal";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const stored = JSON.parse(localStorage.getItem("pulse.games.share.templates.v1"));
    expect(stored.lastTemplate).toBe("minimal");
  });

  it("open=false 时不渲染弹窗内容", () => {
    const { container } = render(h(ShareImageModal, { open: false, onClose: () => {} }));
    expect(container.querySelector(".share-image")).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════
   gamesStore 引擎：loadBadges / initCollectionEngines
   ════════════════════════════════════════════════════════════════ */

describe("gamesStore：徽章引擎（P1b · B）", () => {
  it("loadBadges 读取已点亮集合，损坏数据回退空", () => {
    localStorage.setItem(
      "pulse.games.badges.earned.v1",
      JSON.stringify({ first_10: { earnedAt: "2026-07-19T00:00:00.000Z" } }),
    );
    store.loadBadges();
    expect(store.badgesEarned.value.first_10).toBeTruthy();

    localStorage.setItem("pulse.games.badges.earned.v1", "{bad");
    store.loadBadges();
    expect(store.badgesEarned.value).toEqual({});
  });

  it("initCollectionEngines：wishlist 变更后 badgesEarned 随 effect 更新并落盘", () => {
    const stop = store.initCollectionEngines();
    expect(Object.keys(store.badgesEarned.value)).toHaveLength(0);

    act(() => {
      for (let i = 0; i < 10; i += 1) addEntry(`steam:s${i}`);
    });
    expect(store.badgesEarned.value.first_10).toBeTruthy();

    const stored = JSON.parse(localStorage.getItem("pulse.games.badges.earned.v1"));
    expect(stored.first_10).toBeTruthy();

    stop();
  });

  it("stop() 停止 effect：后续 wishlist 变更不再重算徽章", () => {
    const stop = store.initCollectionEngines();
    act(() => {
      for (let i = 0; i < 10; i += 1) addEntry(`steam:t${i}`);
    });
    expect(store.badgesEarned.value.first_10).toBeTruthy();

    stop();
    act(() => {
      store.wishlist.value = [];
    });
    // effect 已停，badgesEarned 保留上次结果（不再清空）
    expect(store.badgesEarned.value.first_10).toBeTruthy();
  });

  it("initCollectionEngines 返回函数句柄（可调用 stop）", () => {
    const stop = store.initCollectionEngines();
    expect(typeof stop).toBe("function");
    stop();
  });
});

/* ══════════════════════════════════════════════════════════════════
   GamesLayout 装配（P1a/P1b 加载 + 引擎启动/停止）
   ════════════════════════════════════════════════════════════════ */

describe("GamesLayout 装配（P1a/P1b 加载缺口补齐）", () => {
  beforeEach(() => {
    // 真实 loader / 引擎函数（未被 vi.mock 覆盖），用 spy 记录调用
    vi.spyOn(store, "loadRarityTiers");
    vi.spyOn(store, "loadMetrics");
    vi.spyOn(store, "loadBadges");
    vi.spyOn(store, "initCollectionEngines");
  });

  it("mount 调 loadRarityTiers / loadMetrics / loadBadges / initCollectionEngines", () => {
    render(h(GamesLayout, {}));
    expect(store.loadRarityTiers).toHaveBeenCalledTimes(1);
    expect(store.loadMetrics).toHaveBeenCalledTimes(1);
    expect(store.loadBadges).toHaveBeenCalledTimes(1);
    expect(store.initCollectionEngines).toHaveBeenCalledTimes(1);
  });

  it("unmount 后引擎停止（wishlist 变更不再重算徽章）", () => {
    const { unmount } = render(h(GamesLayout, {}));
    expect(store.badgesEarned.value).toEqual({});
    unmount();
    act(() => {
      for (let i = 0; i < 10; i += 1) addEntry(`steam:u${i}`);
    });
    // 引擎已停 → 不重算
    expect(Object.keys(store.badgesEarned.value)).toHaveLength(0);
  });
});
