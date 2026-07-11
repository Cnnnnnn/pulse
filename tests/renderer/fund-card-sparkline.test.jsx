// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  fundsNavHistory: vi.fn(async () => ({ ok: false, reason: "fail" })),
}));
vi.mock("../../src/renderer/api.js", () => ({ api: mockApi }));

import { render, cleanup, fireEvent, waitFor } from "@testing-library/preact";
import { FundCardSparkline } from "../../src/renderer/funds/FundCardSparkline.jsx";
import { navHistoryCache } from "../../src/renderer/funds/fundStore.js";

afterEach(() => {
  cleanup();
  navHistoryCache.value = {};
  mockApi.fundsNavHistory.mockClear();
});

describe("FundCardSparkline (Task C) — 失败重试", () => {
  it("loadFundNavHistory 返回 ok:false 时渲染重试按钮", async () => {
    render(<FundCardSparkline code="000001" />);
    await waitFor(() =>
      expect(document.querySelector(".fund-card-spark-retry")).toBeTruthy(),
    );
  });

  it("点击重试再次调用 loadFundNavHistory", async () => {
    render(<FundCardSparkline code="000001" />);
    let btn;
    await waitFor(() => {
      btn = document.querySelector(".fund-card-spark-retry");
      expect(btn).toBeTruthy();
    });
    // 挂载时 effect 已调用一次
    await waitFor(() => expect(mockApi.fundsNavHistory).toHaveBeenCalledTimes(1));
    await fireEvent.click(btn);
    await waitFor(() => expect(mockApi.fundsNavHistory).toHaveBeenCalledTimes(2));
  });

  it("成功后渲染 svg 走势 (非重试按钮)", async () => {
    mockApi.fundsNavHistory.mockImplementation(async () => ({
      ok: true,
      series: [
        { date: "2026-07-01", nav: 1.0 },
        { date: "2026-07-02", nav: 1.1 },
        { date: "2026-07-03", nav: 1.2 },
      ],
    }));
    render(<FundCardSparkline code="000002" />);
    await waitFor(() => expect(document.querySelector(".fund-card-spark-retry")).toBeNull());
    expect(document.querySelector("svg.fund-card-spark")).toBeTruthy();
  });
});
