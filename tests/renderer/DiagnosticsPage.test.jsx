// @vitest-environment happy-dom
/**
 * tests/renderer/DiagnosticsPage.test.jsx
 *
 * DiagnosticsPage — 错误诊断整页 (路由 /versions/diagnostics).
 * 复用 DiagnosticsDrawer 同样的 diagnostics-store + api 调用, 但渲染成 page 形式.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/preact";
import { DiagnosticsPage } from "../../src/renderer/components/DiagnosticsPage.jsx";
import {
  errorEntries, errorStats, errorLoading,
  diagnosticsStartup, diagnosticsMetrics, diagnosticsTopFailures,
  diagnosticsSamples, diagnosticsDiagnosticsLoading,
  diagnosticsExporting, diagnosticsLastExport,
} from "../../src/renderer/diagnostics/diagnostics-store.js";

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    errorFetchEntries: vi.fn(),
    errorCopyAll: vi.fn(),
    errorOpenFolder: vi.fn(),
    errorClearOld: vi.fn(),
    errorExportZip: vi.fn(),
    diagnosticsFetch: vi.fn(),
    diagnosticsFetchSamples: vi.fn(),
    configExport: vi.fn(),
    selfUpdateGetState: vi.fn(),
    selfUpdateCheck: vi.fn(),
    selfUpdateInstall: vi.fn(),
  },
}));
import { api } from "../../src/renderer/api.js";

vi.mock("../../src/renderer/route-store.js", () => ({
  navigateTo: vi.fn(),
}));
import { navigateTo } from "../../src/renderer/route-store.js";

beforeEach(() => {
  cleanup();
  errorEntries.value = [];
  errorStats.value = { total: 0, byLevel: {}, skipped: 0 };
  errorLoading.value = false;
  diagnosticsStartup.value = null;
  diagnosticsMetrics.value = { latest: null, peak: null, count: 0 };
  diagnosticsTopFailures.value = [];
  diagnosticsSamples.value = [];
  diagnosticsDiagnosticsLoading.value = false;
  diagnosticsExporting.value = false;
  diagnosticsLastExport.value = null;
  vi.clearAllMocks();
  api.errorFetchEntries.mockResolvedValue({ ok: true, entries: [], stats: { total: 0, byLevel: {}, skipped: 0 } });
  api.errorCopyAll.mockResolvedValue({ ok: true, text: "" });
  api.errorOpenFolder.mockResolvedValue({ ok: true });
  api.errorClearOld.mockResolvedValue({ ok: true });
  api.errorExportZip.mockResolvedValue({ ok: true, path: "", sizeBytes: 0, fileCount: 0 });
  api.diagnosticsFetch.mockResolvedValue({
    ok: true, startup: null,
    metrics: { latest: null, peak: null, count: 0 },
    topFailures: [], stats: { total: 0, byLevel: {}, skipped: 0 },
    sinceMs: 0,
  });
  api.diagnosticsFetchSamples.mockResolvedValue({ ok: true, samples: [] });
  api.configExport.mockResolvedValue({ ok: true, path: "" });
  api.selfUpdateGetState.mockResolvedValue({ ok: true, state: null });
  api.selfUpdateCheck.mockResolvedValue({ ok: true });
  api.selfUpdateInstall.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DiagnosticsPage 基础渲染", () => {
  it("渲染 title + subtitle", () => {
    const { container } = render(<DiagnosticsPage />);
    expect(container.textContent).toContain("错误诊断");
    expect(container.textContent).toContain("检测失败");
  });

  it("PageHeader 包含 刷新 / 复制全部 / 打开文件夹 / 返回应用库 按钮", () => {
    render(<DiagnosticsPage />);
    expect((() => document.body.textContent)()).toMatch(/刷新/);
    expect((() => document.body.textContent)()).toMatch(/复制全部/);
    expect((() => document.body.textContent)()).toMatch(/打开文件夹/);
    expect((() => document.body.textContent)()).toMatch(/返回应用库/);
  });

  it("mount 时拉 errorFetchEntries + diagnosticsFetch + diagnosticsFetchSamples", async () => {
    render(<DiagnosticsPage />);
    await waitFor(() => expect(api.errorFetchEntries).toHaveBeenCalled());
    await waitFor(() => expect(api.diagnosticsFetch).toHaveBeenCalled());
    expect(api.diagnosticsFetchSamples).toHaveBeenCalled();
  });
});

describe("DiagnosticsPage 数据展示", () => {
  it("无 entries 时显示空态", async () => {
    api.errorFetchEntries.mockResolvedValue({
      ok: true, entries: [],
      stats: { total: 0, byLevel: {}, skipped: 0 },
    });
    const { container } = render(<DiagnosticsPage />);
    await waitFor(() => {
      expect(container.textContent).toMatch(/一切正常/);
    });
  });

  it("entries 渲染一行一错误", async () => {
    api.errorFetchEntries.mockResolvedValue({
      ok: true,
      entries: [
        { id: "1", ts: Date.now(), source: "main", level: "error", message: "boom" },
        { id: "2", ts: Date.now(), source: "renderer", level: "warn", message: "soft fail" },
      ],
      stats: { total: 2, byLevel: { error: 1, warn: 1 } },
    });
    const { container } = render(<DiagnosticsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("boom");
      expect(container.textContent).toContain("soft fail");
    });
    // Phase 32: KPI 卡片显示分类计数 (替换原 "共 N 条 · error: x · warn: y" 一行)
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("error");
    expect(container.textContent).toContain("warn");
  });

  it("显示启动时间 ms", async () => {
    api.diagnosticsFetch.mockResolvedValue({
      ok: true,
      startup: { bootstrapMs: 120, readyMs: 480 },
      metrics: { latest: null, peak: null, count: 0 },
      topFailures: [],
      stats: { total: 0, byLevel: {}, skipped: 0 },
      sinceMs: 0,
    });
    const { container } = render(<DiagnosticsPage />);
    await waitFor(() => {
      expect(container.textContent).toMatch(/480\s*ms/);
      expect(container.textContent).toMatch(/120\s*ms/);
    });
  });

  it("显示 Top 5 failures + counts", async () => {
    api.diagnosticsFetch.mockResolvedValue({
      ok: true, startup: null,
      metrics: { latest: null, peak: null, count: 0 },
      topFailures: [
        { source: "main", message: "boom A", count: 5, firstTs: 1, lastTs: 9 },
        { source: "renderer", message: "boom B", count: 2, firstTs: 1, lastTs: 2 },
      ],
      stats: { total: 0, byLevel: {}, skipped: 0 },
      sinceMs: 0,
    });
    const { container } = render(<DiagnosticsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("5×");
      expect(container.textContent).toContain("2×");
      expect(container.textContent).toContain("boom A");
      expect(container.textContent).toContain("[main]");
    });
  });

  it("显示性能 metrics (heap / rss / cpu)", async () => {
    api.diagnosticsFetch.mockResolvedValue({
      ok: true, startup: null,
      metrics: {
        latest: { heapUsed: 12345, rss: 67890, cpuUser: 2000 },
        peak: { heapUsed: 22222, rss: 88888 },
        count: 30,
      },
      topFailures: [],
      stats: { total: 0, byLevel: {}, skipped: 0 },
      sinceMs: 0,
    });
    const { container } = render(<DiagnosticsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("heap");
      expect(container.textContent).toMatch(/rss/);
      expect(container.textContent).toContain("12.1 KB"); // 12345 bytes
      expect(container.textContent).toContain("近 30 个采样");
    });
  });

  it("samples > 1 渲染 trend bar", async () => {
    api.diagnosticsFetchSamples.mockResolvedValue({
      ok: true,
      samples: [
        { ts: 1, heapUsed: 100, rss: 500, cpuUser: 0 },
        { ts: 2, heapUsed: 200, rss: 600, cpuUser: 1 },
        { ts: 3, heapUsed: 300, rss: 700, cpuUser: 2 },
      ],
    });
    const { container } = render(<DiagnosticsPage />);
    await waitFor(() => {
      expect(container.querySelectorAll(".diag-trend__bar").length).toBe(3);
    });
  });
});

describe("DiagnosticsPage 操作按钮", () => {
  it("刷新按钮重新拉 errorFetchEntries", async () => {
    render(<DiagnosticsPage />);
    await waitFor(() => expect(api.errorFetchEntries).toHaveBeenCalledTimes(1));
    const refreshBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "刷新");
    fireEvent.click(refreshBtn);
    await waitFor(() => expect(api.errorFetchEntries).toHaveBeenCalledTimes(2));
  });

  it("复制全部按钮调 api.errorCopyAll", async () => {
    render(<DiagnosticsPage />);
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "复制全部");
    fireEvent.click(btn);
    await waitFor(() => expect(api.errorCopyAll).toHaveBeenCalled());
  });

  it("打开文件夹按钮调 api.errorOpenFolder", async () => {
    render(<DiagnosticsPage />);
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "打开文件夹");
    fireEvent.click(btn);
    await waitFor(() => expect(api.errorOpenFolder).toHaveBeenCalled());
  });

  it("清理 > 30 天按钮调 api.errorClearOld + 刷新", async () => {
    render(<DiagnosticsPage />);
    await waitFor(() => expect(api.errorFetchEntries).toHaveBeenCalled());
    const btn = Array.from(document.querySelectorAll("button")).find((b) => /清理.*30\s*天/.test(b.textContent));
    fireEvent.click(btn);
    await waitFor(() => expect(api.errorClearOld).toHaveBeenCalled());
  });

  it("导出诊断包按钮调 api.errorExportZip + 显示路径", async () => {
    api.errorExportZip.mockResolvedValue({
      ok: true,
      path: "/Users/me/Desktop/pulse-diagnostics-test.tar.gz",
      sizeBytes: 12345,
      fileCount: 4,
    });
    const { container } = render(<DiagnosticsPage />);
    const btn = Array.from(container.querySelectorAll("button")).find((b) => /导出 \.tar\.gz/.test(b.textContent));
    fireEvent.click(btn);
    await waitFor(() => expect(api.errorExportZip).toHaveBeenCalled());
    await waitFor(() => expect(diagnosticsLastExport.value).toMatchObject({
      path: "/Users/me/Desktop/pulse-diagnostics-test.tar.gz", fileCount: 4,
    }));
    await waitFor(() => {
      expect(container.textContent).toContain("pulse-diagnostics-test.tar.gz");
    });
  });

  it("导出失败显示错误", async () => {
    api.errorExportZip.mockResolvedValue({ ok: false, reason: "mkdir_failed" });
    const { container } = render(<DiagnosticsPage />);
    const btn = Array.from(container.querySelectorAll("button")).find((b) => /导出 \.tar\.gz/.test(b.textContent));
    fireEvent.click(btn);
    await waitFor(() => expect(diagnosticsLastExport.value).toMatchObject({ error: "mkdir_failed" }));
    await waitFor(() => {
      expect(container.textContent).toMatch(/导出失败.*mkdir_failed/);
    });
  });

  it("导出配置按钮调 api.configExport", async () => {
    api.configExport.mockResolvedValue({ ok: true, path: "/Users/me/Desktop/pulse-config-test.json" });
    const { container } = render(<DiagnosticsPage />);
    const btn = Array.from(container.querySelectorAll("button")).find((b) => /导出 \.json/.test(b.textContent));
    fireEvent.click(btn);
    await waitFor(() => expect(api.configExport).toHaveBeenCalled());
    await waitFor(() => {
      expect(container.textContent).toContain("pulse-config-test.json");
    });
  });

  it("返回应用库按钮 navigateTo('library')", async () => {
    render(<DiagnosticsPage />);
    const btn = Array.from(document.querySelectorAll("button")).find((b) => /返回应用库/.test(b.textContent));
    fireEvent.click(btn);
    expect(navigateTo).toHaveBeenCalledWith("library");
  });
});

describe("DiagnosticsPage 自更新状态", () => {
  it("无 update state 时不显示 self-update section", () => {
    api.selfUpdateGetState.mockResolvedValue({ ok: true, state: null });
    const { container } = render(<DiagnosticsPage />);
    expect(container.querySelector(".diag-card--update")).toBeFalsy();
  });

  it("available + downloaded 状态显示 退出并安装 按钮", async () => {
    api.selfUpdateGetState.mockResolvedValue({
      ok: true,
      state: { available: true, version: "2.50.0", status: "downloaded", downloadPercent: 100 },
    });
    const { container } = render(<DiagnosticsPage />);
    await waitFor(() => {
      expect(container.querySelector(".diag-card--update")).toBeTruthy();
      expect(container.textContent).toContain("Pulse 有新版 v2.50.0");
    });
    const installBtn = Array.from(container.querySelectorAll("button")).find((b) => /退出并安装/.test(b.textContent));
    expect(installBtn).toBeTruthy();
    fireEvent.click(installBtn);
    await waitFor(() => expect(api.selfUpdateInstall).toHaveBeenCalled());
  });

  it("downloading 状态显示百分比", async () => {
    api.selfUpdateGetState.mockResolvedValue({
      ok: true,
      state: { available: true, version: "2.50.0", status: "downloading", downloadPercent: 42 },
    });
    const { container } = render(<DiagnosticsPage />);
    await waitFor(() => {
      expect(container.textContent).toMatch(/下载\s*42\s*%/);
    });
  });
});

describe("DiagnosticsPage Phase 32 UI", () => {
  it("KPI 卡片显示 stats.total / byLevel", async () => {
    api.errorFetchEntries.mockResolvedValue({
      ok: true,
      entries: [],
      stats: { total: 9, byLevel: { error: 3, warn: 4, unhandled: 2 }, skipped: 0 },
    });
    const { container } = render(<DiagnosticsPage />);
    await waitFor(() => {
      const kpis = container.querySelectorAll("[data-testid^='diag-kpi-']:not([data-testid='diag-kpi-row'])");
      expect(kpis.length).toBe(4);
    });
    expect(container.querySelector("[data-testid='diag-kpi-总数']").textContent).toContain("9");
    expect(container.querySelector("[data-testid='diag-kpi-error']").textContent).toContain("3");
    expect(container.querySelector("[data-testid='diag-kpi-warn']").textContent).toContain("4");
    expect(container.querySelector("[data-testid='diag-kpi-unhandled']").textContent).toContain("2");
  });

  it("error > 0 时 KPI 卡片用 danger 样式", async () => {
    api.errorFetchEntries.mockResolvedValue({
      ok: true, entries: [],
      stats: { total: 1, byLevel: { error: 1 }, skipped: 0 },
    });
    const { container } = render(<DiagnosticsPage />);
    await waitFor(() => {
      expect(container.querySelector("[data-testid='diag-kpi-error']").classList.contains("kpi-card--danger")).toBe(true);
    });
  });

  it("按 level 筛选 chips 过滤 entries", async () => {
    api.errorFetchEntries.mockResolvedValue({
      ok: true,
      entries: [
        { id: "1", ts: Date.now(), source: "main", level: "error", message: "boom" },
        { id: "2", ts: Date.now(), source: "renderer", level: "warn", message: "soft fail" },
        { id: "3", ts: Date.now(), source: "main", level: "unhandled", message: "crashed" },
      ],
      stats: { total: 3, byLevel: { error: 1, warn: 1, unhandled: 1 }, skipped: 0 },
    });
    const { container } = render(<DiagnosticsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("boom");
    });
    fireEvent.click(container.querySelector("[data-testid='diag-filter-warn']"));
    await waitFor(() => {
      expect(container.textContent).toContain("soft fail");
      expect(container.textContent).not.toContain("boom");
      expect(container.textContent).not.toContain("crashed");
    });
    expect(container.querySelector("[data-testid='diag-filter-warn']").getAttribute("aria-selected")).toBe("true");
  });

  it("搜索框按 message 子串过滤 entries", async () => {
    api.errorFetchEntries.mockResolvedValue({
      ok: true,
      entries: [
        { id: "1", ts: Date.now(), source: "main", level: "error", message: "disk full" },
        { id: "2", ts: Date.now(), source: "main", level: "error", message: "network timeout" },
      ],
      stats: { total: 2, byLevel: { error: 2 }, skipped: 0 },
    });
    const { container } = render(<DiagnosticsPage />);
    const search = container.querySelector("[data-testid='diag-entries-search']");
    fireEvent.input(search, { target: { value: "network" } });
    await waitFor(() => {
      expect(container.textContent).toContain("network timeout");
      expect(container.textContent).not.toContain("disk full");
    });
  });

  it("默认按时间倒序展示 entries", async () => {
    api.errorFetchEntries.mockResolvedValue({
      ok: true,
      entries: [
        { id: "1", ts: 1000, source: "main", level: "error", message: "older" },
        { id: "2", ts: 2000, source: "main", level: "error", message: "newer" },
      ],
      stats: { total: 2, byLevel: { error: 2 }, skipped: 0 },
    });
    const { container } = render(<DiagnosticsPage />);
    await waitFor(() => {
      const list = container.querySelector(".diag-entries");
      expect(list).toBeTruthy();
      const items = list.querySelectorAll(".error-entry");
      expect(items.length).toBe(2);
      expect(items[0].textContent).toContain("newer");
      expect(items[1].textContent).toContain("older");
    });
  });
});