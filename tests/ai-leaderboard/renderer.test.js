/**
 * tests/ai-leaderboard/renderer.test.js
 *
 * AI 榜单渲染层测试（vitest + preact / happy-dom）。
 * v3.0: 适配双视角 store API（setView / setBoard / setDim）。
 * 覆盖：store actions、本地筛选（vendor / 搜索）、本地排序、sample 态。
 *
 * 纯本地：api.js 用 mock 注入，无网络出口。仅 import 真实 store / 组件。
 */

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { h } from "preact";
import { render, screen, cleanup } from "@testing-library/preact";

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    getLeaderboard: vi.fn(async () => ({
      ok: true,
      items: [],
      sources: {},
      attribution: [],
      stale: false,
      fromCache: false,
      fetchedAt: null,
      count: 0,
    })),
    refreshLeaderboard: vi.fn(async () => ({
      ok: true,
      items: [],
      sources: {},
      attribution: [],
      stale: false,
      fromCache: false,
      fetchedAt: null,
      count: 0,
    })),
  },
}));

import * as store from "../../src/renderer/ai-leaderboard/aiLeaderboardStore.js";
import { LeaderboardTable } from "../../src/renderer/ai-leaderboard/LeaderboardTable.jsx";

afterEach(cleanup);

function mkModel(over = {}) {
  return {
    id: over.id || "m",
    name: over.name || "Model",
    vendor: over.vendor || "other",
    vendorRaw: over.vendorRaw || null,
    category: over.category || "llm",
    license: over.license || null,
    arena: over.arena || {},
    aa: over.aa || null,
    openrouter: over.openrouter || null,
    sources: over.sources || { arena: "none", aa: "none", openrouter: "none" },
    isSample: !!over.isSample,
    fetchedAt: over.fetchedAt || null,
    rankDelta: over.rankDelta ?? null,
    isNew: !!over.isNew,
  };
}

beforeEach(() => {
  localStorage.clear();
  store.activeView.value = "arena";
  store.activeBoard.value = "text";
  store.activeDim.value = "intelligence";
  store.activeVendor.value = "all";
  store.sortDir.value = "desc";
  store.searchQuery.value = "";
  store.items.value = [];
  store.sources.value = {};
  store.attribution.value = [];
  store.loading.value = false;
  store.error.value = null;
  store.stale.value = false;
  store.fromCache.value = false;
  store.fetchedAt.value = null;
  store.compareList.value = [];
});

describe("store actions — 视角 / board / 维度切换", () => {
  it("setView 切换视角并重置 vendor 和 compareList", async () => {
    store.activeVendor.value = "openai";
    store.compareList.value = ["a", "b"];
    await store.setView("aa");
    expect(store.activeView.value).toBe("aa");
    expect(store.activeVendor.value).toBe("all");
    expect(store.compareList.value).toEqual([]);
  });

  it("setBoard 切换 Arena board 并重置 vendor", async () => {
    store.activeVendor.value = "google";
    await store.setBoard("vision");
    expect(store.activeBoard.value).toBe("vision");
    expect(store.activeVendor.value).toBe("all");
  });

  it("setDim 切换 AA 维度并重置 vendor + 调整排序方向", async () => {
    store.activeView.value = "aa";
    store.activeVendor.value = "anthropic";
    await store.setDim("price");
    expect(store.activeDim.value).toBe("price");
    expect(store.activeVendor.value).toBe("all");
    expect(store.sortDir.value).toBe("asc"); // price 默认升序
  });

  it("setDim 非法值被忽略", async () => {
    await store.setDim("nope");
    expect(store.activeDim.value).toBe("intelligence");
  });

  it("setView 相同值不触发请求", () => {
    const result = store.setView("arena");
    expect(result).toBeUndefined();
  });
});

