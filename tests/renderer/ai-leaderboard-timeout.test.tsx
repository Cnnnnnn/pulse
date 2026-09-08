/**
 * tests/renderer/ai-leaderboard-timeout.test.tsx
 *
 * 榜单 IPC 总超时（120s）行为测试：api 永不 resolve → 超时后停 spinner、
 * error 带提示；主榜单与跨源雷达两条路径都覆盖。fake timers 驱动。
 */

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/renderer/api.ts", () => ({
  api: {
    getLeaderboard: vi.fn((_opts: any) => new Promise(() => {})),
    refreshLeaderboard: vi.fn((_opts: any) => new Promise(() => {})),
    rateBudget: vi.fn(async () => ({ used: 0, limit: 1000, remaining: 1000 })),
  },
}));

import * as store from "../../src/renderer/ai-leaderboard/aiLeaderboardStore.ts";

const IPC_TIMEOUT_MS = 120 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  store.activeView.value = "arena";
  store.items.value = [];
  store.error.value = null;
  store.loading.value = false;
  store.crossSourceItems.value = null;
  store.crossSourceError.value = null;
  store.crossSourceLoading.value = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("榜单 IPC 总超时", () => {
  it("主榜单：api 挂起 → 120s 后停 loading，error 提示超时+可刷新", async () => {
    const p = store.loadLeaderboard();
    expect(store.loading.value).toBe(true);
    await vi.advanceTimersByTimeAsync(IPC_TIMEOUT_MS + 10);
    await p;
    expect(store.loading.value).toBe(false);
    expect(store.error.value).toContain("超时");
    expect(store.error.value).toContain("刷新");
  });

  it("refresh（force）路径同样生效", async () => {
    const p = store.refresh();
    await vi.advanceTimersByTimeAsync(IPC_TIMEOUT_MS + 10);
    await p;
    expect(store.loading.value).toBe(false);
    expect(store.error.value).toContain("超时");
  });

  it("跨源雷达：api 挂起 → 120s 后 crossSourceError 提示", async () => {
    const p = store.loadCrossSource(false);
    expect(store.crossSourceLoading.value).toBe(true);
    await vi.advanceTimersByTimeAsync(IPC_TIMEOUT_MS + 10);
    await p;
    expect(store.crossSourceLoading.value).toBe(false);
    expect(store.crossSourceError.value).toContain("超时");
  });

  it("超时前 resolve → 不误报（api 快速返回时正常展示）", async () => {
    const { api } = await import("../../src/renderer/api.ts");
    (api.getLeaderboard as any).mockImplementationOnce(async () => ({
      ok: true, items: [], sources: {}, attribution: [], stale: false,
      fromCache: false, fetchedAt: null, count: 0, errors: [],
    }));
    const p = store.loadLeaderboard();
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(store.loading.value).toBe(false);
    expect(store.error.value).toBeNull();
  });
});
