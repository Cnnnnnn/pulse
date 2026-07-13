// @vitest-environment happy-dom
/**
 * tests/renderer/nav-refresh.test.js
 *
 * v2.24.2 — 单测全局刷新 registry:
 *   - REFRESHABLE_NAV_KEYS 包含 news (合并 IT 新闻 + 微博热搜) / worldcup / funds / metals
 *   - 不包含 ai-usage / versions (后续按需扩展)
 *   - news 看 DOM sub-tab 派发到对应 fn
 *   - refreshActiveNav 派发到对应 fn
 *   - 未注册的 nav key 返 false 不抛错
 *
 * 2026-07-10 P-N+: IT 新闻 + 微博热搜 合并 → 'news'.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock 所有依赖模块, 因为 vitest ESM 需要先 hoist vi.mock 才能生效
vi.mock("../../src/renderer/wechat-hot/store.js", () => ({
  refreshWechatHot: vi.fn(),
}));
vi.mock("../../src/renderer/ithome/store.js", () => ({
  refreshIthomeNews: vi.fn(),
}));
vi.mock("../../src/renderer/worldcup/store.js", () => ({
  refreshWorldcupScores: vi.fn(),
}));
vi.mock("../../src/renderer/funds/fundStore.js", () => ({
  fetchNavNow: vi.fn(),
}));
vi.mock("../../src/renderer/metals/metalStore.js", () => ({
  refreshNow: vi.fn(),
}));
vi.mock("../../src/renderer/api.js", () => ({
  api: { __mock: true },
}));

import {
  refreshActiveNav,
  getRefreshEntry,
  REFRESHABLE_NAV_KEYS,
} from "../../src/renderer/nav-refresh.js";
import { refreshWechatHot } from "../../src/renderer/wechat-hot/store.js";
import { refreshIthomeNews } from "../../src/renderer/ithome/store.js";
import { refreshWorldcupScores } from "../../src/renderer/worldcup/store.js";
import { fetchNavNow } from "../../src/renderer/funds/fundStore.js";
import { refreshNow as refreshMetals } from "../../src/renderer/metals/metalStore.js";
import { investPrimary } from "../../src/renderer/worldcup/navStore.js";

beforeEach(() => {
  vi.clearAllMocks();
  refreshWechatHot.mockResolvedValue(true);
  refreshIthomeNews.mockResolvedValue(undefined);
  refreshWorldcupScores.mockResolvedValue(undefined);
  fetchNavNow.mockResolvedValue(undefined);
  refreshMetals.mockResolvedValue(undefined);
  // 重置 investPrimary 到默认值 funds (避免跨测试污染)
  investPrimary.value = "funds";
  // 清掉 news-layout DOM 状态 (上一 test 可能设过 sub-tab)
  document.querySelector(".news-layout")?.removeAttribute("data-subtab");
});

describe("nav-refresh REFRESHABLE_NAV_KEYS", () => {
  it("contains news, worldcup, invest (2026-07-13 投资 nav 合并)", () => {
    expect(REFRESHABLE_NAV_KEYS.has("news")).toBe(true);
    expect(REFRESHABLE_NAV_KEYS.has("worldcup")).toBe(true);
    expect(REFRESHABLE_NAV_KEYS.has("invest")).toBe(true);
  });

  it("does NOT contain legacy funds/metals/stocks/ithome/wechat-hot/ai-usage/versions", () => {
    expect(REFRESHABLE_NAV_KEYS.has("funds")).toBe(false);
    expect(REFRESHABLE_NAV_KEYS.has("metals")).toBe(false);
    expect(REFRESHABLE_NAV_KEYS.has("stocks")).toBe(false);
    expect(REFRESHABLE_NAV_KEYS.has("ithome")).toBe(false);
    expect(REFRESHABLE_NAV_KEYS.has("wechat-hot")).toBe(false);
    expect(REFRESHABLE_NAV_KEYS.has("ai-usage")).toBe(false);
    expect(REFRESHABLE_NAV_KEYS.has("versions")).toBe(false);
  });
});

describe("getRefreshEntry", () => {
  it("returns entry for news (P-N+ 合并)", () => {
    const e = getRefreshEntry("news");
    expect(e).toBeTruthy();
    expect(e.label).toContain("新闻");
    expect(typeof e.fn).toBe("function");
  });

  it("returns null for unknown nav key", () => {
    expect(getRefreshEntry("nope")).toBeNull();
    expect(getRefreshEntry("ai-usage")).toBeNull();
  });
});

describe("refreshActiveNav dispatch", () => {
  it("news 默认 (无 DOM data-subtab) → refreshIthomeNews", async () => {
    const ok = await refreshActiveNav("news");
    expect(ok).toBe(true);
    expect(refreshIthomeNews).toHaveBeenCalledTimes(1);
    expect(refreshWechatHot).not.toHaveBeenCalled();
  });

  it("news + DOM data-subtab=wechat-hot → refreshWechatHot", async () => {
    const el = document.createElement("div");
    el.className = "news-layout";
    el.setAttribute("data-subtab", "wechat-hot");
    document.body.appendChild(el);
    try {
      const ok = await refreshActiveNav("news");
      expect(ok).toBe(true);
      expect(refreshWechatHot).toHaveBeenCalledTimes(1);
      expect(refreshIthomeNews).not.toHaveBeenCalled();
    } finally {
      el.remove();
    }
  });

  it("news + DOM data-subtab=ithome → refreshIthomeNews", async () => {
    const el = document.createElement("div");
    el.className = "news-layout";
    el.setAttribute("data-subtab", "ithome");
    document.body.appendChild(el);
    try {
      const ok = await refreshActiveNav("news");
      expect(ok).toBe(true);
      expect(refreshIthomeNews).toHaveBeenCalledTimes(1);
      expect(refreshWechatHot).not.toHaveBeenCalled();
    } finally {
      el.remove();
    }
  });

  it("worldcup → calls refreshWorldcupScores", async () => {
    const ok = await refreshActiveNav("worldcup");
    expect(ok).toBe(true);
    expect(refreshWorldcupScores).toHaveBeenCalledTimes(1);
  });

  it("funds → calls fetchNavNow with api instance", async () => {
    const ok = await refreshActiveNav("funds");
    expect(ok).toBe(false); // legacy key 不在 registry
    expect(fetchNavNow).not.toHaveBeenCalled();
  });

  it("metals → calls refreshNow (alias refreshMetals)", async () => {
    const ok = await refreshActiveNav("metals");
    expect(ok).toBe(false); // legacy key 不在 registry
    expect(refreshMetals).not.toHaveBeenCalled();
  });

  it("invest + investPrimary=funds → fetchNavNow", async () => {
    investPrimary.value = "funds";
    const ok = await refreshActiveNav("invest");
    expect(ok).toBe(true);
    expect(fetchNavNow).toHaveBeenCalledTimes(1);
    expect(refreshMetals).not.toHaveBeenCalled();
  });

  it("invest + investPrimary=metals → refreshMetals", async () => {
    investPrimary.value = "metals";
    const ok = await refreshActiveNav("invest");
    expect(ok).toBe(true);
    expect(refreshMetals).toHaveBeenCalledTimes(1);
    expect(fetchNavNow).not.toHaveBeenCalled();
  });

  it("invest + investPrimary=stocks → resolves true (选股静默刷新, 无显式 action)", async () => {
    investPrimary.value = "stocks";
    const ok = await refreshActiveNav("invest");
    expect(ok).toBe(true);
    expect(fetchNavNow).not.toHaveBeenCalled();
    expect(refreshMetals).not.toHaveBeenCalled();
  });

  it("returns false (does not throw) for unknown nav key", async () => {
    const ok = await refreshActiveNav("unknown");
    expect(ok).toBe(false);
    expect(refreshWechatHot).not.toHaveBeenCalled();
    expect(refreshIthomeNews).not.toHaveBeenCalled();
  });

  it("swallows thrown errors from refresh fn (UI surfaces errors via tab signals)", async () => {
    refreshIthomeNews.mockRejectedValueOnce(new Error("upstream down"));
    const ok = await refreshActiveNav("news");
    expect(ok).toBe(true); // dispatched, error swallowed
    expect(refreshIthomeNews).toHaveBeenCalledTimes(1);
  });
});