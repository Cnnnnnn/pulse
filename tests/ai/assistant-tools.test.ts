/**
 * tests/ai/assistant-tools.test.ts
 *
 * AI 助手工具实现测试 —— 覆盖 `executeMainTool` 的路由与各工具的组装逻辑。
 *
 * 分层原则：只 mock「外部数据源」与「下层计算」，被测模块自身的分支/文案/统计
 * 口径全部走真实实现（此前该文件只被 `vi.mock` 掉，39 个工具的实现从未被真正执行）。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/main/state-store.ts", () => ({
  load: vi.fn(() => null),
  defaultPath: vi.fn(() => "/tmp/pulse-tools-test/state.json"),
}));

vi.mock("../../src/main/funds/fund-store.ts", () => ({
  loadAll: vi.fn(() => ({ holdings: [] })),
}));

// fundCalc 属下层纯计算（另有其自身测试）—— 此处 mock 以聚焦 summarizeFunds 的组装
vi.mock("../../src/funds/fundCalc.ts", () => ({
  zipHoldingsWithNav: vi.fn(() => []),
  calcPortfolioTotal: vi.fn(() => ({
    countWithNav: 0,
    totalMarketValue: 0,
    totalCost: 0,
    totalProfit: 0,
    totalProfitPct: 0,
    todayProfit: 0,
  })),
  calcFundMetrics: vi.fn(() => null),
}));

vi.mock("../../src/main/digest/aggregate.ts", () => ({
  aggregate: vi.fn(() => ({})),
}));

vi.mock("../../src/ai-usage/derive.ts", () => ({
  pickPrimaryWindow: vi.fn(() => null),
}));

vi.mock("../../src/main/ai-leaderboard/index.ts", () => ({
  getLeaderboard: vi.fn(() => null),
}));

// 查询缓存若走真实实现会让「第二次调用」返回缓存文案 —— mock 掉以保证用例独立
vi.mock("../../src/ai/assistant-query-cache.ts", () => ({
  queryCacheKey: (t: string) => `k:${t}`,
  getQueryCache: vi.fn(() => null),
  setQueryCache: vi.fn(),
}));

vi.mock("../../src/main/reminders.ts", () => ({
  list: vi.fn(() => []),
}));

// 记忆模块涉及真实落盘 —— 默认全部返回「空」，避免测试污染用户数据
vi.mock("../../src/ai/assistant-memory.ts", () => ({
  addMemory: vi.fn(() => null),
  removeMemory: vi.fn(() => false),
  listMemory: vi.fn(() => []),
}));

// —— CJS require 迁移（17 处 → 顶层 ESM import）后新进入模块图的依赖：
//    metal-ipc 顶层 import electron（node 环境无运行时），股票链路涉及
//    chromium http，全部 mock 隔离副作用；metal-config 是纯数据表，用真实实现 ——
vi.mock("../../src/main/metal-ipc.ts", () => ({
  getTraySnapshot: vi.fn(() => ({})),
}));
vi.mock("../../src/main/metals/metal-repository.ts", () => ({
  load: vi.fn(() => ({ watchedIds: [] })),
  save: vi.fn(),
}));
vi.mock("../../src/main/chromium-http-client.ts", () => ({
  createStockHttpClient: vi.fn(() => ({})),
}));
vi.mock("../../src/stocks/stock-search.ts", () => ({
  searchStocks: vi.fn(async () => []),
}));
vi.mock("../../src/stocks/stock-detail-fetcher.ts", () => ({
  fetchStockDetailAngles: vi.fn(async () => null),
}));
vi.mock("../../src/stocks/diagnosis-scorer.ts", () => ({
  computeScores: vi.fn(() => ({})),
}));
vi.mock("../../src/ai/assistant-interpret-tools.ts", () => ({
  runInterpretFinance: vi.fn(() => null),
  runSummarizeIthome: vi.fn(() => null),
  runAdviseStocks: vi.fn(() => null),
  runQueryMovies: vi.fn(() => null),
  runQueryConcerts: vi.fn(() => null),
}));

import {
  executeMainTool,
  listMonitoredApps,
  splitActions,
  toolResultsToCards,
} from "../../src/ai/assistant-tools.ts";
import { MAIN_PROCESS_TOOLS } from "../../src/ai/assistant-prompt.ts";
import { NAV_REGISTRY } from "../../src/shared/nav-keys.ts";
import * as stateStore from "../../src/main/state-store.ts";
import * as fundStore from "../../src/main/funds/fund-store.ts";
import * as metalIpc from "../../src/main/metal-ipc.ts";
import * as metalRepo from "../../src/main/metals/metal-repository.ts";
import * as stockSearch from "../../src/stocks/stock-search.ts";
import * as stockDetailFetcher from "../../src/stocks/stock-detail-fetcher.ts";
import * as diagnosisScorer from "../../src/stocks/diagnosis-scorer.ts";
import * as interpretTools from "../../src/ai/assistant-interpret-tools.ts";
import * as reminders from "../../src/main/reminders.ts";
import * as memory from "../../src/ai/assistant-memory.ts";

const mockedLoad = vi.mocked(stateStore.load);
const mockedFundsLoad = vi.mocked(fundStore.loadAll);
const mockedGetTraySnapshot = vi.mocked(metalIpc.getTraySnapshot);
const mockedMetalRepoLoad = vi.mocked(metalRepo.load);
const mockedSearchStocks = vi.mocked(stockSearch.searchStocks);
const mockedFetchAngles = vi.mocked(stockDetailFetcher.fetchStockDetailAngles);
const mockedComputeScores = vi.mocked(diagnosisScorer.computeScores);
const mockedRemindersList = vi.mocked(reminders.list);
const mockedAddMemory = vi.mocked(memory.addMemory);
const mockedRemoveMemory = vi.mocked(memory.removeMemory);
const mockedListMemory = vi.mocked(memory.listMemory);

beforeEach(() => {
  mockedLoad.mockReset();
  mockedLoad.mockReturnValue(null as never);
  mockedFundsLoad.mockReset();
  mockedFundsLoad.mockReturnValue({ holdings: [] } as never);
  mockedGetTraySnapshot.mockReset();
  mockedGetTraySnapshot.mockReturnValue({} as never);
  mockedMetalRepoLoad.mockReset();
  mockedMetalRepoLoad.mockReturnValue({ watchedIds: [] } as never);
  mockedSearchStocks.mockReset();
  mockedSearchStocks.mockResolvedValue([] as never);
  mockedFetchAngles.mockReset();
  mockedFetchAngles.mockResolvedValue(null as never);
  mockedComputeScores.mockReset();
  mockedComputeScores.mockReturnValue({} as never);
  mockedRemindersList.mockReset();
  mockedRemindersList.mockReturnValue([] as never);
  mockedAddMemory.mockReset();
  mockedAddMemory.mockReturnValue(null as never);
  mockedRemoveMemory.mockReset();
  mockedRemoveMemory.mockReturnValue(false as never);
  mockedListMemory.mockReset();
  mockedListMemory.mockReturnValue([] as never);
  for (const fn of [
    interpretTools.runInterpretFinance,
    interpretTools.runSummarizeIthome,
    interpretTools.runAdviseStocks,
    interpretTools.runQueryMovies,
    interpretTools.runQueryConcerts,
  ]) {
    vi.mocked(fn).mockReset();
    vi.mocked(fn).mockReturnValue(null as never);
  }
});

describe("splitActions — 执行域分流", () => {
  it("按策略表执行域分流，未知工具归入 renderer", () => {
    const { main, renderer } = splitActions([
      { tool: "query_apps", params: {} },
      { tool: "pulse_open", params: { href: "pulse://nav/versions" } },
      { tool: "not_a_real_tool", params: {} },
    ]);

    expect(main.map((a) => a.tool)).toEqual(["query_apps"]);
    expect(renderer.map((a) => a.tool)).toEqual(["pulse_open", "not_a_real_tool"]);
  });

  it("空输入返回两个空数组", () => {
    expect(splitActions([])).toEqual({ main: [], renderer: [] });
  });
});

describe("executeMainTool — 路由边界", () => {
  it("非主进程工具返回 null（交给渲染层）", async () => {
    expect(await executeMainTool({ tool: "pulse_open", params: {} })).toBeNull();
    expect(await executeMainTool({ tool: "navigate", params: { nav: "home" } })).toBeNull();
  });

  it("未声明工具返回 null", async () => {
    expect(await executeMainTool({ tool: "not_a_real_tool", params: {} })).toBeNull();
  });

  it("主进程工具返回结果对象", async () => {
    const r = await executeMainTool({ tool: "list_nav", params: {} });
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(true);
    expect(r!.tool).toBe("list_nav");
  });
});

describe("list_nav", () => {
  it("覆盖全部导航登记项，且每项 action 为 navigate", async () => {
    const r = await executeMainTool({ tool: "list_nav", params: {} });
    expect(r!.items).toHaveLength(NAV_REGISTRY.length);
    for (const item of r!.items!) {
      expect(item.action?.tool).toBe("navigate");
      expect(typeof item.label).toBe("string");
    }
    expect(r!.summary).toContain(NAV_REGISTRY[0].label);
  });
});

describe("query_apps", () => {
  it("无监控应用时给出提示文案", async () => {
    mockedLoad.mockReturnValue({ apps: {} } as never);
    const r = await executeMainTool({ tool: "query_apps", params: {} });
    expect(r!.ok).toBe(true);
    expect(r!.summary).toContain("当前没有已监控的应用");
    expect(r!.items).toBeUndefined();
  });

  it("按状态归类计数（has_update / up_to_date / error / unknown）", async () => {
    mockedLoad.mockReturnValue({
      apps: {
        A: { status: "has_update", latest_version: "2.0" },
        B: { status: "up_to_date" },
        C: { status: "error" },
        D: {},
      },
    } as never);

    const r = await executeMainTool({ tool: "query_apps", params: {} });
    expect(r!.summary).toContain("共监控 4 个应用。");
    expect(r!.summary).toContain("有更新: 1");
    expect(r!.summary).toContain("已最新: 1");
    expect(r!.summary).toContain("检查失败: 1");
    expect(r!.summary).toContain("未知: 1");
  });

  it("items 只含有更新的应用，且 action 指向 upgrade_app", async () => {
    mockedLoad.mockReturnValue({
      apps: {
        HasUp: { status: "has_update", latest_version: "3.1" },
        Ok: { status: "up_to_date" },
      },
    } as never);

    const r = await executeMainTool({ tool: "query_apps", params: {} });
    expect(r!.items).toHaveLength(1);
    expect(r!.items![0].label).toBe("HasUp");
    expect(r!.items![0].meta).toContain("3.1");
    expect(r!.items![0].action).toEqual({
      tool: "upgrade_app",
      params: { appName: "HasUp" },
    });
  });

  it("has_update 可由布尔字段推断（无显式 status）", async () => {
    mockedLoad.mockReturnValue({
      apps: { Legacy: { has_update: true, remote_version: "9.9" } },
    } as never);
    const r = await executeMainTool({ tool: "query_apps", params: {} });
    expect(r!.summary).toContain("有更新: 1");
    expect(r!.items![0].meta).toContain("9.9");
  });
});

describe("query_funds", () => {
  it("无持仓时给出引导文案", async () => {
    mockedFundsLoad.mockReturnValue({ holdings: [] } as never);
    const r = await executeMainTool({ tool: "query_funds", params: {} });
    expect(r!.ok).toBe(true);
    expect(r!.summary).toContain("当前没有基金持仓");
  });

  it("有持仓时汇总只数并列出前若干只", async () => {
    mockedFundsLoad.mockReturnValue({
      holdings: [
        { code: "000001", name: "测试基金A" },
        { code: "000002", name: "测试基金B" },
      ],
    } as never);

    const r = await executeMainTool({ tool: "query_funds", params: {} });
    expect(r!.summary).toContain("共 2 只基金");
    expect(r!.items).toHaveLength(2);
    expect(r!.items![0].label).toContain("000001");
    expect(r!.items![0].action?.tool).toBe("open_search_result");
  });
});

describe("search", () => {
  it("搜索索引未初始化时返回失败结果", async () => {
    const r = await executeMainTool({ tool: "search", params: { q: "x" } });
    expect(r!.ok).toBe(false);
    expect(r!.summary).toContain("搜索索引未初始化");
  });
});

/**
 * 2026-09: 17 处动态 `require("./x")` 已全部迁移为顶层 ESM import（Phase 7 收尾），
 * 此前不可测的 12 个工具（金属 / 股票 / 提醒 / 记忆 / AI 解读类）现已全部有
 * 真实执行覆盖 —— 见下方各 describe。其中 "../../stocks/*" 两处路径深度写错
 * （应为 ../stocks）是迁移过程中顺带修复的 prod 缺陷：esbuild 解析失败保留
 * 运行时 require，query_stock_diagnosis 在 bundle 里必然 MODULE_NOT_FOUND。
 */

