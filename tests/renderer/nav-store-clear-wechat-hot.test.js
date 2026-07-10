/**
 * tests/renderer/nav-store-clear-wechat-hot.test.js
 *
 * P-N+ news 合并: setActiveNav('news') 切到新闻 tab 同时清 ithome 和 wechat-hot 角标.
 *
 * - 首次切过来 (prev !== 'news' 且 target === 'news') → clearIthome + clearWechatHot
 * - 已经在 'news' → 不重清
 * - 切到其他 tab → 不调
 * - wechatHotReadIds / ithomeReadIds (持久化) 在清角标后保持不变
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { signal } from "@preact/signals";

// 用真实 stores 测 setActiveNav 集成
import { setActiveNav, activeNav } from "../../src/renderer/worldcup/navStore.js";
import {
  wechatHotNewIds,
  wechatHotReadIds,
  wechatHotUnreadBadge,
} from "../../src/renderer/wechat-hot/store.js";
import { ithomeNewIds, ithomeUnreadBadge } from "../../src/renderer/ithome/store.js";

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

// stub funds/ai-usage store (避免拉它们的依赖)
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
  wechatHotNewIds.value = {};
  wechatHotReadIds.value = {};
  ithomeNewIds.value = {};
  activeNav.value = "versions";
});

describe("P-N+ — setActiveNav('news') 触发 clearIthome + clearWechatHotUnreadBadge", () => {
  it("从 versions 切到 news → wechatHotNewIds 和 ithomeNewIds 都清空", () => {
    wechatHotNewIds.value = { "热搜1": 1, "热搜2": 1, "热搜3": 1 };
    ithomeNewIds.value = { "IT1": 1, "IT2": 1 };
    expect(wechatHotUnreadBadge.value).toBe(3);
    expect(ithomeUnreadBadge.value).toBe(2);
    setActiveNav("news");
    expect(wechatHotNewIds.value).toEqual({});
    expect(ithomeNewIds.value).toEqual({});
    expect(wechatHotUnreadBadge.value).toBe(0);
    expect(ithomeUnreadBadge.value).toBe(0);
  });

  it("从 ithome 切到 news → 两个 newIds 都清零 (ithome 自身也算 news 的子项)", () => {
    activeNav.value = "ithome";
    wechatHotNewIds.value = { "A": 1, "B": 1 };
    ithomeNewIds.value = { "X": 1 };
    setActiveNav("news");
    expect(wechatHotNewIds.value).toEqual({});
    expect(ithomeNewIds.value).toEqual({});
  });

  it("从 funds 切到 news → 两个 newIds 都清零 (且仍触发 clearFundNavBadge, 顺序无关)", () => {
    activeNav.value = "funds";
    wechatHotNewIds.value = { "X": 1 };
    ithomeNewIds.value = { "Y": 1 };
    setActiveNav("news");
    expect(wechatHotNewIds.value).toEqual({});
    expect(ithomeNewIds.value).toEqual({});
  });

  it("已经在 news (prev === news) → 不重清 (幂等)", () => {
    activeNav.value = "news";
    wechatHotNewIds.value = { "A": 1, "B": 1 };
    ithomeNewIds.value = { "X": 1 };
    setActiveNav("news");
    expect(wechatHotNewIds.value).toEqual({ A: 1, B: 1 });
    expect(ithomeNewIds.value).toEqual({ X: 1 });
  });

  it("切到其他 tab (funds/ai-usage/versions/metals/worldcup) → 不调 news 块清角标", () => {
    wechatHotNewIds.value = { "A": 1 };
    ithomeNewIds.value = { "X": 1 };
    setActiveNav("funds");
    expect(wechatHotNewIds.value).toEqual({ A: 1 });
    expect(ithomeNewIds.value).toEqual({ X: 1 });
    setActiveNav("ai-usage");
    expect(wechatHotNewIds.value).toEqual({ A: 1 });
    expect(ithomeNewIds.value).toEqual({ X: 1 });
    setActiveNav("versions");
    expect(wechatHotNewIds.value).toEqual({ A: 1 });
    expect(ithomeNewIds.value).toEqual({ X: 1 });
    setActiveNav("metals");
    expect(wechatHotNewIds.value).toEqual({ A: 1 });
    expect(ithomeNewIds.value).toEqual({ X: 1 });
    setActiveNav("worldcup");
    expect(wechatHotNewIds.value).toEqual({ A: 1 });
    expect(ithomeNewIds.value).toEqual({ X: 1 });
  });

  it("清角标不动 wechatHotReadIds (持久化已读词保留)", () => {
    wechatHotReadIds.value = { "老热搜1": 1700000000000, "老热搜2": 1700000001000 };
    wechatHotNewIds.value = { "新热搜1": 1, "新热搜2": 1 };
    setActiveNav("news");
    expect(wechatHotNewIds.value).toEqual({});
    expect(wechatHotReadIds.value).toEqual({
      "老热搜1": 1700000000000,
      "老热搜2": 1700000001000,
    });
  });

  it("两个 newIds 都已空 → 仍是 noop (不抛错)", () => {
    wechatHotNewIds.value = {};
    ithomeNewIds.value = {};
    setActiveNav("news");
    expect(wechatHotNewIds.value).toEqual({});
    expect(ithomeNewIds.value).toEqual({});
  });
});
