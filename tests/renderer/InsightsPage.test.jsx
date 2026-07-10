// @vitest-environment happy-dom
/**
 * tests/renderer/InsightsPage.test.jsx
 *
 * InsightsPage — KPI 行 + AI 总览摘要 + 可升级 app 列表.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/preact";
import { InsightsPage } from "../../src/renderer/components/InsightsPage.jsx";
import { setAiInsights } from "../../src/renderer/overview-store.js";
import { results, resetCheck } from "../../src/renderer/store.js";

const mockAiInsights = vi.fn();
vi.mock("../../src/renderer/api.js", () => ({
  api: {
    get versionsOverviewAiInsights() { return mockAiInsights; },
    getAppIcon: () => Promise.resolve({}),
  },
}));

beforeEach(() => {
  cleanup();
  resetCheck();
  setAiInsights({ status: "idle", text: "", fromCache: false });
  vi.clearAllMocks();
  mockAiInsights.mockReset();
  // 默认 resolve 成功 (测试可覆盖)
  mockAiInsights.mockResolvedValue({ ok: true, text: "总览摘要", fromCache: false });
});

/** 构造一个 result 对象 */
function mkResult(name, overrides = {}) {
  return {
    name,
    installed_version: "1.0.0",
    latest_version: "2.0.0",
    has_update: true,
    status: "update_available",
    bundle: "cask-" + name,
    release_url: "",
    ...overrides,
  };
}

describe("InsightsPage", () => {
  it("渲染 title", () => {
    results.value = new Map();
    render(<InsightsPage />);
    expect(screen.getByText("AI 洞察")).toBeTruthy();
  });

  it("从 results 派生 KPI", async () => {
    results.value = new Map([
      ["A", mkResult("A", { has_update: true, brew_cask: "a", status: "update_available" })],
      ["B", mkResult("B", { has_update: false, status: "up_to_date", brew_cask: "b" })],
      ["C", mkResult("C", { has_update: true, status: "error", brew_cask: "c" })],
    ]);
    render(<InsightsPage />);
    // 可升级 = has_update && brew_cask => A, C => 2 (B has_update=false)
    // KPI 文本: value 元素是 label 的前一个兄弟元素
    expect(screen.getByText("可升级").previousElementSibling?.textContent).toBe("2");
  });

  it("mount 时触发 versionsOverviewAiInsights 并展示摘要", async () => {
    results.value = new Map();
    render(<InsightsPage />);
    await waitFor(() => {
      expect(mockAiInsights).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText("总览摘要")).toBeTruthy();
    });
  });

  it("有更新的 app 出现在列表中, 可展开 AI 摘要", () => {
    results.value = new Map([
      ["Slack", mkResult("Slack", { release_url: "https://x/slack" })],
    ]);
    render(<InsightsPage />);
    expect(screen.getByText("Slack")).toBeTruthy();
    expect(screen.getByText("有更新的 App (1)")).toBeTruthy();
    // release notes 链接
    expect(screen.getByText("Release Notes")).toBeTruthy();
  });

  it("没有待更新 app 时显示空态", () => {
    results.value = new Map([
      ["A", mkResult("A", { has_update: false, status: "up_to_date" })],
    ]);
    render(<InsightsPage />);
    expect(screen.getByText("当前没有待更新的 App")).toBeTruthy();
  });

  it("展开 app 行显示 ChangelogSummary 触发按钮", () => {
    results.value = new Map([["App", mkResult("App")]]);
    const { container } = render(<InsightsPage />);
    // 点击 app 行展开
    fireEvent.click(screen.getByText("App"));
    // ChangelogSummary 的 AI 摘要触发按钮出现
    expect(container.querySelector(".changelog-summary-trigger")).toBeTruthy();
  });
});