describe("工具可测性清单（防回归）", () => {
  it("策略表的主进程工具数保持 20", () => {
    // 39 = 20 main + 19 renderer
    expect(MAIN_PROCESS_TOOLS.size).toBe(20);
  });

  it("无副作用依赖的工具都能返回结果（非 null）", async () => {
    const testable = ["list_nav", "query_apps", "query_funds", "search"];
    for (const tool of testable) {
      const r = await executeMainTool({ tool, params: {} });
      expect(r, `工具 ${tool} 应返回结果而非 null`).not.toBeNull();
      expect(r!.tool).toBe(tool);
    }
  });
});

describe("query_metals", () => {
  it("无 watchedIds 时给出引导文案", async () => {
    const r = await executeMainTool({ tool: "query_metals", params: {} });
    expect(r!.ok).toBe(true);
    expect(r!.summary).toContain("暂无贵金属行情");
  });

  it("按 watchedIds 组装行情行与跳转卡片", async () => {
    mockedMetalRepoLoad.mockReturnValue({
      watchedIds: ["XAU", "XAG", "NOT_EXIST"],
    } as never);
    mockedGetTraySnapshot.mockReturnValue({
      fetchedAt: Date.UTC(2026, 8, 16, 8, 0, 0),
      quotes: {
        XAU: { price: 3350.5, changePct: 0.82 },
        XAG: { price: 38.2, changePct: -1.1 },
      },
    } as never);

    const r = await executeMainTool({ tool: "query_metals", params: {} });
    expect(r!.ok).toBe(true);
    expect(r!.summary).toContain("更新于");
    expect(r!.summary).toContain("黄金: 3350.5 oz (+0.82%)");
    expect(r!.summary).toContain("白银: 38.2 oz (-1.1%)");
    // 未知 id 被跳过，不产生空行
    expect(r!.summary).not.toContain("NOT_EXIST");
    expect(r!.items).toHaveLength(2);
    expect(r!.items![0].action).toEqual({
      tool: "navigate",
      params: { nav: "invest", tab: "metals" },
    });
  });

  it("有 watched 但无行情时仍列出名称（价格显示暂无行情）", async () => {
    mockedMetalRepoLoad.mockReturnValue({ watchedIds: ["XAU"] } as never);
    mockedGetTraySnapshot.mockReturnValue({ quotes: {} } as never);

    const r = await executeMainTool({ tool: "query_metals", params: {} });
    expect(r!.summary).toContain("黄金: 暂无行情");
    expect(r!.items).toHaveLength(1);
  });
});

