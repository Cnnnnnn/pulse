// @vitest-environment happy-dom
/**
 * A8 Task 6: ChangelogSummary 👍/👎 反馈按钮.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/preact";
import { ChangelogSummary } from "../../src/renderer/components/ChangelogSummary.jsx";
import { api } from "../../src/renderer/api.js";

describe("ChangelogSummary 反馈按钮", () => {
  beforeEach(() => {
    cleanup();
    vi.spyOn(api, "changelogSummaryFetch").mockResolvedValue({
      ok: true,
      oneLiner: "安全修复",
      highlights: ["安全修复"],
      generatedAt: Date.now(),
    });
    vi.spyOn(api, "feedbackRecord").mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("结果态显示 IconThumbsUp / IconThumbsDown", async () => {
    const { container } = render(<ChangelogSummary appName="VSCode" />);
    fireEvent.click(container.querySelector(".changelog-summary-trigger"));
    await waitFor(() => {
      expect(container.textContent).toContain("本版要点");
    });
    expect(container.querySelector('[aria-label="feedback-up"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="feedback-down"]')).toBeTruthy();
  });

  it("点 IconThumbsUp 带 feature=summary", async () => {
    const { container } = render(<ChangelogSummary appName="VSCode" />);
    fireEvent.click(container.querySelector(".changelog-summary-trigger"));
    await waitFor(() => {
      expect(container.querySelector('[aria-label="feedback-up"]')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('[aria-label="feedback-up"]'));
    await waitFor(() => expect(api.feedbackRecord).toHaveBeenCalled());
    const arg = api.feedbackRecord.mock.calls[0][0];
    expect(arg.feature).toBe("summary");
    expect(arg.appName).toBe("VSCode");
    expect(arg.vote).toBe("up");
  });

  it("点 IconThumbsDown 也记录", async () => {
    const { container } = render(<ChangelogSummary appName="VSCode" />);
    fireEvent.click(container.querySelector(".changelog-summary-trigger"));
    await waitFor(() => {
      expect(container.querySelector('[aria-label="feedback-down"]')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('[aria-label="feedback-down"]'));
    await waitFor(() => expect(api.feedbackRecord).toHaveBeenCalled());
    expect(api.feedbackRecord.mock.calls[0][0].vote).toBe("down");
  });
});