describe("sorting — Arena ELO / AA index", () => {
  it("Arena 视角按 ELO 降序排序", () => {
    store.activeView.value = "arena";
    store.activeBoard.value = "text";
    const list = [
      mkModel({ id: "a", arena: { text: { score: 800 } } }),
      mkModel({ id: "b", arena: { text: { score: 1200 } } }),
      mkModel({ id: "c", arena: {} }),
      mkModel({ id: "d", arena: { text: { score: 1000 } } }),
    ];
    store.items.value = list;
    const shown = store.getDisplayed();
    expect(shown.map((m) => m.id)).toEqual(["b", "d", "a"]);
    // c 没有 text board 分数，被 Arena 视角过滤掉
  });

  it("AA 视角按 intelligence 降序排序", () => {
    store.activeView.value = "aa";
    const list = [
      mkModel({ id: "a", aa: { intelligenceIndex: 50 } }),
      mkModel({ id: "b", aa: { intelligenceIndex: 90 } }),
      mkModel({ id: "c", aa: { intelligenceIndex: 70 } }),
      mkModel({ id: "d", aa: null }),
    ];
    store.items.value = list;
    store.sortDir.value = "desc";
    const shown = store.getDisplayed();
    expect(shown.map((m) => m.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("price 维度默认升序（低 = 优）", async () => {
    store.activeView.value = "aa";
    await store.setDim("price");
    const list = [
      mkModel({ id: "a", aa: { priceOutputPer1M: 20 } }),
      mkModel({ id: "b", aa: { priceOutputPer1M: 5 } }),
      mkModel({ id: "c", aa: { priceOutputPer1M: 12 } }),
    ];
    store.items.value = list;
    const shown = store.getDisplayed();
    expect(shown.map((m) => m.id)).toEqual(["b", "c", "a"]);
  });
});

describe("filtering — vendor / 搜索", () => {
  const list = [
    mkModel({ id: "gpt", name: "GPT-4o", vendor: "openai", arena: { text: { score: 1100 } } }),
    mkModel({ id: "claude", name: "Claude 3.5", vendor: "anthropic", arena: { text: { score: 1300 } } }),
    mkModel({ id: "gemini", name: "Gemini 1.5", vendor: "google", arena: { text: { score: 1000 } } }),
    mkModel({ id: "gpt2", name: "GPT-4 Turbo", vendor: "openai", arena: { text: { score: 900 } } }),
  ];

  it("filterByVendor 仅保留指定厂商", () => {
    const out = store.filterByVendor(list, "openai");
    expect(out.length).toBe(2);
    expect(out.every((m) => m.vendor === "openai")).toBe(true);
  });

  it("filterByVendor('all') 不过滤", () => {
    expect(store.filterByVendor(list, "all").length).toBe(list.length);
  });

  it("filterBySearch 按模型名匹配（不区分大小写）", () => {
    expect(store.filterBySearch(list, "claude").map((m) => m.id)).toEqual(["claude"]);
    expect(store.filterBySearch(list, "GPT").length).toBe(2);
  });

  it("filterBySearch 空查询返回原列表", () => {
    expect(store.filterBySearch(list, "   ").length).toBe(list.length);
  });
});

describe("Arena 视角过滤 — 仅保留有 ELO 的模型", () => {
  it("getDisplayed 在 Arena 视角下过滤无分数模型", () => {
    store.activeView.value = "arena";
    store.activeBoard.value = "text";
    store.items.value = [
      mkModel({ id: "has-elo", arena: { text: { score: 1200 } } }),
      mkModel({ id: "no-elo", aa: { intelligenceIndex: 80 } }),
      mkModel({ id: "wrong-board", arena: { vision: { score: 1100 } } }),
    ];
    const shown = store.getDisplayed();
    expect(shown.map((m) => m.id)).toEqual(["has-elo"]);
  });
});

describe("compare — 对比列表管理", () => {
  it("toggleCompare 添加/移除模型", () => {
    store.toggleCompare("a");
    expect(store.compareList.value).toEqual(["a"]);
    store.toggleCompare("b");
    expect(store.compareList.value).toEqual(["a", "b"]);
    store.toggleCompare("a");
    expect(store.compareList.value).toEqual(["b"]);
  });

  it("toggleCompare 最多 3 个", () => {
    store.toggleCompare("a");
    store.toggleCompare("b");
    store.toggleCompare("c");
    store.toggleCompare("d"); // 超出上限，忽略
    expect(store.compareList.value).toEqual(["a", "b", "c"]);
  });

  it("clearCompare 清空", () => {
    store.toggleCompare("a");
    store.toggleCompare("b");
    store.clearCompare();
    expect(store.compareList.value).toEqual([]);
  });
});

describe("sample 态", () => {
  it("hasSampleSource 对 sample 条目返回 true", () => {
    store.items.value = [mkModel({ id: "s1", isSample: true })];
    expect(store.hasSampleSource()).toBe(true);
    store.items.value = [mkModel({ id: "l1", isSample: false })];
    expect(store.hasSampleSource()).toBe(false);
  });

  it("isAllSample 仅当全部为 sample 时为 true", () => {
    store.items.value = [mkModel({ id: "s1", isSample: true }), mkModel({ id: "s2", isSample: true })];
    expect(store.isAllSample()).toBe(true);
    store.items.value = [mkModel({ id: "s1", isSample: true }), mkModel({ id: "l1", isSample: false })];
    expect(store.isAllSample()).toBe(false);
  });
});

describe("LeaderboardTable 渲染", () => {
  it("Arena 视角渲染 ELO 列 + 示例标记", () => {
    render(
      h(LeaderboardTable, {
        rows: [mkModel({ id: "s1", name: "Sample Model", isSample: true, arena: { text: { score: 1200 } } })],
        view: "arena",
        board: "text",
      }),
    );
    const el = screen.getByText("示例");
    expect(el).toBeTruthy();
    expect(screen.getByText("1200")).toBeTruthy();
  });

  it("AA 视角渲染智能指数列", () => {
    render(
      h(LeaderboardTable, {
        rows: [mkModel({ id: "a1", name: "Test Model", aa: { intelligenceIndex: 88.5 } })],
        view: "aa",
        dim: "intelligence",
      }),
    );
    expect(screen.getByText("88.5")).toBeTruthy();
  });
});
