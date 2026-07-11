import { describe, it, expect } from "vitest";
import { buildSparklinePoints } from "../../src/renderer/funds/FundCardSparkline.jsx";

describe("buildSparklinePoints", () => {
  it("把数值数组映射成升序折线点", () => {
    const pts = buildSparklinePoints([1, 2, 3], 100, 24);
    expect(pts.length).toBe(3);
    expect(pts[0].x).toBeLessThan(pts[2].x);
  });
  it("空数组返回空", () => {
    expect(buildSparklinePoints([], 100, 24)).toEqual([]);
  });
});
