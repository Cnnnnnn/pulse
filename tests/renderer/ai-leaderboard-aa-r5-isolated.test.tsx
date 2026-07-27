// @vitest-environment happy-dom
/**
 * tests/renderer/ai-leaderboard-aa-r5-isolated.test.tsx
 *
 * R5 Free 轻量版 · 隔离覆盖测试（与 `aa-transparency.test.tsx` 完全独立）。
 *
 * 背景（必读）：在 `chore/upgrade-vitest-4` 分支上，vitest4/vite8 导致 preact /
 * react-virtuoso 双实例，`<AiLeaderboardPage>` 整页渲染抛
 * `Cannot read properties of undefined (reading '__H')`，使 `aa-transparency.test.tsx`
 * 中所有「整页 render(<AiLeaderboardPage/>)」用例失败（源码本身正确）。
 *
 * 本文件把整个 `react-virtuoso` 模块 mock 掉（返回一个纯 preact 渲染 stub，
 * 不引用 react-virtuoso 真实实现），从而替换掉 `__H` 双实例触发器，让页面正常渲染，
 * 进而真实验证 R5 多模态指针按钮的行为，在当前分支稳定跑绿。
 *
 * 复用 `aa-transparency.test.tsx` 的 setup 范式：
 *   - happy-dom 环境
 *   - mock api 桥（getLeaderboard / refreshLeaderboard / exportLeaderboardCsv）
 *   - 注入 AA 维度模型到 store.items、activeView.value="aa"、render <AiLeaderboardPage/>
 *
 * 锁定点（R5 行为）：
 *  - AA 视图渲染 `.ai-leaderboard-dim-note__link` 多模态指针按钮；
 *  - 点击该按钮调用 `setView("arena")`，同步切换 `activeView.value === "arena"`；
 *  - `.ai-leaderboard-dim-note` 说明块渲染，文案涵盖 Commercial / Capability / Openness / 多模态。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/preact";
import { AiLeaderboardPage } from "../../src/renderer/ai-leaderboard/AiLeaderboardPage.tsx";
import * as store from "../../src/renderer/ai-leaderboard/aiLeaderboardStore.ts";

/* ── 1. Mock react-virtuoso（核心：替换掉 __H 双实例触发器）──
 * LeaderboardTable.tsx 真实 import 的是 `TableVirtuoso`；这里把常用具名导出全部
 * 返回为纯渲染 stub，确保即使将来引入其它 virtuoso 组件也不会漏 mock。
 * stub 内部走 app 自己的 preact（不引用 react-virtuoso 真实实现），
 * 直接返回 children（无 children 时返回 null），从而不再加载真实的第二份 preact 实例。 */
vi.mock("react-virtuoso", () => {
  const Stub = (props: any) => (props && props.children ? props.children : null);
  return {
    TableVirtuoso: Stub,
    Virtuoso: Stub,
    GroupedVirtuoso: Stub,
    Table: Stub,
    TableComponents: Stub,
    TableBody: Stub,
    TableHead: Stub,
    TableRow: Stub,
    TableFoot: Stub,
    List: Stub,
  };
});

/* ── 2. Mock api 桥（与 aa-transparency.test.tsx 完全一致）── */
vi.mock("../../src/renderer/api.ts", () => ({
  api: {
    getLeaderboard: vi.fn(async () => ({
      ok: true, items: [], sources: {}, attribution: [], stale: false, fromCache: false, fetchedAt: null, count: 0,
    })),
    refreshLeaderboard: vi.fn(async () => ({
      ok: true, items: [], sources: {}, attribution: [], stale: false, fromCache: false, fetchedAt: null, count: 0,
    })),
    exportLeaderboardCsv: vi.fn(async () => ({ ok: true })),
  },
}));

/* ── 3. Mock store：保留全部真实导出，仅把 `setView` 包成 spy ──
 * 这样既能真实驱动页面（activeView / items / getDisplayed 等仍是同一实例），
 * 又能在断言里直接捕获「点击 R5 按钮是否调了 setView("arena")」。
 * 注意：AiLeaderboardPage 与测试都从同一绝对路径导入该模块，故共享同一份 mock。 */
vi.mock("../../src/renderer/ai-leaderboard/aiLeaderboardStore.ts", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    setView: vi.fn(actual.setView),
  };
});

/* ── 两个 AA 模型：覆盖「字段齐全（5/5）」与「仅 2 维有值（2/5）」──
 * 二者均有 intelligenceIndex，故在 AA + intelligence 维度下都能进入 displayed 列表，
 * 保证 .ai-leaderboard-dim-note 块（依赖 rows.length>0）正常渲染。 */
const aaFull = {
  id: "full",
  name: "FullModel",
  vendor: "openai",
  isSample: false,
  aa: {
    intelligenceIndex: 80,
    codingIndex: 70,
    agenticIndex: 60,
    outputTokensPerSec: 120,
    priceOutputPer1M: 2,
  },
  modelsdev: { contextLength: 128000, inputCostPer1M: 5 },
  sources: { arena: "none", aa: "live", openrouter: "none", livebench: "none", modelsdev: "none" },
};

