// @vitest-environment happy-dom
/**
 * tests/renderer/KPICard.test.jsx
 *
 * Task 16: KPICard — Overview 单个 KPI 卡片 (label + value + variant).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { KPICard } from "../../src/renderer/components/KPICard.jsx";

describe("KPICard", () => {
  it("渲染 label + value", () => {
    render(<KPICard label="可升级" value={3} variant="warning" />);
    expect(screen.getByText("可升级")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });
  it("variant 影响 class", () => {
    const { container } = render(<KPICard label="最新" value={5} variant="success" />);
    expect(container.querySelector(".kpi-card").className).toContain("kpi-card--success");
  });
});