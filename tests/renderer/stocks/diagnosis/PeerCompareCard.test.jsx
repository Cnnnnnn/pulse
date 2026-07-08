// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { PeerCompareCard } from "../../../../src/renderer/stocks/diagnosis/PeerCompareCard.jsx";

describe("PeerCompareCard", () => {
  it("data 缺失显示「数据不足」", () => {
    const { container } = render(<PeerCompareCard data={null} />);
    expect(container.textContent).toContain("同业对比");
    expect(container.textContent).toContain("数据不足");
  });
  it("status=ok 渲染 PE/PB 分位 + 估值状态 + 行业中位", () => {
    const { container } = render(
      <PeerCompareCard
        data={{
          status: "ok",
          fetchedAt: Date.now(),
          data: {
            industry: "元件",
            pe: 50,
            pePercentile: 90.5,
            peValuationStatus: "估值较高",
            pb: 5,
            pbPercentile: 30,
            pbValuationStatus: "估值较低",
            roeIndustryMedian: 3.2,
            grossMarginIndustryMedian: 18.5,
          },
        }}
      />,
    );
    const text = container.textContent;
    expect(text).toContain("同业对比");
    expect(text).toContain("元件");
    expect(text).toContain("PE 分位");
    expect(text).toContain("PB 分位");
    expect(text).toContain("估值较高");
    expect(text).toContain("估值较低");
    expect(text).toContain("3.2%"); // ROE 中位
    expect(text).toContain("18.5%"); // 毛利率中位
  });
  it("status=failed 同样显示「数据不足」", () => {
    const { container } = render(
      <PeerCompareCard data={{ status: "failed", reason: "no_industry_data" }} />,
    );
    expect(container.textContent).toContain("数据不足");
  });
});