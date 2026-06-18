/**
 * tests/renderer/wechat-hot/store.test.js
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    wechatHotLoad: vi.fn(),
    wechatHotRefresh: vi.fn(),
    onWechatHotUpdated: vi.fn(() => () => {}),
  },
}));

vi.mock("../../../src/renderer/api.js", () => ({ api: mockApi }));

const store = await import("../../../src/renderer/wechat-hot/store.js");
const {
  wechatHotItems,
  wechatHotLoaded,
  wechatHotLoading,
  wechatHotError,
  wechatHotLastFetched,
  wechatHotLastRefreshAt,
  wechatHotUpdatedUnsub,
  applyPayload,
  bootstrapWechatHotTab,
  refreshWechatHot,
  subscribeWechatHotUpdates,
  cleanupWechatHotUpdates,
} = store;

const SAMPLE = {
  items: [{ rank: 1, title: "X", url: "https://x" }],
  fetchedAt: 1700000000000,
  source: "tenhot",
};

beforeEach(() => {
  // 重置 signals 到初始
  wechatHotItems.value = [];
  wechatHotLoaded.value = false;
  wechatHotLoading.value = false;
  wechatHotError.value = null;
  wechatHotLastFetched.value = 0;
  wechatHotLastRefreshAt.value = 0;
  mockApi.wechatHotLoad.mockReset();
  mockApi.wechatHotRefresh.mockReset();
  mockApi.onWechatHotUpdated.mockClear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("wechat-hot store: applyPayload", () => {
  it("sets signals from payload", () => {
    applyPayload(SAMPLE);
    expect(wechatHotItems.value).toEqual(SAMPLE.items);
    expect(wechatHotLastFetched.value).toBe(1700000000000);
    expect(wechatHotLoaded.value).toBe(true);
    expect(wechatHotError.value).toBe(null);
  });
});

describe("wechat-hot store: bootstrap", () => {
  it("loads cache; refreshes when cache empty", async () => {
    mockApi.wechatHotLoad.mockResolvedValueOnce({ items: [], fetchedAt: 0, source: "tenhot" });
    mockApi.wechatHotRefresh.mockResolvedValueOnce(SAMPLE);
    await bootstrapWechatHotTab();
    expect(mockApi.wechatHotLoad).toHaveBeenCalledTimes(1);
    expect(wechatHotItems.value).toEqual(SAMPLE.items);
  });

  it("skips refresh when cache has items", async () => {
    mockApi.wechatHotLoad.mockResolvedValueOnce(SAMPLE);
    await bootstrapWechatHotTab();
    expect(mockApi.wechatHotRefresh).not.toHaveBeenCalled();
  });
});

describe("wechat-hot store: refreshWechatHot 15s cooldown", () => {
  it("first call: invokes api.wechatHotRefresh", async () => {
    mockApi.wechatHotRefresh.mockResolvedValueOnce(SAMPLE);
    const r = await refreshWechatHot();
    expect(r).toBe(true);
    expect(mockApi.wechatHotRefresh).toHaveBeenCalledTimes(1);
  });

  it("second call within 15s: returns false silently", async () => {
    mockApi.wechatHotRefresh.mockResolvedValue(SAMPLE);
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
    await refreshWechatHot();
    vi.setSystemTime(1_000_000_005_000); // +5s
    const r = await refreshWechatHot();
    expect(r).toBe(false);
    expect(mockApi.wechatHotRefresh).toHaveBeenCalledTimes(1);
  });

  it("call after 15s: refreshes again", async () => {
    mockApi.wechatHotRefresh.mockResolvedValue(SAMPLE);
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
    await refreshWechatHot();
    vi.setSystemTime(1_000_000_016_000); // +16s
    const r = await refreshWechatHot();
    expect(r).toBe(true);
    expect(mockApi.wechatHotRefresh).toHaveBeenCalledTimes(2);
  });
});

describe("wechat-hot store: subscribe", () => {
  it("subscribe stores unsub; subscribe twice is idempotent; cleanup calls it", () => {
    const unsub = vi.fn();
    mockApi.onWechatHotUpdated.mockReturnValueOnce(unsub);
    subscribeWechatHotUpdates();
    expect(wechatHotUpdatedUnsub.value).toBe(unsub);
    // idempotent: second call must not re-register
    subscribeWechatHotUpdates();
    expect(mockApi.onWechatHotUpdated).toHaveBeenCalledTimes(1);
    cleanupWechatHotUpdates();
    expect(unsub).toHaveBeenCalledTimes(1);
    // cleanup is also safe to call again
    cleanupWechatHotUpdates();
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});