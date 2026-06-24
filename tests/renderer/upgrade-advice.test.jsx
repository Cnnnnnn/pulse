// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/preact";
import { UpgradeAdvice } from "../../src/renderer/components/UpgradeAdvice.jsx";
import { api } from "../../src/renderer/api.js";

describe("UpgradeAdvice", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("有更新时显示触发按钮", () => {
    const { container } = render(<UpgradeAdvice appName="Cursor" hasUpdate />);
    expect(container.textContent).toContain("该不该升");
  });

  it("点击后调用 upgradeAdviceFetch 并显示建议", async () => {
    vi.spyOn(api, "upgradeAdviceFetch").mockResolvedValue({
      ok: true,
      recommendation: "upgrade",
      summary: "修复了关键崩溃",
      reasons: ["安全"],
    });
    const { container } = render(<UpgradeAdvice appName="Cursor" hasUpdate />);
    fireEvent.click(container.querySelector(".upgrade-advice-trigger"));
    await waitFor(() => {
      expect(api.upgradeAdviceFetch).toHaveBeenCalledWith({ appName: "Cursor", force: false });
      expect(container.textContent).toContain("建议升级");
      expect(container.textContent).toContain("修复了关键崩溃");
    });
  });

  it("无更新不渲染", () => {
    const { container } = render(<UpgradeAdvice appName="Cursor" hasUpdate={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("confidence=high 时显示对应 badge class", async () => {
    vi.spyOn(api, "upgradeAdviceFetch").mockResolvedValue({
      ok: true,
      recommendation: "upgrade",
      confidence: "high",
      summary: "安全升级",
      reasons: ["安全"],
    });
    const { container } = render(<UpgradeAdvice appName="Cursor" hasUpdate />);
    fireEvent.click(container.querySelector(".upgrade-advice-trigger"));
    await waitFor(() => {
      const dot = container.querySelector(".upgrade-advice-confidence");
      expect(dot).toBeTruthy();
      expect(dot.className).toContain("upgrade-advice-confidence--high");
      expect(dot.getAttribute("aria-label")).toBe("confidence-high");
    });
  });

  it("confidence=low 时显示对应 badge class", async () => {
    vi.spyOn(api, "upgradeAdviceFetch").mockResolvedValue({
      ok: true,
      recommendation: "skip",
      confidence: "low",
      summary: "信息不足",
      reasons: [],
    });
    const { container } = render(<UpgradeAdvice appName="Cursor" hasUpdate />);
    fireEvent.click(container.querySelector(".upgrade-advice-trigger"));
    await waitFor(() => {
      const dot = container.querySelector(".upgrade-advice-confidence");
      expect(dot.className).toContain("upgrade-advice-confidence--low");
    });
  });

  it("↻ 按钮带 'AI 配额' tooltip 提示 force 重生成", async () => {
    vi.spyOn(api, "upgradeAdviceFetch").mockResolvedValue({
      ok: true,
      recommendation: "wait",
      confidence: "medium",
      summary: "可等",
      reasons: ["非关键"],
    });
    const { container } = render(<UpgradeAdvice appName="Cursor" hasUpdate />);
    fireEvent.click(container.querySelector(".upgrade-advice-trigger"));
    await waitFor(() => {
      const refresh = container.querySelector(".upgrade-advice-refresh");
      expect(refresh.getAttribute("title")).toContain("AI 配额");
    });
  });
});
