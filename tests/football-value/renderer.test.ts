/**
 * tests/football-value/renderer.test.ts
 *
 * 渲染层 store 测试（vitest + preact / happy-dom）。
 * 覆盖：loadBoard / refresh / 位置筛选 / 搜索 / 涨跌派生 / sample 态。
 *
 * 纯本地：api.ts 用 mock 注入，无网络出口。
 */

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/renderer/api.ts", () => ({
  api: {
    footballValueGet: vi.fn(async () => ({
      ok: true,
      players: [],
      count: 0,
      source: null,
      stale: false,
      fromCache: false,
      isSample: false,
      fetchedAt: null,
      errors: [],
    })),
    footballValueRefresh: vi.fn(async () => ({
      ok: true,
      players: [],
      count: 0,
      source: null,
      stale: false,
      fromCache: false,
      isSample: false,
      fetchedAt: null,
      errors: [],
    })),
  },
}));

import * as store from "../../src/renderer/football-value/footballValueStore.ts";
import { formatValueEur } from "../../src/renderer/football-value/types.ts";
import { api } from "../../src/renderer/api.ts";

const mkPlayer = (over: any = {}) => ({
  id: over.id || "p1",
  name: over.name || "Player",
  position: over.position || "FW",
  age: over.age ?? 26,
  club: over.club || "Club",
  nationality: over.nationality || "Nation",
  valueEur: over.valueEur ?? 100000000,
  valueLabel: over.valueLabel || formatValueEur(over.valueEur ?? 100000000),
  prevValueEur: over.prevValueEur ?? null,
  rank: over.rank ?? 1,
  isSample: !!over.isSample,
});

const SAMPLE_BOARD = {
  ok: true,
  players: [
    mkPlayer({ id: "1", name: "Haaland", position: "FW", valueEur: 180000000, prevValueEur: 150000000 }),
    mkPlayer({ id: "2", name: "Bellingham", position: "MF", valueEur: 180000000, prevValueEur: null, rank: 2 }),
    mkPlayer({ id: "3", name: "Araújo", position: "DF", valueEur: 70000000, prevValueEur: 80000000, rank: 3 }),
    mkPlayer({ id: "4", name: "Donnarumma", position: "GK", valueEur: 40000000, prevValueEur: 40000000, rank: 4 }),
  ],
  count: 4,
  source: "live",
  stale: false,
  fromCache: false,
  isSample: false,
  fetchedAt: "2026-08-01T00:00:00.000Z",
  errors: [],
};

beforeEach(() => {
  (api.footballValueGet as any).mockClear();
  (api.footballValueRefresh as any).mockClear();
  // 重置 signals
  store.players.value = [];
  store.loading.value = false;
  store.error.value = null;
  store.source.value = null;
  store.stale.value = false;
  store.fromCache.value = false;
  store.isSample.value = false;
  store.fetchedAt.value = null;
  store.errors.value = [];
  store.activePositions.value = new Set();
  store.searchQuery.value = "";
});

afterEach(() => {
  store.players.value = [];
  store.activePositions.value = new Set();
  store.searchQuery.value = "";
});

describe("football-value store", () => {
  it("loadBoard 拉取并归一化", async () => {
    (api.footballValueGet as any).mockResolvedValue(SAMPLE_BOARD);
    await store.loadBoard();
    expect(store.players.value.length).toBe(4);
    expect(store.source.value).toBe("live");
    expect(store.isSample.value).toBe(false);
    expect(store.error.value).toBeNull();
  });

  it("已有数据时 loadBoard 不重复请求", async () => {
    (api.footballValueGet as any).mockResolvedValue(SAMPLE_BOARD);
    await store.loadBoard();
    (api.footballValueGet as any).mockClear();
    await store.loadBoard();
    expect(api.footballValueGet).not.toHaveBeenCalled();
  });

  it("refresh 强制重拉", async () => {
    (api.footballValueRefresh as any).mockResolvedValue(SAMPLE_BOARD);
    await store.refresh();
    expect(api.footballValueRefresh).toHaveBeenCalledTimes(1);
    expect(store.players.value.length).toBe(4);
  });

  it("接口失败 → error + 清空", async () => {
    (api.footballValueGet as any).mockResolvedValue({ ok: false, error: "aggregate_failed" });
    await store.loadBoard();
    expect(store.error.value).toBe("aggregate_failed");
    expect(store.players.value.length).toBe(0);
  });

  it("位置筛选", () => {
    store.players.value = SAMPLE_BOARD.players;
    store.setPosition("DF");
    expect(store.getDisplayed().length).toBe(1);
    expect(store.getDisplayed()[0].name).toBe("Araújo");
    store.setPosition(null);
    expect(store.getDisplayed().length).toBe(4);
  });

  it("搜索（球员/俱乐部/国籍）", () => {
    store.players.value = SAMPLE_BOARD.players;
    store.setSearchQuery("haaland");
    expect(store.getDisplayed().length).toBe(1);
    store.setSearchQuery("club");
    expect(store.getDisplayed().length).toBe(4);
    store.clearSearchQuery();
    expect(store.getDisplayed().length).toBe(4);
  });

  it("sample 态标记", () => {
    store.source.value = "sample";
    store.isSample.value = true;
    expect(store.hasSampleSource()).toBe(true);
  });
});
