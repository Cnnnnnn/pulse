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
import { ARENA_BOARDS, ARENA_BOARD_KEYS, toIpcParams } from "../../src/renderer/ai-leaderboard/types.js";
import { tableToMarkdown, detailToMarkdown } from "../../src/renderer/ai-leaderboard/exportMarkdown.js";
import { rowsToCsv } from "../../src/renderer/ai-leaderboard/exportCsv.js";
import { LeaderboardTable } from "../../src/renderer/ai-leaderboard/LeaderboardTable.jsx";
import { BoardHealthCard } from "../../src/renderer/ai-leaderboard/BoardHealthCard.jsx";

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
    // LeaderboardTable 同时渲染桌面表格 + 移动端卡片列表，文本节点会出现两次
    expect(screen.getAllByText("示例").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1200").length).toBeGreaterThan(0);
  });

  it("AA 视角渲染智能指数列", () => {
    render(
      h(LeaderboardTable, {
        rows: [mkModel({ id: "a1", name: "Test Model", aa: { intelligenceIndex: 88.5 } })],
        view: "aa",
        dim: "intelligence",
      }),
    );
    expect(screen.getAllByText("88.5").length).toBeGreaterThan(0);
  });
});

// ── P0 回归：BoardHealthCard 接线性（AiLeaderboardPage 现渲染 <BoardHealthCard total={count} />）──
describe("BoardHealthCard 渲染（P0 回归）", () => {
  it("total>0 且信号有值时渲染三源覆盖信息（证明读取 sourceCoverage/sources 信号）", () => {
    store.sources.value = { arena: "live", aa: "sample", openrouter: "live", livebench: "live", modelsdev: "live" };
    store.sourceCoverage.value = { arena: 5, aa: 2, openrouter: 5, livebench: 3, modelsdev: 5 };
    render(h(BoardHealthCard, { total: 5 }));
    const el = document.querySelector(".ai-lb-health");
    expect(el).toBeTruthy();
    // 五源 chip 全部渲染 (Arena + AA + OpenRouter + LiveBench + Models.dev)
    expect(el.querySelectorAll(".ai-lb-health__chip").length).toBe(5);
    // arena 为 live → 带 is-live（证明 sources 信号被读取且值正确）
    expect(el.querySelector(".ai-lb-health__chip--blue.is-live")).toBeTruthy();
    // aa 为 sample → 带 is-sample（证明 sources 信号被读取且值正确）
    expect(el.querySelector(".ai-lb-health__chip--purple.is-sample")).toBeTruthy();
    // modelsdev 为 live → 带 is-live（证明新源接入渲染管线）
    expect(el.querySelector(".ai-lb-health__chip--modelsdev.is-live")).toBeTruthy();
    // 解释文字出现（数据源覆盖说明）
    expect(el.querySelector(".ai-lb-health__note")).toBeTruthy();
  });

  it("total===0 时不渲染（return null，无空架子/断链）", () => {
    store.sources.value = { arena: "live", aa: "live", openrouter: "live", livebench: "live", modelsdev: "live" };
    store.sourceCoverage.value = { arena: 0, aa: 0, openrouter: 0, livebench: 0, modelsdev: 0 };
    const { container } = render(h(BoardHealthCard, { total: 0 }));
    expect(container.querySelector(".ai-lb-health")).toBeNull();
  });

  it("stale=true 时渲染「数据陈旧」chip", () => {
    store.sources.value = { arena: "live", aa: "live", openrouter: "live", livebench: "live", modelsdev: "live" };
    store.sourceCoverage.value = { arena: 1, aa: 1, openrouter: 1, livebench: 1, modelsdev: 1 };
    store.stale.value = true;
    store.isSample.value = false;
    // fetchedAt 设为 2 小时前, fmtRelative 会渲染「2 小时前」
    store.fetchedAt.value = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { container } = render(h(BoardHealthCard, { total: 1 }));
    const staleEl = container.querySelector(".ai-lb-health__stale");
    expect(staleEl).toBeTruthy();
    expect(staleEl.textContent).toContain("数据陈旧");
    expect(staleEl.textContent).toContain("2 小时前");
  });

  it("stale=false 时不渲染 stale chip", () => {
    store.sources.value = { arena: "live", aa: "live", openrouter: "live", livebench: "live", modelsdev: "live" };
    store.sourceCoverage.value = { arena: 1, aa: 1, openrouter: 1, livebench: 1, modelsdev: 1 };
    store.stale.value = false;
    store.isSample.value = false;
    store.fetchedAt.value = new Date().toISOString();
    const { container } = render(h(BoardHealthCard, { total: 1 }));
    expect(container.querySelector(".ai-lb-health__stale")).toBeNull();
  });
});