describe("query_stocks", () => {
  it("缺少 q 时给出参数提示", async () => {
    const r = await executeMainTool({ tool: "query_stocks", params: {} });
    expect(r!.ok).toBe(false);
    expect(r!.summary).toContain("请提供股票名称或代码");
  });

  it("命中搜索结果时组装 open_stock_diagnosis 卡片", async () => {
    mockedSearchStocks.mockResolvedValue([
      { name: "贵州茅台", code: "600519", industry: "白酒" },
      { name: "五粮液", code: "000858", industry: "白酒" },
    ] as never);

    const r = await executeMainTool({
      tool: "query_stocks",
      params: { q: "白酒" },
    });
    expect(r!.ok).toBe(true);
    expect(r!.summary).toContain("找到 2 只股票（显示前 2 只）");
    expect(r!.items![0].label).toBe("贵州茅台 (600519)");
    expect(r!.items![0].action).toEqual({
      tool: "open_stock_diagnosis",
      params: { code: "600519", name: "贵州茅台" },
    });
  });

  it("无结果时返回未找到文案", async () => {
    const r = await executeMainTool({
      tool: "query_stocks",
      params: { q: "不存在" },
    });
    expect(r!.ok).toBe(true);
    expect(r!.summary).toContain("未找到与「不存在」相关的股票");
  });

  it("搜索链路抛错时返回失败结果（不向上抛）", async () => {
    mockedSearchStocks.mockRejectedValue(new Error("net down") as never);
    const r = await executeMainTool({
      tool: "query_stocks",
      params: { q: "茅台" },
    });
    expect(r!.ok).toBe(false);
    expect(r!.summary).toBe("net down");
  });
});

