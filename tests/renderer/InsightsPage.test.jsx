// @vitest-environment happy-dom
/**
 * tests/renderer/InsightsPage.test.jsx
 *
 * Task 19: InsightsPage — 空壳, 渲染 PageHeader title + AIInsightsBlock.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/preact";
import { InsightsPage } from "../../src/renderer/components/InsightsPage.jsx";
import { setAiInsights } from "../../src/renderer/overview-store.js";

beforeEach(() => setAiInsights({ status: "idle", text: "", fromCache: false }));

describe("InsightsPage", () => {
  it("渲染 title + AIInsightsBlock", () => {
    render(<InsightsPage />);
    expect(screen.getByText("AI 洞察")).toBeTruthy();
    expect(screen.getByText("AI 摘要")).toBeTruthy();
  });
});