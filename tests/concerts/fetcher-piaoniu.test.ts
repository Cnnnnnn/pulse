import { describe, it, expect } from "vitest";
const { requireMain } = require("../_setup/require-main.cjs");
const {
  fetchPiaoniuActivity,
  fetchPiaoniuTiers,
  fetchPiaoniuQtyPrices,
  normalizePiaoniuActivity,
  normalizePiaoniuEvents,
  normalizePiaoniuTiers,
  normalizePiaoniuQtyPrices,
  normalizePiaoniuEventStatus,
  tierPriceForQty,
} = requireMain("concerts/fetcher-piaoniu");

function okClient(bodyObj: any, status = 200) {
  return {
    get: async () => ({ status, body: JSON.stringify(bodyObj) }),
    post: async () => ({ status, body: JSON.stringify(bodyObj) }),
  };
}
function errClient(err: string) {
  return {
    get: async () => ({ error: err }),
    post: async () => ({ error: err }),
  };
}

// 票牛 /api/v1/activities/{id} 实测返回结构（2026-08 邓紫棋深圳场裁剪）
// 注意：priceLowest 实测是「最低价保证」布尔标志，不是价格
const ACTIVITY_FIXTURE = {
  id: 778118,
  name: "[深圳]G.E.M.邓紫棋 I AM GLORIA世界巡回演唱会2.0",
  cityName: "深圳",
  venue: { name: "深圳大运中心体育场" },
  posterUrl: "https://img.piaoniu.com/x.jpg",
  events: [
    {
      id: 14938568,
      specification: "2026-10-01 周四 19:30",
      start: 1791799800000,
      end: null,
      status: 6,
      lowPrice: 1348.0,
      priceLowest: false,
      hasTicket: true,
      ticketsNumber: 12,
    },
    { id: 14938569, specification: "2026-10-02 周五 19:30", start: null, status: 2, lowPrice: null, hasTicket: false },
    {},
  ],
};

describe("fetchPiaoniuActivity", () => {
  it("成功 → 归一化快照（场次/价格/状态/缺票）", async () => {
    const http = okClient(ACTIVITY_FIXTURE);
    const snap = await fetchPiaoniuActivity({ httpClient: http, activityId: 778118 });
    expect(snap.platform).toBe("piaoniu");
    expect(snap.key).toBe("piaoniu:778118");
    expect(snap.title).toContain("邓紫棋");
    expect(snap.city).toBe("深圳");
    expect(snap.detailUrl).toBe("https://www.piaoniu.com/activity/778118");
    expect(snap.sessions).toHaveLength(2); // 空对象被跳过
    const first = snap.sessions[0];
    expect(first.id).toBe("14938568");
    // minPrice 直接取 lowPrice（priceLowest 是布尔标志不参与）
    expect(first.minPrice).toBe("1348");
    expect(first.status).toBe("ONSALE"); // status=6
    expect(first.hasTicket).toBe(true);
    expect(secondOf(snap)).toMatchObject({ status: "ENDED", hasTicket: false });
  });

  it("httpClient 缺失 → fetch_failed", async () => {
    await expect(fetchPiaoniuActivity({ activityId: 1 })).rejects.toMatchObject({
      reason: "fetch_failed",
    });
  });

  it("activityId 非法 → invalid_args", async () => {
    await expect(
      fetchPiaoniuActivity({ httpClient: okClient({}), activityId: "abc" }),
    ).rejects.toMatchObject({ reason: "invalid_args" });
  });

  it("网络错误 → http_timeout / network", async () => {
    await expect(
      fetchPiaoniuActivity({ httpClient: errClient("timeout"), activityId: "1" }),
    ).rejects.toMatchObject({ reason: "http_timeout" });
  });

  it("非 JSON → parse_failed", async () => {
    const bad = { get: async () => ({ status: 200, body: "<html>" }) };
    await expect(
      fetchPiaoniuActivity({ httpClient: bad, activityId: "1" }),
    ).rejects.toMatchObject({ reason: "parse_failed" });
  });

  it("HTTP 500 → fetch_failed", async () => {
    const s500 = { get: async () => ({ status: 500, body: "{}" }) };
    await expect(
      fetchPiaoniuActivity({ httpClient: s500, activityId: "1" }),
    ).rejects.toMatchObject({ reason: "fetch_failed" });
  });
});

function secondOf(snap: any) {
  return snap.sessions[1];
}

