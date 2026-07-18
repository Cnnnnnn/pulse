import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchItadLowest } = require("../../../src/main/games/itad.js");

afterEach(() => vi.restoreAllMocks());

function mockFetchResponse(body) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  }));
}

describe("fetchItadLowest", () => {
  it("批量查询返回 slug → lowestPrice 映射", async () => {
    vi.stubGlobal("fetch", mockFetchResponse({
      gameA: { historyLow: { amount: 9.99 } },
      gameB: { historyLow: { amount: 14.5 } },
    }));
    const result = await fetchItadLowest(["gameA", "gameB"], { key: "test-key" });
    expect(result).toEqual({ gameA: 9.99, gameB: 14.5 });
  });

  it("无 key 返回空对象", async () => {
    const result = await fetchItadLowest(["gameA"], { key: null });
    expect(result).toEqual({});
  });

  it("空 slugs 返回空对象", async () => {
    const result = await fetchItadLowest([], { key: "test-key" });
    expect(result).toEqual({});
  });

  it("缺少 historyLow 的 slug 被跳过", async () => {
    vi.stubGlobal("fetch", mockFetchResponse({
      gameA: { historyLow: { amount: 9.99 } },
      gameB: {},
    }));
    const result = await fetchItadLowest(["gameA", "gameB"], { key: "test-key" });
    expect(result).toEqual({ gameA: 9.99 });
  });

  it("fetch 抛异常返回空对象（不阻断）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const result = await fetchItadLowest(["gameA"], { key: "test-key" });
    expect(result).toEqual({});
  });

  it("超过 30 个 slug 分批请求", async () => {
    const fetchMock = mockFetchResponse({ somegame: { historyLow: { amount: 1 } } });
    vi.stubGlobal("fetch", fetchMock);
    const slugs = Array.from({ length: 45 }, (_, i) => `game${i}`);
    await fetchItadLowest(slugs, { key: "test-key" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
