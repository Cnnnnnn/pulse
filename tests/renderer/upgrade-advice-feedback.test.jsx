// @vitest-environment happy-dom
/**
 * A8 Task 5: UpgradeAdvice 👍/👎 反馈按钮.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/preact";
import { UpgradeAdvice } from "../../src/renderer/components/UpgradeAdvice.jsx";
import { api } from "../../src/renderer/api.js";

describe("UpgradeAdvice 反馈按钮", () => {
  beforeEach(() => {
    cleanup();
    vi.spyOn(api, "upgradeAdviceFetch").mockResolvedValue({
      ok: true,
      recommendation: "upgrade",
      confidence: "high",
      summary: "建议升",
      reasons: ["安全修复"],
      generatedAt: Date.now(),
      latestVersion: "2.0",
    });
    vi.spyOn(api, "feedbackRecord").mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("结果态显示 👍 / 👎 两个按钮", async () => {
    const { container } = render(<UpgradeAdvice appName="VSCode" hasUpdate />);
    fireEvent.click(container.querySelector(".upgrade-advice-trigger"));
    await waitFor(() => {
      expect(container.textContent).toContain("建议升级");
    });
    expect(container.querySelector('[aria-label="feedback-up"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="feedback-down"]')).toBeTruthy();
  });

  it("点 👍 调用 feedbackRecord 带 feature=advice + 当前 advice 字段", async () => {
    const { container } = render(<UpgradeAdvice appName="VSCode" hasUpdate />);
    fireEvent.click(container.querySelector(".upgrade-advice-trigger"));
    await waitFor(() => {
      expect(container.querySelector('[aria-label="feedback-up"]')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('[aria-label="feedback-up"]'));
    await waitFor(() => expect(api.feedbackRecord).toHaveBeenCalled());
    const arg = api.feedbackRecord.mock.calls[0][0];
    expect(arg.feature).toBe("advice");
    expect(arg.appName).toBe("VSCode");
    expect(arg.version).toBe("2.0");
    expect(arg.rec).toBe("upgrade");
    expect(arg.confidence).toBe("high");
    expect(arg.vote).toBe("up");
    expect(typeof arg.ts).toBe("number");
  });

  it("点过之后按钮 disabled, 防重复提交", async () => {
    const { container } = render(<UpgradeAdvice appName="VSCode" hasUpdate />);
    fireEvent.click(container.querySelector(".upgrade-advice-trigger"));
    await waitFor(() => {
      expect(container.querySelector('[aria-label="feedback-up"]')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('[aria-label="feedback-up"]'));
    await waitFor(() => expect(api.feedbackRecord).toHaveBeenCalledTimes(1));
    fireEvent.click(container.querySelector('[aria-label="feedback-up"]'));
    expect(api.feedbackRecord).toHaveBeenCalledTimes(1); // 不再触发
  });

  it("点 👬 down 也记录", async () => {
    const { container } = render(<UpgradeAdvice appName="VSCode" hasUpdate />);
    fireEvent.click(container.querySelector(".upgrade-advice-trigger"));
    await waitFor(() => {
      expect(container.querySelector('[aria-label="feedback-down"]')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('[aria-label="feedback-down"]'));
    await waitFor(() => expect(api.feedbackRecord).toHaveBeenCalled());
    expect(api.feedbackRecord.mock.calls[0][0].vote).toBe("down");
  });

  it("force 刷新(↻)记录一条 implicit=refreshed 隐式信号", async () => {
    const { container } = render(<UpgradeAdvice appName="VSCode" hasUpdate />);
    // 先拉一次出结果
    fireEvent.click(container.querySelector(".upgrade-advice-trigger"));
    await waitFor(() => {
      expect(container.querySelector(".upgrade-advice-refresh")).toBeTruthy();
    });
    // 清掉前面 fetch 不该记的调用
    api.feedbackRecord.mockClear();
    // 点 ↻ force 重生成
    fireEvent.click(container.querySelector(".upgrade-advice-refresh"));
    await waitFor(() => {
      const refreshedCall = api.feedbackRecord.mock.calls.find(
        (c) => c[0] && c[0].implicit === "refreshed"
      );
      expect(refreshedCall).toBeTruthy();
      expect(refreshedCall[0].feature).toBe("advice");
      expect(refreshedCall[0].appName).toBe("VSCode");
    });
  });
});
