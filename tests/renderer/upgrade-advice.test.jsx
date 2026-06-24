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
});