const aaPartial = {
  id: "partial",
  name: "PartialModel",
  vendor: "google",
  isSample: false,
  aa: {
    intelligenceIndex: 40,
    priceOutputPer1M: 8,
  },
  modelsdev: null,
  sources: { arena: "none", aa: "live", openrouter: "none", livebench: "none", modelsdev: "none" },
};

function resetStore() {
  localStorage.clear();
  store.activeView.value = "aa";
  store.activeBoard.value = "text";
  store.activeDim.value = "intelligence";
  store.activeLB.value = "lb_overall";
  store.activeAgentDim.value = "Net Improvement";
  store.sortKey.value = null;
  store.sortDir.value = "desc";
  store.activeVendor.value = "all";
  store.licenseFilter.value = "all";
  store.searchQuery.value = "";
  store.items.value = [];
  store.sources.value = {};
  store.attribution.value = [];
  store.sourceCoverage.value = { arena: 0, aa: 0, openrouter: 0, livebench: 0, modelsdev: 0, huggingface: 0 };
  store.loading.value = false;
  store.error.value = null;
  store.fetchedAt.value = null;
  store.sourceDate.value = null;
  store.stale.value = false;
  store.fromCache.value = false;
  store.isSample.value = false;
  store.detailId.value = null;
  store.compareList.value = [];
}

beforeEach(() => resetStore());
afterEach(() => {
  vi.mocked(store.setView).mockClear();
  cleanup();
});

describe("R5 隔离 · 整页渲染不触发 __H", () => {
  it("AA 视图 render(<AiLeaderboardPage/>) 成功，且不抛 __H / undefined 错误", () => {
    store.items.value = [aaFull, aaPartial];
    store.activeView.value = "aa";
    store.activeDim.value = "intelligence";
    // 若 react-virtuoso 未被 mock 干净，这里会抛
    // "Cannot read properties of undefined (reading '__H')"；能渲染到 container 即说明屏蔽成功。
    expect(() => render(<AiLeaderboardPage />)).not.toThrow();
    cleanup();
  });
});

describe("R5 Free 轻量版 · 多模态指针按钮存在（用例 1）", () => {
  it("AA 视图渲染 .ai-leaderboard-dim-note__link 多模态指针按钮", () => {
    store.items.value = [aaFull, aaPartial];
    store.activeView.value = "aa";
    store.activeDim.value = "intelligence";
    const { container } = render(<AiLeaderboardPage />);

    const link = container.querySelector(".ai-leaderboard-dim-note__link");
    expect(link).toBeTruthy();
    // 文案与 R5 Free 设计一致
    expect(link!.textContent).toContain("多模态（图/视频）评测 → 见 Arena 视角的 图生图 / 文生视频 榜");
  });
});

describe("R5 Free 轻量版 · 点击调用 setView(\"arena\")（用例 2）", () => {
  it("点击多模态指针后 setView 被调用且参数为 \"arena\"，activeView 同步切到 arena", () => {
    store.items.value = [aaFull, aaPartial];
    store.activeView.value = "aa";
    store.activeDim.value = "intelligence";
    const { container } = render(<AiLeaderboardPage />);

    const link = container.querySelector(".ai-leaderboard-dim-note__link");
    expect(link).toBeTruthy();
    // 点击前仍为 aa 视图
    expect(store.activeView.value).toBe("aa");

    fireEvent.click(link!);

    // 直接捕获 R5 按钮行为：setView 被调用且参数为 "arena"
    expect(vi.mocked(store.setView)).toHaveBeenCalledWith("arena");
    // 行为结果：activeView 同步切换到 arena（与源码 setView 第一行写 activeView.value=v 一致）
    expect(store.activeView.value).toBe("arena");
  });
});

describe("R5 Free 轻量版 · 维度说明块文案（用例 3）", () => {
  it("AA 视图渲染 .ai-leaderboard-dim-note 说明块，含 Commercial / Capability / Openness / 多模态 关键词", () => {
    store.items.value = [aaFull, aaPartial];
    store.activeView.value = "aa";
    store.activeDim.value = "intelligence";
    const { container } = render(<AiLeaderboardPage />);

    const note = container.querySelector(".ai-leaderboard-dim-note");
    expect(note).toBeTruthy();
    const txt = note!.textContent || "";
    // R5 行为：说明 Commercial 专属维度（Capability / Openness / 多模态）Free tier 不暴露
    expect(txt).toMatch(/Commercial|Capability|Openness|多模态/);
    expect(txt).toContain("Commercial");
    expect(txt).toContain("Capability");
    expect(txt).toContain("Openness");
    expect(txt).toContain("多模态");
  });
});
