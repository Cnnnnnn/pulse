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

const mockedLoad = vi.mocked(stateStore.load);
const mockedFundsLoad = vi.mocked(fundStore.loadAll);

beforeEach(() => {
  mockedLoad.mockReset();
  mockedLoad.mockReturnValue(null as never);
  mockedFundsLoad.mockReset();
  mockedFundsLoad.mockReturnValue({ holdings: [] } as never);
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
 * ⚠️ 以下工具的执行路径当前**不可测** —— 根因是源码缺陷，不是测试写法：
 *
 * `src/ai/assistant-tools.ts` 内有 **17 处动态 `require("./x")`**（金属 / 股票 /
 * 提醒 / 记忆 / AI 解读类工具走这些路径）。在 vitest 直连源码的模式下，Node 无法
 * 解析无扩展名的 `.ts` 目标 —— 实测加 `.js` 后缀**同样失败**（实际文件是 `.ts`，
 * Node 不做 backfill；esbuild 生产构建另有 backfill plugin，故只影响测试环境）。
 *
 * 这也解释了为何这 720 行、39 个工具的实现此前从未被真正执行测试：项目内所有
 * 直连源码的测试都**绕开**了这些 CJS require 路径（用 vi.mock 替换掉整个模块）。
 *
 * → 覆盖这些工具的前置条件：把上述 17 处 CJS require 迁移为 ESM import
 *   （Phase 7 未完成的部分）。属独立重构，需先确认无循环依赖，且
 *   metal-ipc / chromium-http-client / reminders 等 main 侧模块在测试环境下
 *   副作用可控（尤其不可写用户真实 state）。
 *
 * 受影响工具（12 个）：query_metals / query_stocks / query_stock_diagnosis /
 * query_reminders / remember_fact / forget_fact / list_memory /
 * interpret_finance / summarize_ithome / advise_stocks / query_movies /
 * query_concerts。
 */

describe("工具可测性清单（防回归）", () => {
  it("策略表的主进程工具数与已知不可测数一致", () => {
    // 39 = 20 main + 19 renderer；其中 12 个 main 工具因 CJS require 暂不可测
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
