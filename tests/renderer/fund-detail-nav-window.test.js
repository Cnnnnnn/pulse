import { describe, it, expect } from "vitest";
import { pickNavHistoryWindow } from "../../src/renderer/funds/FundDetail.jsx";

describe("pickNavHistoryWindow", () => {
  const rows = [
    { date: "2019-06-19", nav: 1.0, dailyChange: null },
    { date: "2019-06-20", nav: 1.01, dailyChange: 1 },
    { date: "2026-07-13", nav: 5.4, dailyChange: -0.5 },
    { date: "2026-07-14", nav: 5.5, dailyChange: 1.85 },
  ];

  it("近 N 日取末尾 (最近), 不是开头的 2019", () => {
    const out = pickNavHistoryWindow(rows, 2);
    expect(out.map((r) => r.date)).toEqual(["2026-07-14", "2026-07-13"]);
  });

  it("累计相对区间首日 (窗口内最老)", () => {
    const out = pickNavHistoryWindow(rows, 2);
    // 窗口升序首日 = 2026-07-13 nav 5.4; 最新 5.5 → (5.5-5.4)/5.4
    expect(out[0].cumulativeChange).toBeCloseTo(((5.5 - 5.4) / 5.4) * 100, 5);
    expect(out[1].cumulativeChange).toBeCloseTo(0, 5);
  });

  it("全部截到 maxRows, 仍是最新在上", () => {
    const out = pickNavHistoryWindow(rows, null, 3);
    expect(out).toHaveLength(3);
    expect(out[0].date).toBe("2026-07-14");
    expect(out[2].date).toBe("2019-06-20");
  });
});
