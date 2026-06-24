/**
 * tests/renderer/nav-store-clear-wechat-hot.test.js
 *
 * I6 v2: setActiveNav('wechat-hot') 切到该 tab 时清 wechatHotNewIds.
 * 行为对标 clearFundNavBadge / clearAiUsageNavBadge.
 *
 * - 首次切过来 (prev !== 'wechat-hot') → clearWechatHotUnreadBadge
 * - 已经在 wechat-hot (prev === 'wechat-hot') → 不重清
 * - 切到其他 tab → 不调
 * - wechatHotReadIds (持久化) 在清角标后保持不变
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { signal } from "@preact/signals";

// 用真实 wechat-hot store (我们要测新加的 clearWechatHotUnreadBadge + 跟 setActiveNav 集成)
import { setActiveNav, activeNav } from "../../src/renderer/worldcup/navStore.js";
import {
  wechatHotNewIds,
  wechatHotReadIds,
  wechatHotUnreadBadge,
} from "../../src/renderer/wechat-hot/store.js";

// stub 其它 wechat-hot API (本测试不调)
vi.mock("../../src/renderer/api.js", () => ({
  api: {
    wechatHotLoad: vi.fn(async () => ({ items: [] })),
    wechatHotRefresh: vi.fn(async () => ({ items: [] })),
    wechatHotLoadRead: vi.fn(async () => ({})),
    wechatHotMarkRead: vi.fn(async () => ({ ok: true })),
    onWechatHotUpdated: vi.fn(() => () => {}),
  },
}));

// stub funds/ai-usage store 里的 clear 函数 (避免拉它们的依赖)
vi.mock("../../src/renderer/funds/fundStore.js", () => ({
  clearFundNavBadge: vi.fn(),
  fundUnreadBadge: { value: 0 },
}));

vi.mock("../../src/renderer/store/ai-usage-store.js", () => ({
  clearAiUsageNavBadge: vi.fn(),
  aiUsageNavBadge: { value: 0 },
}));

vi.mock("../../src/renderer/recent/track.js", () => ({
  trackFundView: vi.fn(),
  trackIthomeView: vi.fn(),
}));

beforeEach(() => {
  // 重置
  wechatHotNewIds.value = {};
  wechatHotReadIds.value = {};
  activeNav.value = "versions";
});

describe("I6 v2 — setActiveNav('wechat-hot') 触发 clearWechatHotUnreadBadge", () => {
  it("从 versions 切到 wechat-hot → wechatHotNewIds 清空", () => {
    wechatHotNewIds.value = { "热搜1": 1, "热搜2": 1, "热搜3": 1 };
    expect(wechatHotUnreadBadge.value).toBe(3);
    setActiveNav("wechat-hot");
    expect(wechatHotNewIds.value).toEqual({});
    expect(wechatHotUnreadBadge.value).toBe(0);
  });

  it("从 ithome 切到 wechat-hot → 清零", () => {
    activeNav.value = "ithome";
    wechatHotNewIds.value = { "A": 1, "B": 1 };
    setActiveNav("wechat-hot");
    expect(wechatHotNewIds.value).toEqual({});
  });

  it("从 funds 切到 wechat-hot → 清零 (且仍触发 clearFundNavBadge, 顺序无关)", () => {
    activeNav.value = "funds";
    wechatHotNewIds.value = { "X": 1 };
    setActiveNav("wechat-hot");
    expect(wechatHotNewIds.value).toEqual({});
  });

  it("已经在 wechat-hot (prev === wechat-hot) → 不重清 (幂等)", () => {
    activeNav.value = "wechat-hot";
    wechatHotNewIds.value = { "A": 1, "B": 1 };
    // 第二次 setActiveNav 同一个 key, prev === key → 跳过 wechat-hot 块
    setActiveNav("wechat-hot");
    // wechatHotNewIds 没动 (因为没进 if 块)
    expect(wechatHotNewIds.value).toEqual({ A: 1, B: 1 });
  });

  it("切到其他 tab (funds/ai-usage/ithome/versions/metals/worldcup) → 不调 clearWechatHotUnreadBadge", () => {
    wechatHotNewIds.value = { "A": 1, "B": 1, "C": 1 };
    setActiveNav("funds");
    expect(wechatHotNewIds.value).toEqual({ A: 1, B: 1, C: 1 });
    setActiveNav("ai-usage");
    expect(wechatHotNewIds.value).toEqual({ A: 1, B: 1, C: 1 });
    setActiveNav("ithome");
    expect(wechatHotNewIds.value).toEqual({ A: 1, B: 1, C: 1 });
    setActiveNav("versions");
    expect(wechatHotNewIds.value).toEqual({ A: 1, B: 1, C: 1 });
    setActiveNav("metals");
    expect(wechatHotNewIds.value).toEqual({ A: 1, B: 1, C: 1 });
    setActiveNav("worldcup");
    expect(wechatHotNewIds.value).toEqual({ A: 1, B: 1, C: 1 });
  });

  it("清角标不动 wechatHotReadIds (持久化已读词保留)", () => {
    wechatHotReadIds.value = { "老热搜1": 1700000000000, "老热搜2": 1700000001000 };
    wechatHotNewIds.value = { "新热搜1": 1, "新热搜2": 1 };
    setActiveNav("wechat-hot");
    expect(wechatHotNewIds.value).toEqual({});
    // readIds 完全不动
    expect(wechatHotReadIds.value).toEqual({
      "老热搜1": 1700000000000,
      "老热搜2": 1700000001000,
    });
  });

  it("wechatHotNewIds 已经空 → clearWechatHotUnreadBadge 仍是 noop (不抛错)", () => {
    wechatHotNewIds.value = {};
    setActiveNav("wechat-hot");
    expect(wechatHotNewIds.value).toEqual({});
  });
});

describe("I6 v2 — clearWechatHotUnreadBadge 独立函数", () => {
  it("直接调用 → 清 wechatHotNewIds, 不动 readIds", async () => {
    const { clearWechatHotUnreadBadge } = await import(
      "../../src/renderer/wechat-hot/store.js"
    );
    wechatHotReadIds.value = { "old": 1 };
    wechatHotNewIds.value = { "new1": 1, "new2": 1 };
    clearWechatHotUnreadBadge();
    expect(wechatHotNewIds.value).toEqual({});
    expect(wechatHotReadIds.value).toEqual({ old: 1 });
  });
});