describe("query_stock_diagnosis", () => {
  it("无 code 且无页面上下文时给出参数提示", async () => {
    const r = await executeMainTool({
      tool: "query_stock_diagnosis",
      params: {},
    });
    expect(r!.ok).toBe(false);
    expect(r!.summary).toContain("请提供股票代码");
  });

  it("code 可从页面上下文 currentStock 兜底", async () => {
    mockedFetchAngles.mockResolvedValue({
      fulfilledCount: 1,
      perAngle: { price_trend: {} },
    } as never);
    mockedComputeScores.mockReturnValue({
      overall: 7.2,
      dimensions: { fundamental: 8 },
      rationale: ["估值偏低"],
    } as never);

    const r = await executeMainTool(
      { tool: "query_stock_diagnosis", params: {} },
      { pageData: { currentStock: { code: "600519", name: "贵州茅台" } } },
    );
    expect(r!.ok).toBe(true);
    expect(r!.summary).toContain("贵州茅台 (600519) 诊断");
    expect(r!.summary).toContain("综合评分 7.2/10");
    expect(r!.summary).toContain("基本面 8/10");
    expect(r!.summary).toContain("估值偏低");
    expect(r!.items![0].label).toBe("查看 贵州茅台 诊断");
  });

  it("五维 angles 全量下发给 fetcher", async () => {
    mockedFetchAngles.mockResolvedValue({ fulfilledCount: 0 } as never);

    await executeMainTool({
      tool: "query_stock_diagnosis",
      params: { code: "600519" },
    });
    expect(mockedFetchAngles).toHaveBeenCalledWith(
      expect.anything(),
      "600519",
      [
        "price_trend",
        "valuation",
        "profitability",
        "capital_flow",
        "tech_indicators",
      ],
    );
  });

  it("fulfilledCount 为 0 时返回数据不可用文案", async () => {
    mockedFetchAngles.mockResolvedValue({ fulfilledCount: 0 } as never);
    const r = await executeMainTool({
      tool: "query_stock_diagnosis",
      params: { code: "600519" },
    });
    expect(r!.ok).toBe(false);
    expect(r!.summary).toContain("未能获取 600519 的诊断数据");
  });

  it("抓取抛错时返回失败结果（不向上抛）", async () => {
    mockedFetchAngles.mockRejectedValue(new Error("timeout") as never);
    const r = await executeMainTool({
      tool: "query_stock_diagnosis",
      params: { code: "600519" },
    });
    expect(r!.ok).toBe(false);
    expect(r!.summary).toBe("timeout");
  });
});

