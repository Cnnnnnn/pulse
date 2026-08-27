import { describe, it, expect } from "vitest";
const { requireMain } = require("../_setup/require-main.cjs");
const {
  detectConcertPriceDrops,
  formatConcertDropNotification,
} = requireMain("concerts/price-alerts");

function snap(sessions: any[], title = "测试演出") {
  return {
    title,
    detailUrl: "https://www.piaoniu.com/activity/1",
    sessions,
    fetchedAt: 1,
  };
}

describe("detectConcertPriceDrops", () => {
  it("无钉选：场次 minPrice 下跌 → 一条；上涨/持平忽略", () => {
    const watches = [{ id: "piaoniu:1", platform: "piaoniu" }];
    const drops = detectConcertPriceDrops({
      watches,
      prevSnapshots: {
        "piaoniu:1": snap([
          { id: "e1", name: "周五", minPrice: "300" },
          { id: "e2", name: "周六", minPrice: "400" },
        ]),
      },
      nextSnapshots: {
        "piaoniu:1": snap([
          { id: "e1", name: "周五", minPrice: "280" },
          { id: "e2", name: "周六", minPrice: "420" },
        ]),
      },
    });
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({
      label: "周五",
      before: 300,
      after: 280,
    });
  });

  it("有钉选：只比钉选档×张数单价；未钉选场次降价不报", () => {
    const tier = (id: string, name: string, q1: string, q2: string) => ({
      id,
      name,
      lowPrice: q1,
      hasTicket: true,
      qtyPrices: [
        { qty: 1, salePrice: q1 },
        { qty: 2, salePrice: q2 },
      ],
    });
    const watches = [
      {
        id: "piaoniu:1",
        platform: "piaoniu",
        watchedTierIds: ["t-a"],
        watchedTierQty: { "t-a": 2 },
      },
    ];
    const drops = detectConcertPriceDrops({
      watches,
      prevSnapshots: {
        "piaoniu:1": snap([
          {
            id: "e1",
            name: "周五",
            minPrice: "280",
            tiers: [tier("t-a", "内场1080", "548", "600"), tier("t-b", "看台", "280", "300")],
          },
        ]),
      },
      nextSnapshots: {
        "piaoniu:1": snap([
          {
            id: "e1",
            name: "周五",
            minPrice: "200", // 整场也降了，但有钉选则不看这个
            tiers: [tier("t-a", "内场1080", "548", "560"), tier("t-b", "看台", "200", "250")],
          },
        ]),
      },
    });
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({
      label: "内场1080（2张）",
      before: 600,
      after: 560,
    });
  });

  it("本轮 error / 缺 prev → 空", () => {
    expect(
      detectConcertPriceDrops({
        watches: [{ id: "piaoniu:1" }],
        prevSnapshots: { "piaoniu:1": snap([{ id: "e1", minPrice: "1" }]) },
        nextSnapshots: { "piaoniu:1": { ...snap([]), error: "fetch_failed" } },
      }),
    ).toEqual([]);
    expect(
      detectConcertPriceDrops({
        watches: [{ id: "piaoniu:1" }],
        prevSnapshots: {},
        nextSnapshots: { "piaoniu:1": snap([{ id: "e1", minPrice: "1" }]) },
      }),
    ).toEqual([]);
  });
});

describe("formatConcertDropNotification", () => {
  it("单条 / 多条截断", () => {
    const one = formatConcertDropNotification([
      { watchId: "a", title: "短标题", label: "看台（1张）", before: 300, after: 280 },
    ]);
    expect(one.title).toBe("演出票降价");
    expect(one.body).toContain("¥300 → ¥280");

    const many = formatConcertDropNotification(
      [1, 2, 3, 4].map((i) => ({
        watchId: String(i),
        title: "x".repeat(40),
        label: `档${i}`,
        before: 10,
        after: 9,
      })),
    );
    expect(many.title).toBe("演出票降价（4）");
    expect(many.body).toContain("另有 1 处");
  });
});
