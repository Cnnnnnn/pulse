// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { ModuleGrid } from "../../../../src/renderer/stocks/diagnosis/ModuleGrid.jsx";

describe("ModuleGrid", () => {
  it("数据齐全渲染各模块", () => {
    const { container } = render(
      <ModuleGrid
        perAngleData={{
          profitability: { status: "ok", data: { roe: 24 } },
        }}
        aiResult={{ risks: ["汇率风险"] }}
      />,
    );
    expect(container.textContent).toContain("ROE");
    expect(container.textContent).toContain("汇率风险");
  });
  it("angle 缺失显示「数据不足」", () => {
    const { container } = render(<ModuleGrid perAngleData={{}} aiResult={{}} />);
    expect(container.textContent).toContain("数据不足");
  });
});