// ── P1 回归：图像/视频分榜（复用 Arena 已抓取数据，零 AA 成本）────────
describe("P1 图像/视频分榜（Arena 视角）", () => {
  it("ARENA_BOARDS 含 image/video，key 为 Arena board 名（text-to-image / video）", () => {
    expect(ARENA_BOARDS.image).toEqual({ key: "text-to-image", label: "图像生成", category: "image" });
    expect(ARENA_BOARDS.video).toEqual({ key: "text-to-video", label: "视频", category: "video" });
    expect(ARENA_BOARD_KEYS).toContain("image");
    expect(ARENA_BOARD_KEYS).toContain("video");
    // 索引仍含原三 board，顺序在前（不改变现有默认）
    expect(ARENA_BOARD_KEYS.indexOf("text")).toBe(0);
    expect(ARENA_BOARD_KEYS.indexOf("image")).toBeGreaterThan(ARENA_BOARD_KEYS.indexOf("code"));
  });

  it("toIpcParams('arena','image') 映射为 {category:'image', dimension:'elo'}，交给主进程按 board 检索", () => {
    expect(toIpcParams("arena", "image")).toEqual({ category: "image", dimension: "elo" });
    expect(toIpcParams("arena", "video")).toEqual({ category: "video", dimension: "elo" });
  });

  it("Arena 视角按 board.key 过滤：image board 仅保留 text-to-image 切片模型", () => {
    store.activeView.value = "arena";
    store.activeBoard.value = "image";
    store.items.value = [
      mkModel({ id: "img", name: "Midjourney v6", arena: { "text-to-image": { score: 1150 } } }),
      mkModel({ id: "txt", name: "GPT-4o", arena: { text: { score: 1400 } } }),
      mkModel({ id: "vid", name: "Runway Gen-3", arena: { video: { score: 1080 } } }),
    ];
    const shown = store.getDisplayed();
    expect(shown.map((m) => m.id)).toEqual(["img"]);
  });

  it("video board 过滤仅保留 video 切片模型", () => {
    store.activeView.value = "arena";
    store.activeBoard.value = "video";
    store.items.value = [
      mkModel({ id: "img", arena: { "text-to-image": { score: 1150 } } }),
      mkModel({ id: "vid", arena: { "text-to-video": { score: 1080 } } }),
    ];
    const shown = store.getDisplayed();
    expect(shown.map((m) => m.id)).toEqual(["vid"]);
  });

  it("setBoard('image') 合法且触发请求（image 已进入白名单）", async () => {
    store.activeBoard.value = "text";
    const p = store.setBoard("image");
    expect(store.activeBoard.value).toBe("image");
    expect(p).toBeDefined(); // 返回 _run promise
  });
});

// ── P1 回归：exportMarkdown image/video 修正（直接断言 board 键正确，ELO 不再显示 «—»）──
describe("P1 文本导出（exportMarkdown）image/video 修正", () => {
  it("tableToMarkdown image board 用 ARENA_BOARDS['image'].key='text-to-image' 取数，ELO 正确显示", () => {
    const rows = [
      mkModel({ id: "img", name: "Midjourney v6", license: "proprietary", arena: { "text-to-image": { score: 1150, ci: 8, votes: 50 } } }),
    ];
    const md = tableToMarkdown({ rows, view: "arena", board: "image" });
    expect(md).toContain("| Midjourney v6 |");
    expect(md).toContain("| 1150 |"); // 正确取 text-to-image 切片分数
    expect(md).not.toContain("—"); // 不再是空列（修复前的 bug）
  });

  it("tableToMarkdown video board 同理，用 board 键 'video' 取数", () => {
    const rows = [
      mkModel({ id: "vid", name: "Runway Gen-3", license: "proprietary", arena: { "text-to-video": { score: 1080, ci: 10, votes: 30 } } }),
    ];
    const md = tableToMarkdown({ rows, view: "arena", board: "video" });
    expect(md).toContain("| Runway Gen-3 |");
    expect(md).toContain("| 1080 |");
    expect(md).not.toContain("—");
  });

  it("导出 text board 行为不被破坏（仍用 key 'text'）", () => {
    const rows = [
      mkModel({ id: "txt", name: "GPT-4o", license: "proprietary", arena: { text: { score: 1400, ci: 5, votes: 100 } } }),
    ];
    const md = tableToMarkdown({ rows, view: "arena", board: "text" });
    expect(md).toContain("| 1400 |");
    expect(md).not.toContain("—");
  });
});

