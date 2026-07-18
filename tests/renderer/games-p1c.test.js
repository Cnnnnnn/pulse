// @vitest-environment happy-dom
/**
 * tests/renderer/games-p1c.test.js
 *
 * P1c 批次测试：C 成就系统（achievementsEngine / AchievementsPanel / store）
 *            + D 限时活动（eventsEngine / EventBanner / store）。
 *
 * 覆盖：
 *  - achievementsEngine 纯函数：DEFAULT_ACHIEVEMENTS（5 条）、countMatches 各维度、
 *    evaluateAchievements 解锁检测 + unlockedAt 历史保留 + current 跨阈值。
 *  - eventsEngine 纯函数：DEFAULT_EVENTS、isEventActive（窗口内/外/端点/NaN 安全）、
 *    evaluateEvents 窗口内进度/completed + 窗口外锁存历史。
 *  - AchievementsPanel 组件：解锁/未解锁渲染、ProgressBar 显示 current/threshold、弹窗新增持久化。
 *  - EventBanner 组件：进行中横幅显示、过期进历史、completed 可领取。
 *  - gamesStore：loadAchDef/loadAchProgress/loadEvents 读取 + 损坏回退；
 *    initCollectionEngines 随 wishlist 重算成就/活动并落盘；stop() 停止。
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
  DEFAULT_ACHIEVEMENTS,
  countMatches,
  evaluateAchievements,
} from "../../src/renderer/games/achievementsEngine.js";
import {
  DEFAULT_EVENTS,
  isEventActive,
  evaluateEvents,
} from "../../src/renderer/games/eventsEngine.js";
import * as store from "../../src/renderer/games/gamesStore.js";
import { normalizeEntry } from "../../src/renderer/games/types.js";
import { AchievementsPanel } from "../../src/renderer/games/AchievementsPanel.jsx";
import { EventBanner } from "../../src/renderer/games/EventBanner.jsx";

// ── mock gamesStore：仅拦截会触 IPC 的 loader，保留真实引擎/store action ──
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
    // 保留真实：loadRarityTiers / loadMetrics / loadBadges /
    //          loadAchDef / loadAchProgress / loadEvents /
    //          initCollectionEngines / addAchievement / addEvent / claimEvent ...
  };
});

/** 重置 store 信号与 localStorage（单一真源，避免跨用例污染）。 */
function resetAll() {
  store.wishlist.value = [];
  store.folders.value = [];
  store.tags.value = [];
  store.metrics.value = {};
  store.rarityTiers.value = [];
  store.badgesEarned.value = {};
  store.achievementsDef.value = [];
  store.achievementsProgress.value = {};
  store.eventsConfig.value = [];
  store.eventsProgress.value = {};
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

/** 受控输入/选择框设值（act + 原生事件派发，兼容 happy-dom + Preact）。 */
function setVal(el, value, type = "input") {
  act(() => {
    el.value = value;
    el.dispatchEvent(new Event(type, { bubbles: true }));
  });
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
   achievementsEngine 纯函数
   ════════════════════════════════════════════════════════════════ */

describe("DEFAULT_ACHIEVEMENTS 结构", () => {
  it("共 5 条，维度合法、含 id/name/threshold", () => {
    expect(DEFAULT_ACHIEVEMENTS).toHaveLength(5);
    const ids = new Set();
    for (const d of DEFAULT_ACHIEVEMENTS) {
      expect(typeof d.id).toBe("string");
      expect(typeof d.name).toBe("string");
      expect(["tag", "folder", "platform", "rarity", "merged"]).toContain(d.dimension);
      expect(typeof d.threshold).toBe("number");
      expect(ids.has(d.id)).toBe(false);
      ids.add(d.id);
    }
  });
});

describe("countMatches — 各维度统计", () => {
  const entries = [
    { platform: "steam", tags: ["RPG", "ACT"], folderId: "f1", rarity: "legendary", mergedMembers: [{ p: "steam" }] },
    { platform: "epic", tags: ["RPG"], folderId: "f1", rarity: "common", mergedMembers: null },
    { platform: "steam", tags: [], folderId: null, rarity: null, mergedMembers: null },
  ];
  it("platform", () => expect(countMatches(entries, "platform", "steam")).toBe(2));
  it("tag", () => expect(countMatches(entries, "tag", "RPG")).toBe(2));
  it("folder", () => expect(countMatches(entries, "folder", "f1")).toBe(2));
  it("rarity", () => expect(countMatches(entries, "rarity", "legendary")).toBe(1));
  it("merged", () => expect(countMatches(entries, "merged", null)).toBe(1));
  it("未知维度 → 0", () => expect(countMatches(entries, "nope", "x")).toBe(0));
});

describe("evaluateAchievements — 解锁/历史/current", () => {
  it("解锁检测 + current 跨阈值", () => {
    const entries = Array.from({ length: 10 }, () => ({ platform: "steam" }));
    const res = evaluateAchievements(entries, DEFAULT_ACHIEVEMENTS, {});
    expect(res.ach_10_steam.unlocked).toBe(true);
    expect(res.ach_10_steam.current).toBe(10);
    expect(typeof res.ach_10_steam.unlockedAt).toBe("string");
    expect(res.ach_5_epic.unlocked).toBe(false);
    expect(res.ach_5_epic.current).toBe(0);
  });

  it("unlockedAt 历史保留：prev 已解锁则沿用旧时间戳", () => {
    const prev = { ach_10_steam: { unlocked: true, unlockedAt: "2020-01-01T00:00:00.000Z", current: 10 } };
    const res = evaluateAchievements([], DEFAULT_ACHIEVEMENTS, prev);
    expect(res.ach_10_steam.unlocked).toBe(true);
    expect(res.ach_10_steam.unlockedAt).toBe("2020-01-01T00:00:00.000Z");
  });

  it("未解锁：unlockedAt 为 null，current 仍记录", () => {
    const entries = [{ platform: "steam" }, { platform: "steam" }];
    const res = evaluateAchievements(entries, DEFAULT_ACHIEVEMENTS, {});
    expect(res.ach_10_steam.unlocked).toBe(false);
    expect(res.ach_10_steam.unlockedAt).toBe(null);
    expect(res.ach_10_steam.current).toBe(2);
  });
});

/* ══════════════════════════════════════════════════════════════════
   eventsEngine 纯函数
   ════════════════════════════════════════════════════════════════ */

describe("DEFAULT_EVENTS 结构", () => {
  it("共 1 条，字段齐 + 维度合法", () => {
    expect(DEFAULT_EVENTS).toHaveLength(1);
    const e = DEFAULT_EVENTS[0];
    expect(e.id).toBe("ev_spring");
    expect(typeof e.startAt).toBe("string");
    expect(typeof e.endAt).toBe("string");
    expect(["tag", "folder", "platform", "rarity", "merged"]).toContain(e.dimension);
  });
});

describe("isEventActive — 窗口判定 + NaN 安全", () => {
  const win = { startAt: "2026-03-01T00:00:00Z", endAt: "2026-03-31T23:59:59Z" };
  it("区间内 → true", () =>
    expect(isEventActive(win, new Date("2026-03-15T12:00:00Z").getTime())).toBe(true));
  it("区间前 → false", () =>
    expect(isEventActive(win, new Date("2026-02-01T00:00:00Z").getTime())).toBe(false));
  it("区间后 → false", () =>
    expect(isEventActive(win, new Date("2026-04-01T00:00:00Z").getTime())).toBe(false));
  it("端点闭区间 → true", () => {
    expect(isEventActive(win, new Date("2026-03-01T00:00:00Z").getTime())).toBe(true);
    expect(isEventActive(win, new Date("2026-03-31T23:59:59Z").getTime())).toBe(true);
  });
  it("坏时间 → false（NaN 安全）", () => {
    expect(isEventActive({ startAt: "bad", endAt: "2026-03-31T00:00:00Z" }, Date.now())).toBe(false);
    expect(isEventActive({ startAt: "2026-03-01T00:00:00Z", endAt: "bad" }, Date.now())).toBe(false);
  });
});

describe("evaluateEvents — 进度/锁存", () => {
  const cfg = {
    id: "ev1",
    title: "T",
    startAt: "2026-03-01T00:00:00Z",
    endAt: "2026-03-31T23:59:59Z",
    dimension: "platform",
    target: "steam",
    threshold: 3,
  };
  const nowActive = new Date("2026-03-15T12:00:00Z").getTime();

  it("窗口内：progress 计算 + completed", () => {
    const entries = [{ platform: "steam" }, { platform: "steam" }, { platform: "steam" }, { platform: "steam" }];
    const res = evaluateEvents(entries, [cfg], {}, nowActive);
    expect(res.ev1.progress).toBe(4);
    expect(res.ev1.completed).toBe(true);
    expect(res.ev1.claimed).toBe(false);
  });

  it("窗口内但未达阈值：completed false", () => {
    const entries = [{ platform: "steam" }];
    const res = evaluateEvents(entries, [cfg], {}, nowActive);
    expect(res.ev1.completed).toBe(false);
    expect(res.ev1.progress).toBe(1);
  });

  it("窗口外：锁存历史（claimed/completed/progress 保留）", () => {
    const prev = { ev1: { claimed: true, completed: true, progress: 5 } };
    const res = evaluateEvents([], [cfg], prev, new Date("2027-01-01T00:00:00Z").getTime());
    expect(res.ev1.claimed).toBe(true);
    expect(res.ev1.completed).toBe(true);
    expect(res.ev1.progress).toBe(5);
  });

  it("窗口内但 prev.claimed 保留", () => {
    const prev = { ev1: { claimed: true, completed: false, progress: 0 } };
    const entries = [{ platform: "steam" }, { platform: "steam" }];
    const res = evaluateEvents(entries, [cfg], prev, nowActive);
    expect(res.ev1.claimed).toBe(true);
    expect(res.ev1.completed).toBe(false);
    expect(res.ev1.progress).toBe(2);
  });
});

/* ══════════════════════════════════════════════════════════════════
   组件：AchievementsPanel（P1c · C）
   ════════════════════════════════════════════════════════════════ */

describe("组件：AchievementsPanel（P1c · C）", () => {
  it("渲染解锁/未解锁 + ProgressBar 显示 current/threshold", () => {
    act(() => {
      store.achievementsDef.value = [];
      store.achievementsProgress.value = {
        ach_10_steam: { unlocked: true, unlockedAt: "2026-07-19T00:00:00.000Z", current: 10 },
      };
    });
    const { container } = render(h(AchievementsPanel, {}));
    const unlocked = container.querySelectorAll(".achievements__item.is-unlocked");
    const locked = container.querySelectorAll(".achievements__item.is-locked");
    expect(unlocked).toHaveLength(1);
    expect(locked).toHaveLength(DEFAULT_ACHIEVEMENTS.length - 1);
    expect(container.textContent).toContain("Steam 十连");
    expect(container.textContent).toContain("10 / 10"); // current/threshold
  });

  it("弹窗新增成就持久化到 achievementsDef", () => {
    act(() => {
      store.achievementsDef.value = [];
      store.achievementsProgress.value = {};
    });
    const { container } = render(h(AchievementsPanel, {}));
    fireEvent.click(container.querySelector(".achievements__add"));
    const nameInput = container.querySelector("#ach-name");
    expect(nameInput).toBeTruthy();
    setVal(nameInput, "我的成就");
    const saveBtn = [...container.querySelectorAll(".modal-btn")].find((b) =>
      b.textContent.includes("保存"),
    );
    fireEvent.click(saveBtn);

    const added = store.achievementsDef.value.find((a) => a.name === "我的成就");
    expect(added).toBeTruthy();
    expect(added.dimension).toBe("platform");
    expect(added.target).toBe("steam");
    expect(added.threshold).toBe(1);
  });
});

/* ══════════════════════════════════════════════════════════════════
   组件：EventBanner（P1c · D）
   ════════════════════════════════════════════════════════════════ */

describe("组件：EventBanner（P1c · D）", () => {
  let stop;
  beforeEach(() => {
    stop = store.initCollectionEngines();
  });
  afterEach(() => {
    if (stop) stop();
  });

  it("进行中横幅显示；过期进历史；completed 可领取", () => {
    act(() => {
      for (let i = 0; i < 8; i += 1) addEntry(`steam:eb${i}`);
    });
    let evId;
    act(() => {
      evId = store.addEvent({
        title: "限时冲刺",
        startAt: new Date(Date.now() - 1000).toISOString(),
        endAt: new Date(Date.now() + 100000).toISOString(),
        dimension: "platform",
        target: "steam",
        threshold: 3,
      });
    });

    const { container } = render(h(EventBanner, {}));
    // 进行中横幅
    expect(container.querySelector(".event-banner")).toBeTruthy();
    expect(container.textContent).toContain("限时冲刺");
    expect(container.textContent).toContain("8 / 3"); // current/threshold
    // 历史含默认过期活动
    expect(container.textContent).toContain("历史");
    expect(container.textContent).toContain("春季收藏冲刺");
    expect(container.textContent).toContain("已结束");

    // 领取
    const claimBtn = [...container.querySelectorAll(".event-banner__claim, .event-history__claim")].find(
      (b) => b.textContent.includes("领取"),
    );
    expect(claimBtn).toBeTruthy();
    fireEvent.click(claimBtn);
    expect(store.eventsProgress.value[evId].claimed).toBe(true);
  });

  it("过期活动未达成：历史中显示「已结束」，无领取按钮", () => {
    const { container } = render(h(EventBanner, {}));
    expect(container.querySelector(".event-history")).toBeTruthy();
    expect(container.textContent).toContain("历史");
    expect(container.textContent).toContain("春季收藏冲刺");
    expect(container.textContent).toContain("已结束");
    // 默认 spring 阈值 20 steam，无条目 → 不应出现领取按钮
    const springItem = [...container.querySelectorAll(".event-history__item")].find((li) =>
      li.textContent.includes("春季收藏冲刺"),
    );
    expect(springItem).toBeTruthy();
    expect(springItem.querySelector(".event-history__claim")).toBeNull();
  });

  it("弹窗新增活动持久化到 eventsConfig", () => {
    act(() => {
      store.eventsConfig.value = [];
      store.eventsProgress.value = {};
    });
    const { container } = render(h(EventBanner, {}));
    fireEvent.click(container.querySelector(".event-banner__add"));
    const titleInput = container.querySelector("#ev-title");
    expect(titleInput).toBeTruthy();
    setVal(titleInput, "我的活动");
    setVal(container.querySelector("#ev-start"), "2026-05-01T00:00");
    setVal(container.querySelector("#ev-end"), "2026-05-31T23:59");
    const saveBtn = [...container.querySelectorAll(".modal-btn")].find((b) =>
      b.textContent.includes("保存"),
    );
    fireEvent.click(saveBtn);

    const added = store.eventsConfig.value.find((e) => e.title === "我的活动");
    expect(added).toBeTruthy();
    expect(added.dimension).toBe("platform");
    expect(added.target).toBe("steam");
    expect(typeof added.startAt).toBe("string");
    expect(Number.isNaN(new Date(added.startAt).getTime())).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════
   gamesStore：成就/活动 loader + 引擎
   ════════════════════════════════════════════════════════════════ */

describe("gamesStore：成就/活动 loader（P1c）", () => {
  it("loadAchDef 读取 + 损坏回退 []", () => {
    localStorage.setItem(
      "pulse.games.achievements.def.v1",
      JSON.stringify([{ id: "a1", name: "X", dimension: "platform", target: "steam", threshold: 5 }]),
    );
    store.loadAchDef();
    expect(store.achievementsDef.value[0].id).toBe("a1");

    localStorage.setItem("pulse.games.achievements.def.v1", "{bad");
    store.loadAchDef();
    expect(store.achievementsDef.value).toEqual([]);
  });

  it("loadAchProgress 读取 + 损坏回退 {}", () => {
    localStorage.setItem(
      "pulse.games.achievements.progress.v1",
      JSON.stringify({ ach_10_steam: { unlocked: true, unlockedAt: "t", current: 5 } }),
    );
    store.loadAchProgress();
    expect(store.achievementsProgress.value.ach_10_steam.unlocked).toBe(true);

    localStorage.setItem("pulse.games.achievements.progress.v1", "{bad");
    store.loadAchProgress();
    expect(store.achievementsProgress.value).toEqual({});
  });

  it("loadEvents 读取 config + progress，损坏回退", () => {
    localStorage.setItem(
      "pulse.games.events.config.v1",
      JSON.stringify([{ id: "e1", title: "E", startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T00:00:00Z", dimension: "platform", target: "steam", threshold: 1 }]),
    );
    localStorage.setItem(
      "pulse.games.events.progress.v1",
      JSON.stringify({ e1: { claimed: false, completed: true, progress: 1 } }),
    );
    store.loadEvents();
    expect(store.eventsConfig.value[0].id).toBe("e1");
    expect(store.eventsProgress.value.e1.completed).toBe(true);

    localStorage.setItem("pulse.games.events.config.v1", "{bad");
    store.loadEvents();
    expect(store.eventsConfig.value).toEqual([]);
  });
});

describe("gamesStore：引擎重算 + 持久化 + stop", () => {
  it("initCollectionEngines 随 wishlist 重算成就/活动并落盘", () => {
    const stop = store.initCollectionEngines();

    act(() => {
      for (let i = 0; i < 12; i += 1) addEntry(`steam:s${i}`);
    });
    // 内置成就 ach_10_steam 解锁
    expect(store.achievementsProgress.value.ach_10_steam.unlocked).toBe(true);
    const storedAch = JSON.parse(localStorage.getItem("pulse.games.achievements.progress.v1"));
    expect(storedAch.ach_10_steam.unlocked).toBe(true);

    // 新增一个进行中活动（窗口含 now）
    let evId;
    act(() => {
      evId = store.addEvent({
        title: "限时",
        startAt: new Date(Date.now() - 1000).toISOString(),
        endAt: new Date(Date.now() + 100000).toISOString(),
        dimension: "platform",
        target: "steam",
        threshold: 5,
      });
    });
    expect(store.eventsProgress.value[evId].completed).toBe(true);
    const storedEv = JSON.parse(localStorage.getItem("pulse.games.events.progress.v1"));
    expect(storedEv[evId].completed).toBe(true);

    stop();
  });

  it("stop() 停止：后续 wishlist 变更不再重算成就", () => {
    const stop = store.initCollectionEngines();
    act(() => {
      for (let i = 0; i < 12; i += 1) addEntry(`steam:t${i}`);
    });
    expect(store.achievementsProgress.value.ach_10_steam.unlocked).toBe(true);

    stop();
    act(() => {
      store.wishlist.value = [];
    });
    // 引擎已停 → 解锁态保留
    expect(store.achievementsProgress.value.ach_10_steam.unlocked).toBe(true);
  });

  it("initCollectionEngines 返回函数句柄", () => {
    const stop = store.initCollectionEngines();
    expect(typeof stop).toBe("function");
    stop();
  });

  it("claimEvent 仅在 completed 时置 claimed（并持久化）", () => {
    let evId;
    act(() => {
      for (let i = 0; i < 3; i += 1) addEntry(`steam:c${i}`);
      evId = store.addEvent({
        title: "可领",
        startAt: new Date(Date.now() - 1000).toISOString(),
        endAt: new Date(Date.now() + 100000).toISOString(),
        dimension: "platform",
        target: "steam",
        threshold: 1,
      });
    });
    expect(store.eventsProgress.value[evId].completed).toBe(true);
    const ok = store.claimEvent(evId);
    expect(ok).toBe(true);
    expect(store.eventsProgress.value[evId].claimed).toBe(true);
    const stored = JSON.parse(localStorage.getItem("pulse.games.events.progress.v1"));
    expect(stored[evId].claimed).toBe(true);
  });
});
