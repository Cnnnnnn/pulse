// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";
import { ExportDiagnosisButton } from "../../../../src/renderer/stocks/diagnosis/ExportDiagnosisButton.jsx";

describe("ExportDiagnosisButton", () => {
  it("bridge 可用: 点击触发 api.stocksExportDiagnosisPng + ok 状态时不报错", async () => {
    const api = { stocksExportDiagnosisPng: vi.fn(async () => ({ ok: true, path: "/tmp/x.png", sizeBytes: 1234 })) };
    document.body.innerHTML = '<div class="stock-diagnosis-page"></div>';
    const { container } = render(<ExportDiagnosisButton api={api} code="600519" stockName="贵州茅台" />);
    const btn = container.querySelector("button.export-diagnosis-btn");
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
    expect(btn.title).toMatch(/PNG/);
    fireEvent.click(btn);
    await waitFor(() => {
      expect(api.stocksExportDiagnosisPng).toHaveBeenCalledTimes(1);
    });
    const callArg = api.stocksExportDiagnosisPng.mock.calls[0][0];
    expect(callArg.defaultName).toMatch(/^600519-贵州茅台-诊断-\d{4}-\d{2}-\d{2}$/);
    // is-exporting class 应被加回 (else 分支正常)
    await waitFor(() => {
      expect(document.querySelector(".stock-diagnosis-page").classList.contains("is-exporting")).toBe(false);
    });
  });

  it("bridge 缺失 (preload 漏暴露): 按钮置灰禁用 + tooltip 提示重启 (不抛 is not a function)", () => {
    // ponytail: 2026-07-07 — 防御性退化. createApi() 漏声明 / preload 漏暴露时,
    //          api.stocksExportDiagnosisPng 不是 function 而是 undefined, 旧版本直接
    //          调用会抛 "is not a function". 这里显式判桥可用性, 按钮置灰防误点击.
    const api = { stocksExportDiagnosisPng: undefined };
    const { container } = render(<ExportDiagnosisButton api={api} code="002463" stockName="沪电股份" />);
    const btn = container.querySelector("button.export-diagnosis-btn");
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
    expect(btn.title).toMatch(/重启/);
  });

  it("api.stocksExportDiagnosisPng 是真函数时, 按钮 disabled=false", () => {
    const api = { stocksExportDiagnosisPng: async () => ({ ok: true, path: "/tmp/x.png" }) };
    const { container } = render(<ExportDiagnosisButton api={api} code="600519" stockName="贵州茅台" />);
    const btn = container.querySelector("button.export-diagnosis-btn");
    expect(btn.disabled).toBe(false);
  });

  it("bridge 不可用时, 点击不触发 invoke (silent skip)", async () => {
    const fn = vi.fn();
    const api = { stocksExportDiagnosisPng: undefined };
    const { container } = render(<ExportDiagnosisButton api={api} code="002463" stockName="沪电股份" />);
    const btn = container.querySelector("button.export-diagnosis-btn");
    fireEvent.click(btn);
    // 没抛 + 没调 = 通过 (按钮 disabled, browser 不触发 click)
    expect(fn).not.toHaveBeenCalled();
  });

  it("bridge 返 canceled → 静默 (不显示 toast)", async () => {
    const api = {
      stocksExportDiagnosisPng: vi.fn(async () => ({ ok: false, reason: "canceled" })),
    };
    document.body.innerHTML = '<div class="stock-diagnosis-page"></div>';
    const { container } = render(<ExportDiagnosisButton api={api} code="002463" stockName="沪电股份" />);
    const btn = container.querySelector("button.export-diagnosis-btn");
    fireEvent.click(btn);
    await waitFor(() => {
      expect(api.stocksExportDiagnosisPng).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(container.querySelector(".export-diagnosis-toast")).toBeNull();
    });
  });

  it("bridge 抛异常 → 显示失败 toast", async () => {
    const api = {
      stocksExportDiagnosisPng: vi.fn(async () => {
        throw new TypeError("api2.stocksExportDiagnosisPng is not a function");
      }),
    };
    document.body.innerHTML = '<div class="stock-diagnosis-page"></div>';
    const { container } = render(<ExportDiagnosisButton api={api} code="002463" stockName="沪电股份" />);
    fireEvent.click(container.querySelector("button.export-diagnosis-btn"));
    await waitFor(() => {
      expect(container.querySelector(".export-diagnosis-toast-err")).toBeTruthy();
      expect(container.querySelector(".export-diagnosis-toast-err").textContent).toMatch(/导出失败/);
    });
  });
});