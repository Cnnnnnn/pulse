// @vitest-environment happy-dom
/**
 * tests/renderer/AIInsightsBlock.test.jsx
 *
 * Task 17: AIInsightsBlock — AI 摘要状态机 (idle/loading/ready/error).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/preact";
import { AIInsightsBlock } from "../../src/renderer/components/AIInsightsBlock.jsx";
import { setAiInsights } from "../../src/renderer/overview-store.js";

beforeEach(() => setAiInsights({ status: "idle", text: "", fromCache: false }));

describe("AIInsightsBlock", () => {
  it("idle 显示 —", () => {
    render(<AIInsightsBlock />);
    expect(screen.getByText("—")).toBeTruthy();
  });
  it("ready 显示 text + 缓存标记", () => {
    setAiInsights({ status: "ready", text: "本周升级活跃", fromCache: true });
    render(<AIInsightsBlock />);
    expect(screen.getByText("本周升级活跃")).toBeTruthy();
    expect(screen.getByText("缓存")).toBeTruthy();
  });
  it("error 显示重试", () => {
    setAiInsights({ status: "error", text: "", fromCache: false });
    render(<AIInsightsBlock />);
    expect(screen.getByText("重试")).toBeTruthy();
  });
});