describe("fetchPiaoniuTiers", () => {
  it("票档归一化（包厢/看台，含余票与缺货）", async () => {
    const http = okClient([
      {
        id: 60184544,
        specification: "包厢票",
        lowPrice: 1348.0,
        originPrice: 1448.0,
        ticketsNum: 4,
        hasTicket: true,
      },
      { id: 60184545, specification: "看台", lowPrice: null, hasTicket: false },
    ]);
    const r = await fetchPiaoniuTiers({ httpClient: http, eventId: 14938568 });
    expect(r.ok).toBe(true);
    expect(r.eventId).toBe("14938568");
    expect(r.tiers[0]).toEqual({
      id: "60184544",
      name: "包厢票",
      lowPrice: "1348",
      originPrice: "1448",
      ticketsNum: 4,
      hasTicket: true,
    });
    expect(r.tiers[1].lowPrice).toBeUndefined();
    expect(r.tiers[1].hasTicket).toBe(false);
  });

  it("eventId 缺失 → invalid_args", async () => {
    await expect(fetchPiaoniuTiers({ httpClient: okClient([]) })).rejects.toMatchObject({
      reason: "invalid_args",
    });
  });
});

describe("fetchPiaoniuQtyPrices", () => {
  it("按张数归一化单价；非法 key / 缺 salePrice 跳过", async () => {
    const http = okClient({
      ticketGroups: {
        "1": { ticketGroups: [{ salePrice: 280.0 }] },
        "2": { ticketGroups: [{ salePrice: 300 }] },
        "0": { ticketGroups: [{ salePrice: 1 }] },
        bad: { ticketGroups: [{ salePrice: 9 }] },
        "3": { ticketGroups: [{}] },
      },
    });
    const r = await fetchPiaoniuQtyPrices({
      httpClient: http,
      eventId: 14952455,
      ticketCategoryId: 60153649,
    });
    expect(r.qtyPrices).toEqual([
      { qty: 1, salePrice: "280" },
      { qty: 2, salePrice: "300" },
    ]);
  });

  it("参数非法 → invalid_args", async () => {
    await expect(
      fetchPiaoniuQtyPrices({ httpClient: okClient({}), eventId: "x", ticketCategoryId: 1 }),
    ).rejects.toMatchObject({ reason: "invalid_args" });
  });
});

describe("normalize helpers", () => {
  it("normalizePiaoniuEventStatus 枚举映射", () => {
    expect(normalizePiaoniuEventStatus(1)).toBe("ONSALE");
    expect(normalizePiaoniuEventStatus(4)).toBe("UPCOMING");
    expect(normalizePiaoniuEventStatus(6)).toBe("ONSALE");
    expect(normalizePiaoniuEventStatus(2)).toBe("ENDED");
    expect(normalizePiaoniuEventStatus(undefined)).toBe("ENDED");
  });

  it("normalizePiaoniuEvents 跳过无 id 条目、时间戳转文案", () => {
    const events = normalizePiaoniuEvents(ACTIVITY_FIXTURE.events);
    expect(events).toHaveLength(2);
    expect(events[0].time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(events[1].name).toContain("2026-10-02"); // spec 文案兜底
  });

  it("normalizePiaoniuTiers 跳过无 id", () => {
    expect(normalizePiaoniuTiers([{}, { id: 1, specification: "A" }])).toHaveLength(1);
  });

  it("normalizePiaoniuQtyPrices / tierPriceForQty", () => {
    expect(normalizePiaoniuQtyPrices(null)).toEqual([]);
    const tier = {
      lowPrice: "280",
      qtyPrices: [
        { qty: 1, salePrice: "280" },
        { qty: 2, salePrice: "300" },
      ],
    };
    expect(tierPriceForQty(tier, 2)).toBe("300");
    expect(tierPriceForQty(tier, 9)).toBe("280"); // 回退 lowPrice
    expect(tierPriceForQty({ lowPrice: "100" }, 1)).toBe("100");
  });

  it("normalizePiaoniuActivity 标题兜底链 name→cityName→venue→未命名", () => {
    const raw = { events: [], cityName: "上海", venue: { name: "梅赛德斯" } };
    const snap = normalizePiaoniuActivity(raw, "123");
    expect(snap.title).toBe("上海");
    expect(snap.city).toBe("上海");
    const noCity = normalizePiaoniuActivity({ events: [], venue: { name: "梅赛德斯" } }, "124");
    expect(noCity.title).toBe("梅赛德斯");
    const bare = normalizePiaoniuActivity({ events: [] }, "125");
    expect(bare.title).toBe("未命名演出");
  });
});
