// @vitest-environment happy-dom
/**
 * tests/renderer/overview-kpi-wall.test.jsx
 *
 * v2.50 (T1): OverviewKPIWall — 列 1: 4 数字渐进式 KPI 墙.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { OverviewKPIWall } from "../../src/renderer/components/OverviewKPIWall.jsx";

describe("OverviewKPIWall", () => {
  let kpis;
  beforeEach(() => {
    kpis = signal({ upgradable: 3, latest: 7, error: 1, total: 11 });
  });

  it("renders 4 KPI numbers with progressive sizing", () => {
    const { container } = render(<OverviewKPIWall kpis={kpis} />);
    const numbers = container.querySelectorAll(".kpi-number");
    expect(numbers).toHaveLength(4);
    // First (upgradable) is largest
    expect(numbers[0].className).toContain("kpi-number-large");
    expect(numbers[1].className).toContain("kpi-number-small");
  });

  it("displays correct values from signal", () => {
    const { container } = render(<OverviewKPIWall kpis={kpis} />);
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("7");
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("11");
  });

  it("updates when kpis signal changes", () => {
    const { container } = render(<OverviewKPIWall kpis={kpis} />);
    act(() => {
      kpis.value = { upgradable: 5, latest: 6, error: 0, total: 11 };
    });
    expect(container.textContent).toContain("5");
  });

  it("uses CSS tokens, no hardcoded colors", () => {
    const { container } = render(<OverviewKPIWall kpis={kpis} />);
    const style = container.innerHTML;
    expect(style).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});
