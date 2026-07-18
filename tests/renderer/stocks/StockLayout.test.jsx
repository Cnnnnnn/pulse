// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/preact";
import { StockContent } from "../../../src/renderer/stocks/StockLayout.jsx";
import {
  stockActiveTab,
  stockDiagnosisCode,
  diagnosisState,
  closeDiagnosis,
} from "../../../src/renderer/stocks/diagnosisStore.js";

// ponytail 2026-07-18 P0-1 T7: stockStore 在子组件 (StrategyBar / CriteriaPanel /
//   ResultTable / AiAdviseDrawer) 里到处 import — 走 importOriginal 拿真实实现, 只
//   静音 refresh timer (避免 happy-dom 清理时的开放 setInterval 警告).
vi.mock("../../../src/renderer/stocks/stockStore.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    startRefreshTimer: vi.fn(),
    stopRefreshTimer: vi.fn(),
  };
});

// ponytail 2026-07-18 P0-1 T7: StockContent 在 useEffect 里直接读 api 模块,
//   整个模块不需要 IPC — 给个空 stub 防止主进程 import 链被拉起来.
vi.mock("../../../src/renderer/api.js", () => ({ api: {} }));

afterEach(() => {
  cleanup();
  stockActiveTab.value = "screen";
  stockDiagnosisCode.value = null;
  closeDiagnosis();
});

const NOW = 1_700_000_000_000;
const recent = NOW - 1000;

describe("StockContent 工具位 DataHealthBadge 集成 (P0-1 T7)", () => {
  it("在 screen tab 下不渲染 DataHealthBadge", () => {
    stockActiveTab.value = "screen";
    const { container } = render(<StockContent />);
    expect(container.querySelector(".data-health-badge")).toBeNull();
  });

  it("在 diagnosis tab + 空 perAngleData 时不渲染 DataHealthBadge (badge 返回 null)", () => {
    stockActiveTab.value = "diagnosis";
    diagnosisState.value = {
      status: "ready",
      perAngleData: {},
      scores: null,
      aiResult: null,
      aiStatus: "idle",
      error: null,
      errorReason: null,
      aiStartedAt: null,
      dataGaps: [],
    };
    const { container } = render(<StockContent />);
    // 空 perAngleData 时 badge 内部返回 null, DOM 里查不到节点
    expect(container.querySelector(".data-health-badge")).toBeNull();
  });

  it("在 diagnosis tab + 部分缺失 perAngleData 时渲染 DataHealthBadge (N/M 文案)", () => {
    stockActiveTab.value = "diagnosis";
    diagnosisState.value = {
      status: "ready",
      perAngleData: {
        price_trend: { status: "ok", data: { x: 1 }, fetchedAt: recent },
        volume_turnover: { status: "failed", reason: "fetch_failed" },
        valuation: { status: "ok", data: { pe: 10 }, fetchedAt: recent },
      },
      scores: null,
      aiResult: null,
      aiStatus: "idle",
      error: null,
      errorReason: null,
      aiStartedAt: null,
      dataGaps: [],
    };
    const { container } = render(<StockContent />);
    const badge = container.querySelector(".data-health-badge");
    expect(badge).toBeTruthy();
    // 部分成功 → "数据 2/N 已更新" (N = ALL_ANGLES 长度, 这里 12)
    expect(badge.textContent).toMatch(/\d+\s*\/\s*\d+\s*已更新/);
    // 部分失败 → 带 warn modifier
    expect(badge.classList.contains("data-health-badge-warn")).toBe(true);
  });
});