describe("query_reminders", () => {
  it("无提醒时给引导文案与打开提醒卡片", async () => {
    const r = await executeMainTool({ tool: "query_reminders", params: {} });
    expect(r!.ok).toBe(true);
    expect(r!.summary).toContain("当前没有提醒事项");
    expect(r!.items![0].action).toEqual({
      tool: "open_reminders",
      params: {},
    });
  });

  it("按状态统计并列出待触发项", async () => {
    mockedRemindersList.mockReturnValue([
      { id: "r1", title: "站会", status: "pending", triggerAt: Date.UTC(2026, 8, 16, 9, 30) },
      { id: "r2", title: "复盘", status: "fired", triggerAt: Date.UTC(2026, 8, 15, 18, 0) },
    ] as never);

    const r = await executeMainTool({ tool: "query_reminders", params: {} });
    expect(r!.summary).toContain("共 2 条提醒，1 条待触发。");
    expect(r!.summary).toContain("• 站会");
    expect(r!.items).toHaveLength(1);
    expect(r!.items![0].label).toBe("站会");
  });
});

describe("remember_fact / forget_fact / list_memory", () => {
  it("remember_fact：空内容拒绝", async () => {
    const r = await executeMainTool({ tool: "remember_fact", params: {} });
    expect(r!.ok).toBe(false);
    expect(r!.summary).toContain("缺少要记住的内容");
  });

  it("remember_fact：写入成功与写入失败两个分支", async () => {
    mockedAddMemory.mockReturnValue({ id: "m1", text: "喜欢深色模式", createdAt: 0 } as never);
    const ok = await executeMainTool({
      tool: "remember_fact",
      params: { fact: " 喜欢深色模式 " },
    });
    expect(ok!.ok).toBe(true);
    expect(ok!.summary).toBe("已记住：喜欢深色模式");
    expect(mockedAddMemory).toHaveBeenCalledWith("喜欢深色模式");

    mockedAddMemory.mockReturnValue(null as never);
    const bad = await executeMainTool({
      tool: "remember_fact",
      params: { fact: "x" },
    });
    expect(bad!.ok).toBe(false);
    expect(bad!.summary).toContain("未能记住");
  });

  it("forget_fact：删除成功与未找到两个分支", async () => {
    mockedRemoveMemory.mockReturnValue(true as never);
    const ok = await executeMainTool({
      tool: "forget_fact",
      params: { query: "深色" },
    });
    expect(ok!.ok).toBe(true);
    expect(ok!.summary).toContain("已删除该条记忆");

    mockedRemoveMemory.mockReturnValue(false as never);
    const miss = await executeMainTool({ tool: "forget_fact", params: {} });
    expect(miss!.ok).toBe(false);
    expect(miss!.summary).toContain("未找到匹配的记忆");
  });

  it("forget_fact：关键词多命中时不删除并引导用 id 精确删", async () => {
    // removeMemory 对多命中返回 false（不批量删）—— 工具层应回候选引导文案
    mockedRemoveMemory.mockReturnValue(false as never);
    mockedListMemory.mockReturnValue([
      { id: "m1", text: "喜欢喝绿茶", createdAt: 1 },
      { id: "m2", text: "喜欢喝红茶", createdAt: 2 },
    ] as never);

    const r = await executeMainTool({
      tool: "forget_fact",
      params: { query: "喜欢" },
    });

    expect(mockedRemoveMemory).toHaveBeenCalledWith(
      expect.objectContaining({ query: "喜欢" }),
    );
    expect(r!.ok).toBe(false);
    expect(r!.summary).toContain("多条记忆");
    expect(r!.summary).toContain("list_memory");
    // 未删任何一条：removeMemory 仍只被调用了一次（本次查询本身）
    expect(mockedRemoveMemory).toHaveBeenCalledTimes(1);
  });

  it("list_memory：空与非空两种形态", async () => {
    const empty = await executeMainTool({ tool: "list_memory", params: {} });
    expect(empty!.summary).toContain("目前没有任何长期记忆");

    mockedListMemory.mockReturnValue([
      { id: "m1", text: "第一条", createdAt: 1 },
      { id: "m2", text: "第二条", createdAt: 2 },
    ] as never);
    const full = await executeMainTool({ tool: "list_memory", params: {} });
    expect(full!.summary).toContain("共 2 条长期记忆");
    expect(full!.summary).toContain("1. 第一条");
    expect(full!.items!.map((i) => i.label)).toEqual(["第一条", "第二条"]);
  });
});

