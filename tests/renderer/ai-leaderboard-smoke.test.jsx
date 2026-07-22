// @vitest-environment happy-dom
/**
 * AI 榜单重设计（P0+P1）渲染/逻辑冒烟测试。
 * 覆盖：三视角表格渲染、奖牌、内联条形、可点选排序头、示例行色条 class、
 * 以及 store 的 columnValue / toggleSort / sortModels 逻辑。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";
import { LeaderboardTable } from "../../src/renderer/ai-leaderboard/LeaderboardTable.jsx";
import { TopPodium } from "../../src/renderer/ai-leaderboard/TopPodium.jsx";
import { ArenaBubbleChart } from "../../src/renderer/ai-leaderboard/ArenaBubbleChart.jsx";
import { CrossSourceRadar } from "../../src/renderer/ai-leaderboard/CrossSourceRadar.jsx";
import { normalizeBoardResult, normalizeAiModel } from "../../src/renderer/ai-leaderboard/types.js";
import { crossSourceProfile, normalizeToUnit, ELO_MIN, ELO_MAX, fmtContext, aggregateVendorProfiles, topVendorsByArena, fmtRelative } from "../../src/renderer/ai-leaderboard/format.js";
import {
  columnValue,
  toggleSort,
  sortModels,
  filterByLicense,
  toggleHealthSource,
  resetHealthSources,
  hiddenHealthSources,
  sortKey,
  sortDir,
  activeView,
  activeBoard,
  activeDim,
  activeLB,
  items,
  sources,
  attribution,
  sourceCoverage,
  loading,
  error,
  fetchedAt,
  sourceDate,
  stale,
  fromCache,
  isSample,
  searchQuery,
  licenseFilter,
} from "../../src/renderer/ai-leaderboard/aiLeaderboardStore.js";
import { AiLeaderboardPage } from "../../src/renderer/ai-leaderboard/AiLeaderboardPage.jsx";

const aaModels = [
  {
    id: "a",
    name: "Alpha",
    vendor: "oa",
    isSample: false,
    aa: {
      intelligenceIndex: 80,
      codingIndex: 70,
      agenticIndex: 60,
      outputTokensPerSec: 120,
      priceOutputPer1M: 2,
    },
    modelsdev: { contextLength: 128000, inputCostPer1M: 5 },
  },
  {
    id: "b",
    name: "Beta",
    vendor: "oa",
    isSample: true,
    aa: {
      intelligenceIndex: 40,
      codingIndex: 30,
      agenticIndex: 20,
      outputTokensPerSec: 50,
      priceOutputPer1M: 8,
    },
    // b 缺 modelsdev 切片 → context / inputPrice 列显示 "—"
  },
];

const arenaModels = [
  {
    id: "a",
    name: "Alpha",
    vendor: "oa",
    isSample: false,
    arena: {
      text: { score: 1300, ci: 12, votes: 5000 },
      vision: { score: 1250, ci: 15, votes: 2100 },
      code: { score: 1280, ci: 10, votes: 3400 },
    },
    modelsdev: { contextLength: 200000 },
    rankSeries: [
      { date: "2026-07-10", rank: 5 },
      { date: "2026-07-11", rank: 4 },
      { date: "2026-07-12", rank: 3 },
    ],
  },
  { id: "b", name: "Beta", vendor: "oa", isSample: true, arena: { text: { score: 1100, ci: 20, votes: 3000 } } },
];

const lbModels = [
  {
    id: "a",
    name: "Alpha",
    vendor: "oa",
    isSample: false,
    livebench: {
      overall: 50,
      byCategory: { Coding: 55, Language: 48, IF: 44 },
      cost: { perSuccessfulTask: 0.5 },
    },
  },
  {
    id: "b",
    name: "Beta",
    vendor: "oa",
    isSample: true,
    livebench: {
      overall: 40,
      byCategory: { Coding: 45, Language: 38, IF: 34 },
      cost: { perSuccessfulTask: 1.2 },
    },
  },
];

// 跨源雷达：Alpha(oa) 三源齐全；Gamma(g) 缺 livebench（部分轴，应进入 is-partial）
const crossSourceModels = [
  {
    id: "a",
    name: "Alpha",
    vendor: "oa",
    arena: { text: { score: 1600, ci: 10, votes: 9000 }, vision: { score: 1550, ci: 12, votes: 3000 } },
    aa: { intelligenceIndex: 78, codingIndex: 70, agenticIndex: 60, outputTokensPerSec: 120, priceOutputPer1M: 2 },
    livebench: { overall: 65, byCategory: { Coding: 70, Language: 60, IF: 55 }, cost: { perSuccessfulTask: 0.5 } },
  },
  {
    id: "g",
    name: "Gamma",
    vendor: "g",
    arena: { text: { score: 1400, ci: 15, votes: 6000 } },
    aa: { intelligenceIndex: 50, codingIndex: 40, agenticIndex: 30, outputTokensPerSec: 60, priceOutputPer1M: 5 },
    // 缺 livebench 切片
  },
];

describe("LeaderboardTable 渲染", () => {
  afterEach(() => cleanup());

  it("AA 视角：奖牌 + 内联条形 + 8 个可排序列头（含 context + inputPrice）+ 示例行", () => {
    const { container } = render(<LeaderboardTable rows={aaModels} view="aa" />);
    const table = container.querySelector(".ai-lb-table");
    expect(table.querySelectorAll(".ai-lb-medal.g1").length).toBe(1);
    expect(table.querySelectorAll(".ai-lb-bar").length).toBeGreaterThan(0);
    // 6 AA 维度 + context + inputPrice = 8 个可排序头
    expect(table.querySelectorAll(".ai-lb-th--sortable").length).toBe(8);
    expect(table.querySelectorAll('[data-sort="context"]').length).toBe(1);
    expect(table.querySelectorAll('[data-sort="inputPrice"]').length).toBe(1);
    expect(table.querySelectorAll(".ai-lb-row--sample").length).toBe(1);
  });

  it("Arena / LiveBench 视角渲染无崩溃", () => {
    const r1 = render(<LeaderboardTable rows={arenaModels} view="arena" />);
    const t1 = r1.container.querySelector(".ai-lb-table");
    expect(t1.querySelectorAll(".ai-lb-medal").length).toBe(2);
    // ELO + 置信区间 + 票数 + context = 4 个可排序列头
    expect(t1.querySelectorAll(".ai-lb-th--sortable").length).toBe(4);
    expect(t1.querySelectorAll('[data-sort="votes"]').length).toBe(1);
    expect(t1.querySelectorAll('[data-sort="context"]').length).toBe(1);
    // 跨 board 迷你条（模型 a 多 board）+ 排名趋势 sparkline（模型 a 有 rankSeries）
    expect(t1.querySelectorAll(".ai-lb-boardbars").length).toBeGreaterThan(0);
    expect(t1.querySelectorAll(".ai-lb-spark").length).toBeGreaterThan(0);
    // 跨 board 条至少渲染一个 board 行（文本/多模态/代码）
    expect(t1.querySelectorAll(".ai-lb-boardbars__row").length).toBeGreaterThan(0);

    const r2 = render(<LeaderboardTable rows={lbModels} view="livebench" />);
    const t2 = r2.container.querySelector(".ai-lb-table");
    expect(t2.querySelectorAll(".ai-lb-th--sortable").length).toBe(5);
  });

  it("TopPodium 渲染前三名", () => {
    const { container } = render(<TopPodium rows={aaModels} view="aa" />);
    expect(container.querySelectorAll(".ai-lb-podium__card").length).toBe(2);
    expect(container.querySelectorAll(".ai-lb-medal").length).toBe(2);
  });

  it("ArenaBubbleChart：默认 text board 渲染气泡图与数据点", () => {
    const { container } = render(<ArenaBubbleChart items={arenaModels} board="text" />);
    expect(container.querySelectorAll(".ai-lb-bubble").length).toBe(1);
    // 文本榜两模型均有 score/votes/ci → 2 个气泡
    expect(container.querySelectorAll("circle").length).toBe(2);
    // 含坐标轴与强势区标记
    expect(container.querySelector(".ai-lb-bubble__axis")).toBeTruthy();
    expect(container.querySelector(".ai-lb-bubble__zone")).toBeTruthy();
  });

  it("ArenaBubbleChart：仅含部分 board 数据的模型会被过滤", () => {
    // vision board：仅 Alpha 有 vision 切片，Beta 仅 text → 只渲染 1 个气泡
    const { container } = render(<ArenaBubbleChart items={arenaModels} board="vision" />);
    expect(container.querySelectorAll("circle").length).toBe(1);
    // 无任何匹配数据时不渲染容器
    const empty = render(<ArenaBubbleChart items={lbModels} board="text" />);
    expect(empty.container.querySelector(".ai-lb-bubble")).toBeNull();
  });

  it("点选列头触发排序（sortKey 写入）", () => {
    const { container } = render(<LeaderboardTable rows={aaModels} view="aa" />);
    const th = container.querySelector(".ai-lb-th--sortable");
    fireEvent.click(th);
    expect(sortKey.value).toBe("intelligence");
  });

  it("CrossSourceRadar：厂商聚合后完整厂商绘多边形，部分轴厂商进入 is-partial", () => {
    // 与线上一致：先用 aggregateVendorProfiles 聚合成厂商 profile，再传入雷达
    const vendorMap = aggregateVendorProfiles(crossSourceModels);
    const profiles = [...vendorMap.entries()].map(([vendor, p]) => ({ vendor, ...p }));
    const { container } = render(<CrossSourceRadar profiles={profiles} />);
    expect(container.querySelectorAll(".ai-lb-radar").length).toBe(1);
    // 两厂商 → ≥2 个模型多边形 path + 4 个网格环
    const paths = container.querySelectorAll(".ai-lb-radar__svg path");
    expect(paths.length).toBeGreaterThan(4);
    // 三轴标签齐备
    expect(container.querySelector(".ai-lb-radar__axis")).toBeTruthy();
    // Gamma 缺 LiveBench → 图例标记为部分轴，并提示缺失源
    expect(container.querySelector(".ai-lb-radar__legend-item.is-partial")).toBeTruthy();
    expect(container.textContent).toContain("缺 LiveBench");
  });

  it("CrossSourceRadar：无任何 profile 时渲染空状态", () => {
    const { container } = render(<CrossSourceRadar profiles={[]} />);
    expect(container.querySelector(".ai-lb-radar--empty")).toBeTruthy();
  });
});

describe("store 排序逻辑", () => {
  beforeEach(() => {
    sortKey.value = null;
    sortDir.value = "desc";
    activeView.value = "aa";
    activeBoard.value = "text";
  });

  it("columnValue 覆盖所有可排序列（含 valueRatio + context + inputPrice）", () => {
    expect(columnValue(aaModels[0], "aa", "intelligence")).toBe(80);
    expect(columnValue(aaModels[0], "aa", "valueRatio")).toBeCloseTo(40);
    expect(columnValue(aaModels[0], "aa", "context")).toBe(128000);
    expect(columnValue(aaModels[0], "aa", "inputPrice")).toBe(5);
    expect(columnValue(aaModels[1], "aa", "context")).toBeNull();
    expect(columnValue(aaModels[1], "aa", "inputPrice")).toBeNull();
    expect(columnValue(arenaModels[0], "arena", "elo")).toBe(1300);
    expect(columnValue(arenaModels[0], "arena", "ci")).toBe(12);
    expect(columnValue(arenaModels[0], "arena", "votes")).toBe(5000);
    expect(columnValue(arenaModels[0], "arena", "context")).toBe(200000);
    expect(columnValue(arenaModels[1], "arena", "context")).toBeNull();
    expect(columnValue(lbModels[0], "livebench", "lb_overall")).toBe(50);
    expect(columnValue(lbModels[0], "livebench", "lb_coding")).toBe(55);
    expect(columnValue(lbModels[0], "livebench", "lb_cost")).toBe(0.5);
  });

  it("toggleSort：同列切换方向，新列按 better 给默认序", () => {
    toggleSort("price"); // 低优 → 默认 asc
    expect(sortKey.value).toBe("price");
    expect(sortDir.value).toBe("asc");

    toggleSort("price"); // 再点同列 → 切到 desc
    expect(sortDir.value).toBe("desc");

    toggleSort("intelligence"); // 高优 → 默认 desc
    expect(sortKey.value).toBe("intelligence");
    expect(sortDir.value).toBe("desc");
  });

  it("sortModels 按当前 sortKey 排序（降序）", () => {
    sortKey.value = "intelligence";
    sortDir.value = "desc";
    const sorted = sortModels(aaModels.slice());
    expect(sorted[0].id).toBe("a");
    expect(sorted[1].id).toBe("b");
  });

  it("filterByLicense：按 open/proprietary 过滤，unknown 不计入任一", () => {
    const list = [
      { id: "a", name: "A", license: "open" },
      { id: "b", name: "B", license: "proprietary" },
      { id: "c", name: "C", license: "Apache 2.0" },
      { id: "d", name: "D", license: null },
    ];
    expect(filterByLicense(list, "all").length).toBe(4);
    expect(filterByLicense(list, "open").map((x) => x.id).sort()).toEqual(["a", "c"]);
    expect(filterByLicense(list, "proprietary").map((x) => x.id)).toEqual(["b"]);
  });
});

describe("健康卡 source chip 会话级隐藏", () => {
  beforeEach(() => {
    resetHealthSources();
  });
  afterEach(() => {
    resetHealthSources();
  });

  it("toggleHealthSource 加/移", () => {
    expect(hiddenHealthSources.value.size).toBe(0);
    toggleHealthSource("livebench");
    expect(hiddenHealthSources.value.has("livebench")).toBe(true);
    expect(hiddenHealthSources.value.size).toBe(1);
    toggleHealthSource("livebench");
    expect(hiddenHealthSources.value.has("livebench")).toBe(false);
    expect(hiddenHealthSources.value.size).toBe(0);
  });

  it("toggleHealthSource 多源并存独立", () => {
    toggleHealthSource("livebench");
    toggleHealthSource("openrouter");
    expect(hiddenHealthSources.value.size).toBe(2);
    expect(hiddenHealthSources.value.has("livebench")).toBe(true);
    expect(hiddenHealthSources.value.has("openrouter")).toBe(true);
    toggleHealthSource("livebench");
    expect(hiddenHealthSources.value.size).toBe(1);
    expect(hiddenHealthSources.value.has("openrouter")).toBe(true);
  });

  it("resetHealthSources 清空全部隐藏", () => {
    toggleHealthSource("aa");
    toggleHealthSource("arena");
    toggleHealthSource("modelsdev");
    expect(hiddenHealthSources.value.size).toBe(3);
    resetHealthSources();
    expect(hiddenHealthSources.value.size).toBe(0);
  });
});

describe("数据透传（A/B）：lastUpdated 与 rankSeries", () => {
  it("normalizeBoardResult 透传 lastUpdated", () => {
    const r = normalizeBoardResult({ ok: true, items: [], lastUpdated: "Jul 16, 2026" });
    expect(r.lastUpdated).toBe("Jul 16, 2026");
  });

  it("normalizeAiModel 透传 rankSeries（缺失时为 null）", () => {
    const withSeries = normalizeAiModel({
      id: "a",
      name: "Alpha",
      arena: { text: { score: 1 } },
      rankSeries: [{ date: "2026-07-12", rank: 3 }],
    });
    expect(Array.isArray(withSeries.rankSeries)).toBe(true);
    const without = normalizeAiModel({ id: "b", name: "Beta" });
    expect(without.rankSeries).toBeNull();
  });
});

describe("跨源雷达纯函数（E）：crossSourceProfile / normalizeToUnit", () => {
  it("crossSourceProfile 取三轴原始值（Arena 优先 text board）", () => {
    const p = crossSourceProfile(crossSourceModels[0]);
    expect(p.arena).toBe(1600);
    expect(p.aa).toBe(78);
    expect(p.livebench).toBe(65);
    // 缺 livebench → 该轴 null
    const miss = crossSourceProfile(crossSourceModels[1]);
    expect(miss.arena).toBe(1400);
    expect(miss.aa).toBe(50);
    expect(miss.livebench).toBeNull();
  });

  it("normalizeToUnit 绝对域归一并 clamp；非法值返回 null", () => {
    expect(normalizeToUnit(1600, ELO_MIN, ELO_MAX)).toBeCloseTo((1600 - ELO_MIN) / (ELO_MAX - ELO_MIN));
    // 越界 clamp
    expect(normalizeToUnit(2000, ELO_MIN, ELO_MAX)).toBe(1);
    expect(normalizeToUnit(900, ELO_MIN, ELO_MAX)).toBe(0);
    // 缺失 / NaN
    expect(normalizeToUnit(null, ELO_MIN, ELO_MAX)).toBeNull();
    expect(normalizeToUnit(NaN, ELO_MIN, ELO_MAX)).toBeNull();
  });
});

describe("跨源雷达（厂商聚合）：aggregateVendorProfiles / topVendorsByArena", () => {
  it("同厂商多模型取各源最佳切片；缺源该轴为 null", () => {
    const items = [
      { vendor: "oa", arena: { text: { score: 1500 } }, aa: { intelligenceIndex: 70 }, livebench: { overall: 60 } },
      { vendor: "oa", arena: { text: { score: 1600 }, vision: { score: 1580 } }, aa: { intelligenceIndex: 80 } }, // 无 livebench
      { vendor: "g", arena: { text: { score: 1400 } }, aa: { intelligenceIndex: 50 }, livebench: { overall: 40 } },
    ];
    const map = aggregateVendorProfiles(items);
    expect(map.size).toBe(2); // 两个厂商
    const oa = map.get("oa");
    expect(oa.arena).toBe(1600); // 取最高 ELO
    expect(oa.aa).toBe(80); // 取最高智能指数
    expect(oa.livebench).toBe(60); // 第一个模型有，第二个无 → 取 60
    const g = map.get("g");
    expect(g.arena).toBe(1400);
    expect(g.livebench).toBe(40);
  });

  it("topVendorsByArena 按 Arena ELO 取前 n 个", () => {
    const profiles = [
      { vendor: "g", arena: 1400, aa: 50, livebench: 40 },
      { vendor: "oa", arena: 1600, aa: 80, livebench: 60 },
      { vendor: "x", arena: null, aa: 30, livebench: 20 }, // 无 arena → 不参与排序
    ];
    const top = topVendorsByArena(profiles, 2);
    expect(top.map((p) => p.vendor)).toEqual(["oa", "g"]);
  });
});

describe("fmtContext 上下文窗口紧凑格式", () => {
  it("K / M 自适应", () => {
    expect(fmtContext(128000)).toBe("128K");
    expect(fmtContext(200000)).toBe("200K");
    expect(fmtContext(1050000)).toBe("1.1M");
    expect(fmtContext(10000000)).toBe("10M");
    expect(fmtContext(500)).toBe("500");
  });
  it("null/undefined/NaN 返 '—'", () => {
    expect(fmtContext(null)).toBe("—");
    expect(fmtContext(undefined)).toBe("—");
    expect(fmtContext(NaN)).toBe("—");
  });
});

describe("fmtRelative", () => {
  it("30 秒前显示「刚刚」", () => {
    const now = Date.now();
    expect(fmtRelative(now - 30 * 1000, now)).toBe("刚刚");
  });
  it("3 分钟前显示「3 分钟前」", () => {
    const now = Date.now();
    expect(fmtRelative(now - 3 * 60 * 1000, now)).toBe("3 分钟前");
  });
  it("2 小时前显示「2 小时前」", () => {
    const now = Date.now();
    expect(fmtRelative(now - 2 * 60 * 60 * 1000, now)).toBe("2 小时前");
  });
  it("3 天前显示「2026-07-19」", () => {
    const now = Date.UTC(2026, 6, 22);  // 2026-07-22
    expect(fmtRelative(now - 3 * 24 * 60 * 60 * 1000, now)).toBe("2026-07-19");
  });
  it("null / NaN / 未来时间 → 「—」", () => {
    expect(fmtRelative(null)).toBe("—");
    expect(fmtRelative(NaN)).toBe("—");
    expect(fmtRelative(Date.now() + 10000)).toBe("—");
  });
});

// ── 2026-07-22 P0：CSV 导出按钮 — 验证工具栏在 rows>0 时出现「导出 CSV」─────
describe("AiLeaderboardPage: 导出 CSV 按钮", () => {
  beforeEach(() => {
    // 复位 store 状态, 避免前面测试残留
    activeView.value = "arena";
    activeBoard.value = "text";
    activeDim.value = "intelligence";
    activeLB.value = "lb_overall";
    items.value = [];
    sources.value = {};
    attribution.value = [];
    sourceCoverage.value = { arena: 0, aa: 0, openrouter: 0, livebench: 0, modelsdev: 0 };
    loading.value = false;
    error.value = null;
    fetchedAt.value = null;
    sourceDate.value = null;
    stale.value = false;
    fromCache.value = false;
    isSample.value = false;
    searchQuery.value = "";
    licenseFilter.value = "all";
  });
  afterEach(cleanup);

  it("rows.length > 0 时显示「导出 CSV」按钮", () => {
    // 注：先种入一个能通过 Arena text 视角过滤的模型 (有 ELO score)
    items.value = [
      {
        id: "a",
        name: "Alpha",
        vendor: "openai",
        vendorRaw: null,
        category: "llm",
        license: null,
        arena: { text: { score: 1200, ci: 10, votes: 100 } },
        aa: null,
        openrouter: null,
        sources: { arena: "live", aa: "none", openrouter: "none" },
        isSample: false,
        fetchedAt: null,
      },
    ];
    sources.value = { arena: "live", aa: "none", openrouter: "none", livebench: "none", modelsdev: "none" };
    const { container } = render(<AiLeaderboardPage />);
    // 「复制表格」先存在 (不破坏既有布局)
    expect(container.textContent).toContain("复制表格");
    // 「导出 CSV」紧随其后
    expect(container.textContent).toContain("导出 CSV");
    // 工具栏里有两个 ai-lb-copy-btn (复制 + 导出)
    expect(container.querySelectorAll(".ai-lb-copy-btn").length).toBe(2);
  });

  it("rows.length === 0 时不显示「导出 CSV」按钮（避免空导出）", () => {
    items.value = [];
    const { container } = render(<AiLeaderboardPage />);
    expect(container.textContent).not.toContain("导出 CSV");
  });
});
