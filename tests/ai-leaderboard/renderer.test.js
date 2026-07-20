/**
 * tests/ai-leaderboard/renderer.test.js
 *
 * AI 榜单渲染层测试（vitest + preact / happy-dom）。
 * 覆盖：store actions（setCategory / setDimension 改变排序字段）、
 *       本地筛选（vendor / 搜索）、本地排序（elo / intelligence_index 降序）、
 *       sample 态（isSample 时显示「示例」徽标 / 标记）。
 *
 * 纯本地：api.js 用 mock 注入，无网络出口。仅 import 真实 store / 组件。
 * 组件渲染用 preact 的 h()（.js 文件不启用 JSX 解析）。
 */

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { h } from "preact";
import { render, screen, cleanup } from "@testing-library/preact";

// store 通过 `import { api } from "../api.js"` 取 bridge —— 这里注入 mock，避免真实 IPC。
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
import { SampleBadge } from "../../src/renderer/ai-leaderboard/SampleBadge.jsx";
import { LeaderboardTable } from "../../src/renderer/ai-leaderboard/LeaderboardTable.jsx";

afterEach(cleanup);

/** 构造一个规整 AiModel（缺字段补默认，不依赖 main 侧 normalize）。 */
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
  };
}

beforeEach(() => {
  localStorage.clear();
  store.activeCategory.value = "llm";
  store.activeDimension.value = "elo";
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
});

describe("store actions — 排序字段随维度/分类切换", () => {
  it("setCategory 切换激活分类，并把 elo 提取字段切到对应 Arena board", async () => {
    const model = mkModel({
      name: "M",
      arena: { text: { score: 1000 }, vision: { score: 1500 } },
    });
    // llm 默认读 text board
    expect(store.sortValue(model, "elo", store.activeCategory.value)).toBe(1000);

    await store.setCategory("multimodal");
    expect(store.activeCategory.value).toBe("multimodal");
    // 切换后 elo 改读 vision board
    expect(store.sortValue(model, "elo", store.activeCategory.value)).toBe(1500);
  });

  it("setDimension 切换激活维度并改变提取字段（elo→intelligence→coding）", async () => {
    const model = mkModel({
      name: "M",
      arena: { text: { score: 1000 } },
      aa: { intelligenceIndex: 88, codingIndex: 70, mathIndex: 60 },
    });

    await store.setDimension("elo");
    expect(store.activeDimension.value).toBe("elo");
    expect(store.sortValue(model, store.activeDimension.value, "llm")).toBe(1000);

    await store.setDimension("intelligence");
    expect(store.activeDimension.value).toBe("intelligence");
    expect(store.sortValue(model, store.activeDimension.value, "llm")).toBe(88);

    await store.setDimension("coding");
    expect(store.sortValue(model, store.activeDimension.value, "llm")).toBe(70);
  });

  it("setDimension 非法值被忽略，保持原维度", async () => {
    await store.setDimension("nope");
    expect(store.activeDimension.value).toBe("elo");
  });

  it("setVendor / setSortDir 为纯本地派生，不触发重新请求（activeDimension 不变）", () => {
    store.setVendor("openai");
    expect(store.activeVendor.value).toBe("openai");
    store.setSortDir("asc");
    expect(store.sortDir.value).toBe("asc");
    expect(store.activeDimension.value).toBe("elo");
  });
});

describe("filtering — vendor / 搜索", () => {
  const list = [
    mkModel({ id: "gpt", name: "GPT-4o", vendor: "openai" }),
    mkModel({ id: "claude", name: "Claude 3.5", vendor: "anthropic" }),
    mkModel({ id: "gemini", name: "Gemini 1.5", vendor: "google" }),
    mkModel({ id: "gpt2", name: "GPT-4 Turbo", vendor: "openai" }),
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

  it("filterBySearch 按厂商 label 匹配（'openai'→OpenAI）", () => {
    const out = store.filterBySearch(list, "openai");
    expect(out.length).toBe(2);
    expect(out.every((m) => m.vendor === "openai")).toBe(true);
  });

  it("filterBySearch 空查询返回原列表", () => {
    expect(store.filterBySearch(list, "   ").length).toBe(list.length);
  });
});

describe("sorting — elo / intelligence_index 降序", () => {
  it("elo 降序：arena score 高→低，null 恒置末尾", () => {
    const list = [
      mkModel({ id: "a", arena: { text: { score: 800 } } }),
      mkModel({ id: "b", arena: { text: { score: 1200 } } }),
      mkModel({ id: "c", arena: {} }), // 无 elo
      mkModel({ id: "d", arena: { text: { score: 1000 } } }),
    ];
    const out = store.sortModels(list, { dimension: "elo", category: "llm", dir: "desc" });
    expect(out.map((m) => m.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("intelligence_index 降序：aa.intelligenceIndex 高→低", () => {
    const list = [
      mkModel({ id: "a", aa: { intelligenceIndex: 50 } }),
      mkModel({ id: "b", aa: { intelligenceIndex: 90 } }),
      mkModel({ id: "c", aa: { intelligenceIndex: 70 } }),
      mkModel({ id: "d", aa: null }), // 无 index
    ];
    const out = store.sortModels(list, { dimension: "intelligence", category: "llm", dir: "desc" });
    expect(out.map((m) => m.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("asc 方向反转 elo 顺序", () => {
    const list = [
      mkModel({ id: "a", arena: { text: { score: 800 } } }),
      mkModel({ id: "b", arena: { text: { score: 1200 } } }),
    ];
    const out = store.sortModels(list, { dimension: "elo", category: "llm", dir: "asc" });
    expect(out.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("getDisplayed 组合 vendor + search + sort", () => {
    const list = [
      mkModel({ id: "gpt", name: "GPT-4o", vendor: "openai", arena: { text: { score: 1100 } } }),
      mkModel({ id: "claude", name: "Claude", vendor: "anthropic", arena: { text: { score: 1300 } } }),
      mkModel({ id: "gpt2", name: "GPT-4 Turbo", vendor: "openai", arena: { text: { score: 900 } } }),
    ];
    store.items.value = list;
    store.activeVendor.value = "openai";
    store.searchQuery.value = "gpt";
    const shown = store.getDisplayed();
    expect(shown.map((m) => m.id)).toEqual(["gpt", "gpt2"]); // 仅 openai + 含 gpt，按 elo 降序
  });
});

describe("sample 态 — 示例徽标 / 标记", () => {
  it("SampleBadge 组件渲染「示例」文案并带 sample 语义类", () => {
    render(h(SampleBadge, {}));
    const el = screen.getByText("示例");
    expect(el).toBeTruthy();
    expect(el.className).toContain("ai-lb-sample-badge");
  });

  it("isSample 模型经表格渲染，行内显示「示例」标记（ai-lb-tag--sample）", () => {
    render(
      h(LeaderboardTable, {
        rows: [mkModel({ id: "s1", name: "Sample Model", isSample: true, aa: { intelligenceIndex: 42 } })],
        dimension: "intelligence",
      }),
    );
    const el = screen.getByText("示例");
    expect(el).toBeTruthy();
    expect(el.className).toContain("ai-lb-tag--sample");
  });

  it("hasSampleSource 对 sample 条目返回 true，对 live 返回 false", () => {
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
    store.items.value = [];
    expect(store.isAllSample()).toBe(false);
  });
});
