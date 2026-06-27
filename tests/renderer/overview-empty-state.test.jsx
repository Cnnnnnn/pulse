// @vitest-environment happy-dom
/**
 * tests/renderer/overview-empty-state.test.jsx
 *
 * v2.50 (T4): OverviewEmptyState — 首次启动 CTA 大按钮.
 * 输入 onRunCheck + isLoading, 输出 button (含 aria-label + aria-busy).
 * 无 state, 无副作用, 不直连 IPC (T5 接线).
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { OverviewEmptyState } from "../../src/renderer/components/OverviewEmptyState.jsx";

describe("OverviewEmptyState", () => {
  it("renders CTA button with aria-label", () => {
    const { container } = render(<OverviewEmptyState onRunCheck={() => {}} isLoading={false} />);
    const btn = container.querySelector("button");
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-label")).toMatch(/检查/);
  });

  it("calls onRunCheck when button clicked", () => {
    const onRunCheck = vi.fn();
    const { container } = render(<OverviewEmptyState onRunCheck={onRunCheck} isLoading={false} />);
    fireEvent.click(container.querySelector("button"));
    expect(onRunCheck).toHaveBeenCalledTimes(1);
  });

  it("shows loading state with aria-busy", () => {
    const { container } = render(<OverviewEmptyState onRunCheck={() => {}} isLoading={true} />);
    const btn = container.querySelector("button");
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.disabled).toBe(true);
  });
});