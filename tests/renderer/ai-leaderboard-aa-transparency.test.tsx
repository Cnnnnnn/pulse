// @vitest-environment happy-dom
/**
 * tests/renderer/ai-leaderboard-aa-transparency.test.tsx
 *
 * 独立回归验证「AI 榜单 AA 视角透明度/标注」改动（对应对比报告 R1/R2/R3/R4/R8）。
 *
 * 锁定点（新 UI 行为，71 用例未覆盖）：
 *  - R1/R2a/R3：AA 视图「AA 方法说明」整行含「未本地重算」「无置信区间」「估算」。
 *  - R1：AA 视图 summary 含「数据快照（引用日）… · 方法论 v4.1」。
 *  - R2b：AA 模型行 modelCell 内联覆盖率标签 `▦ N/5`，N 按 5 维有效值计数（价格须 >0）。
 *  - R3：价格列（及性价比列）`title` 含「估算」字样。
 *  - R4：stale signal 为 true 时渲染「数据可能过期（使用缓存快照兜底）」横幅。
 *  - R8：AttributionFooter 渲染「数据来源」标签 + 「Artificial Analysis（方法论 v4.1）」署名。
 *  - ValueScatter header 追加「价格为估算 blended（in+out)/2，无置信区间」。
 *
 * 范式：mock api + 设置 activeView.value="aa" + 注入 store.items，render 整页 / 组件。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/preact";
import { AiLeaderboardPage } from "../../src/renderer/ai-leaderboard/AiLeaderboardPage.tsx";
import { ValueScatter } from "../../src/renderer/ai-leaderboard/ValueScatter.tsx";
import { AttributionFooter } from "../../src/renderer/ai-leaderboard/AttributionFooter.tsx";
import * as store from "../../src/renderer/ai-leaderboard/aiLeaderboardStore.ts";
import { ATTRIBUTION, AA_METHODOLOGY_VERSION } from "../../src/renderer/ai-leaderboard/types.ts";

vi.mock("../../src/renderer/api.ts", () => ({
  api: {
    getLeaderboard: vi.fn(async () => ({ ok: true, items: [], sources: {}, attribution: [], stale: false, fromCache: false, fetchedAt: null, count: 0 })),
    refreshLeaderboard: vi.fn(async () => ({ ok: true, items: [], sources: {}, attribution: [], stale: false, fromCache: false, fetchedAt: null, count: 0 })),
    exportLeaderboardCsv: vi.fn(async () => ({ ok: true })),
  },
}));

// 两个 AA 模型：覆盖「字段齐全（5/5）」与「仅 2 维有值（2/5）」两种覆盖率情形。
// 价格维度 isPrice=true，必须 >0 才算有效；其余 4 维为普通有限数即可。
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
  // 仅智能指数 + 输出价有值；代码 / Agentic / 速度 缺失 → 覆盖率 2/5
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
afterEach(() => cleanup());

describe("AA 方法说明整行（R1/R2a/R3）", () => {
  it("AA 视图渲染「AA 方法说明」，并含 未本地重算 / 无置信区间 / 估算 关键词", () => {
    store.items.value = [aaFull, aaPartial];
    store.fetchedAt.value = "2026-07-20T00:00:00Z"; // 触发 summary 引用日分支
    const { container } = render(<AiLeaderboardPage />);

    const txt = container.textContent;
    expect(txt).toContain("AA 方法说明");
    // 三条透明声明全部出现
    expect(txt).toContain("未本地重算");
    expect(txt).toContain("无置信区间");
    expect(txt).toContain("估算");

    // 方法说明落在专属整行 class 上
    expect(container.querySelector(".ai-leaderboard-summary__method")).toBeTruthy();
  });
});

describe("AA 视图 summary 引用日 + 方法论版本（R1）", () => {
  it("fetchedAt 存在时 summary 含「数据快照（引用日）… · 方法论 v4.1」", () => {
    store.items.value = [aaFull, aaPartial];
    store.fetchedAt.value = "2026-07-20T00:00:00Z";
    const { container } = render(<AiLeaderboardPage />);
    const txt = container.textContent;
    expect(txt).toContain("方法论 v4.1");
    expect(txt).toContain("引用日");
    expect(txt).toContain("数据快照");
  });

  it("方法论版本常量与署名文案同源（v4.1）", () => {
    expect(AA_METHODOLOGY_VERSION).toBe("v4.1");
    expect(ATTRIBUTION["artificial-analysis"].text).toBe(`Artificial Analysis（方法论 ${AA_METHODOLOGY_VERSION}）`);
  });
});

describe("AA 模型行覆盖率标签 ▦ N/5（R2b）", () => {
  it("字段齐全模型渲染 ▦ 5/5，缺失模型渲染 ▦ 2/5，且 title 列出有值/暂无维度", () => {
    store.items.value = [aaFull, aaPartial];
    const { container } = render(<AiLeaderboardPage />);

    const labels = Array.from(container.querySelectorAll(".ai-lb-tag--coverage")).map(
      (el) => el.textContent.trim(),
    );
    expect(labels).toContain("▦ 5/5");
    expect(labels).toContain("▦ 2/5");

    // title 维度拆解：full 五维俱全；partial 仅智能指数 + 输出价
    const titles = Array.from(container.querySelectorAll(".ai-lb-tag--coverage")).map(
      (el) => el.getAttribute("title") || "",
    );
    const fullTitle = titles.find((t) => t.includes("5/5"));
    const partialTitle = titles.find((t) => t.includes("2/5"));
    expect(fullTitle).toBeTruthy();
    expect(partialTitle).toBeTruthy();
    expect(fullTitle).toContain("有值 — 智能指数、代码、Agentic、速度、输出价");
    expect(partialTitle).toContain("有值 — 智能指数、输出价");
    expect(partialTitle).toContain("暂无 — 代码、Agentic、速度");
  });

  it("价格=0 不计为有效维度（覆盖率不会因价=0 虚高）", () => {
    // 价格 0：isPrice 守卫使其无效；仅智能指数有效 → 覆盖率 1/5
    const zeroPrice = {
      id: "z",
      name: "ZeroPrice",
      vendor: "openai",
      isSample: false,
      aa: { intelligenceIndex: 50, priceOutputPer1M: 0 },
      modelsdev: null,
      sources: { arena: "none", aa: "live", openrouter: "none", livebench: "none", modelsdev: "none" },
    };
    store.items.value = [zeroPrice];
    const { container } = render(<AiLeaderboardPage />);
    const labels = Array.from(container.querySelectorAll(".ai-lb-tag--coverage")).map(
      (el) => el.textContent.trim(),
    );
    expect(labels).toContain("▦ 1/5");
  });
});

describe("价格列 title 含「估算」（R3）", () => {
  it("AA 表格价格列（data-sort='price'）单元格 title 含「估算」", () => {
    store.items.value = [aaFull, aaPartial];
    const { container } = render(<AiLeaderboardPage />);

    const priceTh = container.querySelector('th[data-sort="price"]');
    expect(priceTh).toBeTruthy();
    const thIndex = Array.from(priceTh.parentNode.children).indexOf(priceTh);
    const firstRow = container.querySelector(".ai-lb-table tbody tr");
    expect(firstRow).toBeTruthy();
    const priceTd = firstRow.children[thIndex];
    expect(priceTd).toBeTruthy();
    const title = priceTd.getAttribute("title") || "";
    expect(title).toContain("估算");
    // 口径明确为 blended (in+out)/2
    expect(title).toContain("(in+out)/2");
  });
});

describe("stale 横幅（R4）", () => {
  it("stale=true 时渲染「数据可能过期（使用缓存快照兜底）」横幅", () => {
    store.items.value = [aaFull, aaPartial];
    store.stale.value = true;
    const { container } = render(<AiLeaderboardPage />);
    expect(container.textContent).toContain("数据可能过期");
    expect(container.querySelector(".ai-lb-state--warn")).toBeTruthy();
  });

  it("stale=false 时不渲染过期横幅", () => {
    store.items.value = [aaFull, aaPartial];
    store.stale.value = false;
    const { container } = render(<AiLeaderboardPage />);
    expect(container.querySelector(".ai-lb-state--warn")).toBeNull();
  });
});

describe("AttributionFooter 渲染 v4.1 署名（R8）", () => {
  it("空 attribution 时强制追加 AA 署名「Artificial Analysis（方法论 v4.1）」", () => {
    const { container } = render(<AttributionFooter attribution={[]} />);
    expect(container.textContent).toContain("数据来源");
    expect(container.textContent).toContain("Artificial Analysis（方法论 v4.1）");
  });

  it("主进程返回 {id:'artificial-analysis'} 时映射出同一署名文案", () => {
    const { container } = render(<AttributionFooter attribution={[{ id: "artificial-analysis" }]} />);
    expect(container.textContent).toContain("Artificial Analysis（方法论 v4.1）");
  });
});

describe("ValueScatter header 估算声明（R3）", () => {
  it("AA 散点图 header 含「价格为估算 blended（in+out)/2，无置信区间」", () => {
    const { container } = render(<ValueScatter items={[aaFull, aaPartial]} />);
    expect(container.textContent).toContain("价格为估算 blended（in+out)/2，无置信区间");
  });
});
