// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";

const api = vi.hoisted(() => ({
  selfUpdateGetState: vi.fn(async () => ({
    ok: true,
    state: {
      status: "idle",
      available: false,
      version: null,
      releaseNotes: null,
      downloadPercent: 0,
      readyToInstall: false,
      error: null,
      lastCheckedAt: null,
    },
  })),
  selfUpdateCheck: vi.fn(async () => ({ ok: true })),
  selfUpdateInstall: vi.fn(async () => ({ ok: true })),
  errorFetchEntries: vi.fn(async () => ({ ok: true, entries: [], stats: { byLevel: {} } })),
  diagnosticsFetch: vi.fn(async () => ({ ok: true, startup: null, metrics: {}, topFailures: [] })),
  diagnosticsFetchSamples: vi.fn(async () => ({ ok: true, samples: [] })),
}));

vi.mock("../../src/renderer/api.ts", () => ({ api }));
vi.mock("../../src/renderer/components/PageHeader.tsx", () => ({
  PageHeader: ({ title, children }) => <header><h1>{title}</h1>{children}</header>,
}));
vi.mock("../../src/renderer/components/ConfigImportModal.tsx", () => ({ ConfigImportModal: () => null }));
vi.mock("../../src/renderer/components/EmptyState.tsx", () => ({ PanelEmpty: () => null }));
vi.mock("../../src/renderer/components/KPICard.tsx", () => ({ KPICard: () => null }));
vi.mock("../../src/renderer/components/Badge.tsx", () => ({ StatusBadge: () => null }));
vi.mock("../../src/renderer/components/icons.tsx", () => ({ IconCheck: () => null }));

import { DiagnosticsPage } from "../../src/renderer/components/DiagnosticsPage.tsx";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("DiagnosticsPage self-update", () => {
  it("无更新时仍显示 Pulse 自更新卡片和检查入口", async () => {
    render(<DiagnosticsPage />);

    await waitFor(() => expect(screen.getByText("Pulse 自更新")).toBeTruthy());
    expect(screen.getByRole("button", { name: "检查新版本" })).toBeTruthy();
    expect(screen.getByText("当前没有可用更新")).toBeTruthy();
  });

  it("点击检查新版本时调用 selfUpdateCheck", async () => {
    render(<DiagnosticsPage />);
    const button = await screen.findByRole("button", { name: "检查新版本" });

    fireEvent.click(button);

    await waitFor(() => expect(api.selfUpdateCheck).toHaveBeenCalledTimes(1));
  });

  it("有检查记录时显示上次检查时间", async () => {
    api.selfUpdateGetState.mockResolvedValueOnce({
      ok: true,
      state: {
        status: "idle",
        available: false,
        version: null,
        releaseNotes: null,
        downloadPercent: 0,
        readyToInstall: false,
        error: null,
        lastCheckedAt: 1_700_000_000_000,
      },
    });

    render(<DiagnosticsPage />);

    await waitFor(() => expect(screen.getByText(/上次检查：/)).toBeTruthy());
  });
});