describe("AI 解读类工具 — 透传 interpret-tools", () => {
  it("interpret_finance 透传 params 与 pageData", async () => {
    vi.mocked(interpretTools.runInterpretFinance).mockReturnValue({
      tool: "interpret_finance",
      ok: true,
      summary: "解读完成",
    } as never);

    const r = await executeMainTool(
      { tool: "interpret_finance", params: { id: 42 } },
      { pageData: { article: { id: 42 } } },
    );
    expect(r).toEqual({ tool: "interpret_finance", ok: true, summary: "解读完成" });
    expect(interpretTools.runInterpretFinance).toHaveBeenCalledWith(
      { id: 42 },
      { article: { id: 42 } },
    );
  });

  it("summarize_ithome 透传 params 与 pageData", async () => {
    vi.mocked(interpretTools.runSummarizeIthome).mockReturnValue({
      tool: "summarize_ithome",
      ok: true,
      summary: "热榜摘要",
    } as never);

    const r = await executeMainTool(
      { tool: "summarize_ithome", params: { id: 7 } },
      { pageData: { ithome: {} } },
    );
    expect(r!.summary).toBe("热榜摘要");
    expect(interpretTools.runSummarizeIthome).toHaveBeenCalledWith(
      { id: 7 },
      { ithome: {} },
    );
  });

  it("advise_stocks 透传 intent params", async () => {
    vi.mocked(interpretTools.runAdviseStocks).mockReturnValue({
      tool: "advise_stocks",
      ok: true,
      summary: "组合建议",
    } as never);

    const r = await executeMainTool({
      tool: "advise_stocks",
      params: { intent: "low_value" },
    });
    expect(r!.ok).toBe(true);
    expect(interpretTools.runAdviseStocks).toHaveBeenCalledWith({
      intent: "low_value",
    });
  });

  it("query_movies 透传 params", async () => {
    vi.mocked(interpretTools.runQueryMovies).mockReturnValue({
      tool: "query_movies",
      ok: true,
      summary: "正在热映",
    } as never);

    const r = await executeMainTool({
      tool: "query_movies",
      params: { city: "上海" },
    });
    expect(r!.summary).toBe("正在热映");
    expect(interpretTools.runQueryMovies).toHaveBeenCalledWith({ city: "上海" });
  });

  it("query_concerts 无参调用", async () => {
    vi.mocked(interpretTools.runQueryConcerts).mockReturnValue({
      tool: "query_concerts",
      ok: true,
      summary: "近期演出",
    } as never);

    const r = await executeMainTool({ tool: "query_concerts", params: {} });
    expect(r!.summary).toBe("近期演出");
    expect(interpretTools.runQueryConcerts).toHaveBeenCalledWith();
  });
});

describe("listMonitoredApps", () => {
  it("返回监控应用名列表", () => {
    mockedLoad.mockReturnValue({ apps: { A: {}, B: {} } } as never);
    expect(listMonitoredApps()).toEqual(["A", "B"]);
  });

  it("无 apps 字段时返回空数组（语义：确实没有）", () => {
    mockedLoad.mockReturnValue({} as never);
    expect(listMonitoredApps()).toEqual([]);
  });

  it("state 为空时返回 undefined（语义：名单不可用）", () => {
    mockedLoad.mockReturnValue(null as never);
    expect(listMonitoredApps()).toBeUndefined();
  });

  it("读取抛错时返回 undefined 而非抛出", () => {
    mockedLoad.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(listMonitoredApps()).toBeUndefined();
  });
});

describe("toolResultsToCards", () => {
  it("透传 tool / summary / items", () => {
    const cards = toolResultsToCards([
      { tool: "query_apps", summary: "s", items: [{ label: "L" }] },
      { tool: "search", summary: "s2" },
    ]);
    expect(cards).toEqual([
      { tool: "query_apps", summary: "s", items: [{ label: "L" }] },
      { tool: "search", summary: "s2", items: undefined },
    ]);
  });
});