// ── CSV 导出（exportCsv）：BOM + 字段转义 + 列顺序 ─────────────────
describe("exportCsv: rowsToCsv", () => {
  it("空 rows 返 header + BOM", () => {
    const out = rowsToCsv({
      rows: [],
      columns: [{ key: "name", header: "名称" }],
    });
    // UTF-8 BOM 是 0xfeff
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toContain("名称");
  });

  it("普通行 → 逗号分隔，行尾 CRLF", () => {
    const out = rowsToCsv({
      rows: [{ a: "x", b: 1 }, { a: "y", b: 2 }],
      columns: [{ key: "a", header: "A" }, { key: "b", header: "B" }],
    });
    expect(out).toMatch(/A,B/);
    expect(out).toMatch(/x,1/);
    expect(out).toMatch(/y,2/);
    // 末尾有 \r\n
    expect(out.endsWith("\r\n")).toBe(true);
  });

  it("含 , 或 \" 的字段 → 自动转义", () => {
    const out = rowsToCsv({
      rows: [{ name: 'hello, "world"', q: 'a"b' }],
      columns: [{ key: "name", header: "名" }, { key: "q", header: "Q" }],
    });
    expect(out).toContain(`"hello, ""world"""`);
    expect(out).toContain(`"a""b"`);
  });

  it("含换行的字段 → 自动转义", () => {
    const out = rowsToCsv({
      rows: [{ desc: "line1\nline2" }],
      columns: [{ key: "desc", header: "描述" }],
    });
    expect(out).toContain(`"line1\nline2"`);
  });

  it("null/undefined → 空串", () => {
    const out = rowsToCsv({
      rows: [{ x: null, y: undefined }],
      columns: [{ key: "x", header: "X" }, { key: "y", header: "Y" }],
    });
    expect(out).toMatch(/X,Y/);
    // 第 2 段（header 之后第一行）应是一对空串
    expect(out.split("\r\n")[1]).toBe(",");
  });

  it("中文 header 不被改写", () => {
    const out = rowsToCsv({
      rows: [{ a: "中" }],
      columns: [{ key: "a", header: "中文" }],
    });
    expect(out).toContain("中文");
    expect(out).toContain("中");
  });

  it("列顺序与 columns 数组一致", () => {
    const out = rowsToCsv({
      rows: [{ z: 1, a: 2, m: 3 }],
      columns: [
        { key: "m", header: "M" },
        { key: "z", header: "Z" },
        { key: "a", header: "A" },
      ],
    });
    // header 顺序 M,Z,A
    expect(out).toMatch(/M,Z,A/);
    // 数据顺序对应列：m=3, z=1, a=2
    expect(out).toMatch(/3,1,2/);
  });
});

describe("exportMarkdown: detailToMarkdown", () => {
  it("包含 id/名称/厂商和五个 slice 标题", () => {
    const out = detailToMarkdown({
      id: "test-1",
      name: "Test",
      vendor: "openai",
      category: "llm",
      arena: { text: { score: 1500 } },
      aa: null,
      openrouter: {},
      livebench: {},
      modelsdev: {},
    });
    expect(out).toContain("# Test");
    expect(out).toContain("`test-1`");
    expect(out).toContain("- 厂商: OpenAI");
    expect(out).toContain("## arena");
    expect(out).toContain("## aa");
    expect(out).toContain("## openrouter");
    expect(out).toContain("## livebench");
    expect(out).toContain("## modelsdev");
  });

  it("null slice 返回无数据占位", () => {
    const out = detailToMarkdown({
      id: "x",
      name: "X",
      vendor: "openai",
      arena: null,
      aa: null,
      openrouter: null,
      livebench: null,
      modelsdev: null,
    });
    expect(out).toContain("_无数据_");
  });
});
