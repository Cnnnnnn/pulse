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
  it("AI 未跑: RiskCard 用 computeBasicRisks 规则版 (PE 偏高 → 估值风险)", () => {
    const { container } = render(
      <ModuleGrid
        perAngleData={{
          valuation: { status: "ok", data: { pe: 80, pb: 5 } },
        }}
        aiResult={null}
      />,
    );
    const text = container.textContent;
    expect(text).toContain("风险提示");
    expect(text).toContain("PE 80");
    expect(text).toContain("估值");
  });
  it("AI 跑了: 基础 + AI risks 合并去重", () => {
    const { container } = render(
      <ModuleGrid
        perAngleData={{
          valuation: { status: "ok", data: { pe: 80 } },
        }}
        aiResult={{ risks: ["PE 80 偏高, 估值天花板受限", "政策风险"] }}
      />,
    );
    const text = container.textContent;
    // 基础版 "PE 80 偏高" 跟 AI 重复 → 只留一条; 政策风险 (基础没) → 保留
    expect(text).toContain("政策风险");
    // 重复项应该被去重, 不会重复出现
    const matches = (text.match(/PE 80 偏高/g) || []).length;
    expect(matches).toBeLessThanOrEqual(1);
  });
});
