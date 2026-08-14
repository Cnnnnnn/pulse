// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { AIAnalysisPanel } from "../../src/renderer/ai-leaderboard/AIAnalysisPanel.tsx";
import { ComparePanel } from "../../src/renderer/ai-leaderboard/ComparePanel.tsx";
import {
  activeBoard,
  activeDim,
  activeLB,
  activeView,
  attribution,
  compareList,
  fetchedAt,
  isSample,
  items,
  sourceCoverage,
  sourceDate,
  stale,
  sortDir,
  sortKey,
} from "../../src/renderer/ai-leaderboard/aiLeaderboardStore.ts";

const models = [
  {
    id: "o1",
    name: "OpenAI o1",
    vendor: "openai",
    arena: { text: { score: 1450 } },
    aa: { intelligenceIndex: 85, codingIndex: 80, outputTokensPerSec: 70, priceOutputPer1M: 15 },
    isSample: false,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    vendor: "openai",
    arena: { text: { score: 1385 } },
    aa: { intelligenceIndex: 82, codingIndex: 78, outputTokensPerSec: 110, priceOutputPer1M: 5 },
    isSample: false,
  },
  {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    vendor: "deepseek",
    arena: { text: { score: 1330 } },
    aa: { intelligenceIndex: 76, codingIndex: 79, outputTokensPerSec: 90, priceOutputPer1M: 0.5 },
    isSample: false,
  },
];

beforeEach(() => {
  activeView.value = "arena";
  activeBoard.value = "text";
  activeDim.value = "intelligence";
  activeLB.value = "lb_overall";
  sortKey.value = null;
  sortDir.value = "desc";
  items.value = models;
  compareList.value = [];
  sourceCoverage.value = { arena: 3, aa: 3, openrouter: 0, livebench: 0, modelsdev: 0, huggingface: 0 };
  attribution.value = [];
  sourceDate.value = "2026-08-11";
  fetchedAt.value = "2026-08-11T09:00:00.000Z";
  stale.value = false;
  isSample.value = false;
});

afterEach(cleanup);

describe("AIAnalysisPanel", () => {
  it("默认关闭，不抢占榜单阅读区域", () => {
    const { container } = render(<AIAnalysisPanel open={false} onClose={vi.fn()} />);
    expect(container.querySelector(".ai-lb-analysis-panel")).toBeNull();
  });

  it("选中模型后展开分析工作台，并显示结论、来源和反馈入口", () => {
    compareList.value = ["o1", "gpt-4o", "deepseek-v3"];
    const onClose = vi.fn();
    const { container } = render(<AIAnalysisPanel open onClose={onClose} />);

    expect(container.querySelector(".ai-lb-analysis-panel")).toBeTruthy();
    expect(container.textContent).toContain("对比模型 3/3");
    expect(container.textContent).toContain("OpenAI o1");
    expect(container.textContent).toContain("结论");
    expect(container.textContent).toContain("为什么");
    expect(container.textContent).toContain("适用场景");
    expect(container.textContent).toContain("风险与不确定性");
    expect(container.textContent).toContain("数据来源");

    fireEvent.click(container.querySelector(".ai-lb-analysis-feedback button"));
    expect(container.querySelector(".ai-lb-analysis-feedback button").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(container.querySelector(".ai-lb-analysis-panel__close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ComparePanel", () => {
  it("提供查看对比和主动开启 AI 分析两个入口", () => {
    compareList.value = ["o1", "gpt-4o"];
    const onAnalyze = vi.fn();
    const { container } = render(<ComparePanel onAnalyze={onAnalyze} />);

    expect(container.querySelector(".ai-lb-compare-tray")).toBeTruthy();
    expect(container.textContent).toContain("已选择 2 个模型");
    fireEvent.click(container.querySelector(".ai-lb-compare-tray__primary"));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".ai-lb-compare-tray__secondary")).toBeTruthy();
  });
});
