// @vitest-environment happy-dom
/**
 * tests/renderer/AIDrawerShell.test.jsx
 *
 * Task 20: AIDrawerShell — 共享 AI 抽屉外壳 (480px 右侧 + focus trap + esc + click-outside).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/preact";
import { AIDrawerShell } from "../../src/renderer/components/AIDrawerShell.jsx";

afterEach(() => cleanup());

describe("AIDrawerShell", () => {
  it("open=false 不渲染", () => {
    const { container } = render(<AIDrawerShell open={false} onClose={() => {}} title="AI" />);
    expect(container.querySelector(".ai-drawer-shell")).toBeFalsy();
  });
  it("open=true 渲染 title + children", () => {
    render(
      <AIDrawerShell open onClose={() => {}} title="AI 任务">
        <div class="child">content</div>
      </AIDrawerShell>
    );
    expect(screen.getByText("AI 任务")).toBeTruthy();
    expect(screen.getByText("content")).toBeTruthy();
  });
  it("Esc 触发 onClose", () => {
    const onClose = vi.fn();
    render(<AIDrawerShell open onClose={onClose} title="AI" />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
