// @vitest-environment happy-dom
/**
 * 守护 ChangelogSummary trigger 文案 + 反馈按钮已删除 (Phase 32 后改名 + 删 ✓ / ✕).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/preact";
import { ChangelogSummary } from "../../src/renderer/components/ChangelogSummary.jsx";
import { api } from "../../src/renderer/api.js";

describe("ChangelogSummary 文案 + 无反馈按钮 (2026-06-28)", () => {
  afterEach(() => cleanup());

  it("trigger 文案是「AI 摘要」而不是「3 件大事」", () => {
    const { container } = render(<ChangelogSummary appName="X" />);
    const trigger = container.querySelector(".changelog-summary-trigger");
    expect(trigger).toBeTruthy();
    // 新文案
    expect(trigger.textContent).toContain("AI 摘要");
    // 旧文案已退役 (用户反馈 "3件大事" 叫法不对)
    expect(trigger.textContent).not.toContain("3 件大事");
    expect(trigger.textContent).not.toContain("3件大事");
  });

  it("结果态不渲染反馈按钮 (用户反馈 ✓/✕ 没啥意义, 整个去掉)", async () => {
    api.changelogSummaryFetch = async () => ({
      ok: true,
      oneLiner: "安全修复",
      highlights: ["安全修复"],
      generatedAt: Date.now(),
    });
    const { container } = render(<ChangelogSummary appName="X" />);
    fireEvent.click(container.querySelector(".changelog-summary-trigger"));
    await waitFor(() => {
      expect(container.querySelector(".changelog-summary-oneliner")).toBeTruthy();
    });
    // 反馈按钮 / span 容器整个不存在
    expect(container.querySelector(".changelog-summary-feedback")).toBeFalsy();
    expect(container.querySelector('[aria-label="feedback-up"]')).toBeFalsy();
    expect(container.querySelector('[aria-label="feedback-down"]')).toBeFalsy();
  });
});