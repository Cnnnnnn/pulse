/**
 * tests/renderer/nav-refresh.test.js
 *
 * v2.24.2 — 单测全局刷新 registry:
 *   - REFRESHABLE_NAV_KEYS 包含 wechat-hot / ithome / worldcup / funds / metals
 *   - 不包含 ai-usage / versions (后续按需扩展)
 *   - refreshActiveNav 派发到对应 fn
 *   - 未注册的 nav key 返 false 不抛错
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

beforeEach(() => {
  vi.clearAllMocks();
  refreshWechatHot.mockResolvedValue(true);
  refreshIthomeNews.mockResolvedValue(undefined);
  refreshWorldcupScores.mockResolvedValue(undefined);
  fetchNavNow.mockResolvedValue(undefined);
  refreshMetals.mockResolvedValue(undefined);
});

describe("nav-refresh REFRESHABLE_NAV_KEYS", () => {
  it("contains wechat-hot, ithome, worldcup, funds, metals", () => {
    expect(REFRESHABLE_NAV_KEYS.has("wechat-hot")).toBe(true);
    expect(REFRESHABLE_NAV_KEYS.has("ithome")).toBe(true);
    expect(REFRESHABLE_NAV_KEYS.has("worldcup")).toBe(true);
    expect(REFRESHABLE_NAV_KEYS.has("funds")).toBe(true);
    expect(REFRESHABLE_NAV_KEYS.has("metals")).toBe(true);
  });

  it("does NOT contain ai-usage / versions (out of scope for global refresh)", () => {
    expect(REFRESHABLE_NAV_KEYS.has("ai-usage")).toBe(false);
    expect(REFRESHABLE_NAV_KEYS.has("versions")).toBe(false);
  });
});

describe("getRefreshEntry", () => {
  it("returns entry for registered nav key", () => {
    const e = getRefreshEntry("wechat-hot");
    expect(e).toBeTruthy();
    expect(e.label).toContain("微博");
    expect(typeof e.fn).toBe("function");
  });

  it("returns null for unknown nav key", () => {
    expect(getRefreshEntry("nope")).toBeNull();
    expect(getRefreshEntry("ai-usage")).toBeNull();
  });
});

describe("refreshActiveNav dispatch", () => {
  it("wechat-hot → calls refreshWechatHot", async () => {
    const ok = await refreshActiveNav("wechat-hot");
    expect(ok).toBe(true);
    expect(refreshWechatHot).toHaveBeenCalledTimes(1);
  });

  it("ithome → calls refreshIthomeNews", async () => {
    const ok = await refreshActiveNav("ithome");
    expect(ok).toBe(true);
    expect(refreshIthomeNews).toHaveBeenCalledTimes(1);
  });

  it("worldcup → calls refreshWorldcupScores", async () => {
    const ok = await refreshActiveNav("worldcup");
    expect(ok).toBe(true);
    expect(refreshWorldcupScores).toHaveBeenCalledTimes(1);
  });

  it("funds → calls fetchNavNow with api instance", async () => {
    const ok = await refreshActiveNav("funds");
    expect(ok).toBe(true);
    expect(fetchNavNow).toHaveBeenCalledTimes(1);
    expect(fetchNavNow.mock.calls[0][0]).toEqual({ __mock: true });
  });

  it("metals → calls refreshNow (alias refreshMetals)", async () => {
    const ok = await refreshActiveNav("metals");
    expect(ok).toBe(true);
    expect(refreshMetals).toHaveBeenCalledTimes(1);
  });

  it("returns false (does not throw) for unknown nav key", async () => {
    const ok = await refreshActiveNav("unknown");
    expect(ok).toBe(false);
    expect(refreshWechatHot).not.toHaveBeenCalled();
    expect(refreshIthomeNews).not.toHaveBeenCalled();
  });

  it("swallows thrown errors from refresh fn (UI surfaces errors via tab signals)", async () => {
    refreshWechatHot.mockRejectedValueOnce(new Error("upstream down"));
    const ok = await refreshActiveNav("wechat-hot");
    expect(ok).toBe(true); // dispatched, error swallowed
    expect(refreshWechatHot).toHaveBeenCalledTimes(1);
  });
});