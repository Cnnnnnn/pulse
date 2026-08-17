import { describe, expect, it, beforeEach, vi } from "vitest";

const recentList = vi.hoisted(() => vi.fn());

vi.mock("../../src/renderer/store/store-utils.ts", () => ({
  getApi: () => null,
  requireApiMethod: (name: string) => (name === "recentList" ? recentList : null),
  wrapIpc: async (fn: () => Promise<unknown>) => fn(),
}));

import {
  loadRecent,
  recent,
  recentDataState,
  recentLoaded,
} from "../../src/renderer/recent/recentStore.ts";

describe("recentStore DataState", () => {
  beforeEach(() => {
    recentList.mockReset();
    recent.value = [];
    recentLoaded.value = false;
    recentDataState.value = {
      phase: "idle",
      data: { ok: true, entries: [] },
      error: null,
      source: "unknown",
      fetchedAt: 0,
      lastAttemptAt: 0,
    };
  });

  it("成功读取进入 live/ready", async () => {
    recentList.mockResolvedValue({ ok: true, entries: [{ ts: 1, kind: "app-check", ref: "a", label: "检查" }] });
    await expect(loadRecent()).resolves.toBe(true);
    expect(recentDataState.value.phase).toBe("ready");
    expect(recentDataState.value.source).toBe("live");
    expect(recent.value).toHaveLength(1);
  });

  it("读取失败进入 error 且不伪装成空列表", async () => {
    recentList.mockRejectedValue(new Error("recent_unavailable"));
    await expect(loadRecent()).resolves.toBe(false);
    expect(recentDataState.value.phase).toBe("error");
    expect(recentDataState.value.error).toBe("recent_unavailable");
    expect(recent.value).toEqual([]);
  });
});
