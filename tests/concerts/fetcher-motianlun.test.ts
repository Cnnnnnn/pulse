import { describe, it, expect } from "vitest";
const { requireMain } = require("../_setup/require-main.cjs");
const {
  fetchMotianlunShow,
  normalizeMotianlunShow,
  normalizeMotianlunTiers,
  aggregateTicketMins,
} = requireMain("concerts/fetcher-motianlun");

function okClient(routes: Record<string, any>) {
  return {
    get: async (url: string) => {
      const key = Object.keys(routes).find((k) => url.includes(k));
      if (!key) return { status: 404, body: "{}" };
      return { status: 200, body: JSON.stringify(routes[key]) };
    },
    post: async (url: string, body: any) => {
      const key = Object.keys(routes).find((k) => url.includes(k));
      if (!key) return { status: 404, body: "{}" };
      const fixture = routes[key];
      const resolved = typeof fixture === "function" ? fixture(body) : fixture;
      return { status: 200, body: JSON.stringify(resolved) };
    },
  };
}

const SHOW_FIXTURE = {
  statusCode: 200,
  result: {
    data: {
      showOID: "6a5b2cbf47e3790001d8a2c9",
      showName: "声幻奇境超级演唱会-佛山站",
      originalShowName: "【佛山站】声幻奇境超级演唱会-佛山站",
      venueName: "佛山世纪莲体育中心体育场",
      cityName: "佛山",
      minPrice: 298.0,
      posterURL: "https://img1.tking.cn/x.jpg",
      showDate: "2026.08.28 19:00",
      showStatus: { code: 3, name: "Onsale", displayName: "售票中" },
    },
  },
};

const SEATPLAN_FIXTURE = {
  statusCode: 200,
  result: {
    data: [
      {
        seatPlanOID: "plan380",
        comments: "看台",
        originalPrice: 380,
        available: true,
      },
      {
        seatPlanOID: "plan580",
        comments: "看台",
        originalPrice: 580,
        available: true,
      },
      {
        seatPlanOID: "plan1080",
        comments: "内场",
        originalPrice: 1080,
        available: true,
      },
    ],
  },
};

const TICKETS_BY_PLAN: Record<string, any> = {
  plan580: {
    statusCode: 200,
    data: {
      sessionTicketList: [
        { ticketId: "t1", seatPlanId: "plan580", price: 298 },
        { ticketId: "t2", seatPlanId: "plan580", price: 310 },
      ],
    },
  },
  plan1080: {
    statusCode: 200,
    data: {
      sessionTicketList: [{ ticketId: "t3", seatPlanId: "plan1080", price: 600 }],
    },
  },
  plan380: {
    statusCode: 200,
    data: { sessionTicketList: [] },
  },
};

const SESSIONS_FIXTURE = {
  statusCode: 200,
  result: {
    data: [
      {
        showOID: "6a5b2cbf47e3790001d8a2c9",
        showSessionOID: "6a5b2cbf47e3790001d8a2ca",
        sessionName: "2026-08-28 19:00",
      },
    ],
  },
};

function ticketsFixture(body: any) {
  const planId = body && body.seatPlanId;
  if (planId && TICKETS_BY_PLAN[planId]) return TICKETS_BY_PLAN[planId];
  // 无 seatPlanId：旧行为只回最便宜档（用于兜底路径）
  return {
    statusCode: 200,
    data: {
      sessionTicketList: [{ ticketId: "t1", seatPlanId: "plan580", price: 298 }],
    },
  };
}

describe("fetchMotianlunShow", () => {
  it("成功 → 按 seatPlanId 分别取多档最低在售价", async () => {
    const http = okClient({
      "/showapi/pub/show/": SHOW_FIXTURE,
      "/transfer/show/6a5b2cbf47e3790001d8a2c9/session": SESSIONS_FIXTURE,
      "/seatPlan": SEATPLAN_FIXTURE,
      find_tickets: ticketsFixture,
    });
    const snap = await fetchMotianlunShow({
      httpClient: http,
      showId: "6a5b2cbf47e3790001d8a2c9",
      ticketCount: 2,
    });
    expect(snap.platform).toBe("motianlun");
    expect(snap.key).toBe("motianlun:6a5b2cbf47e3790001d8a2c9");
    expect(snap.title).toContain("声幻奇境");
    expect(snap.city).toBe("佛山");
    expect(snap.sessions).toHaveLength(1);
    expect(snap.sessions[0].minPrice).toBe("298");
    expect(snap.sessions[0].ticketCount).toBe(2);
    const tiers = snap.sessions[0].tiers;
    expect(tiers).toHaveLength(3);
    const t580 = tiers.find((t: any) => t.id === "plan580");
    expect(t580).toMatchObject({
      name: "看台580元",
      lowPrice: "298",
      originPrice: "580",
      hasTicket: true,
    });
    expect(t580.qtyPrices).toEqual([{ qty: 2, salePrice: "298" }]);
    const t1080 = tiers.find((t: any) => t.id === "plan1080");
    expect(t1080).toMatchObject({ lowPrice: "600", hasTicket: true });
    const t380 = tiers.find((t: any) => t.id === "plan380");
    expect(t380.hasTicket).toBe(false);
    expect(t380.lowPrice).toBeUndefined();
  });

  it("详情页无 sessionId → 从 transfer/session 展开场次", async () => {
    const http = okClient({
      "/showapi/pub/show/": SHOW_FIXTURE,
      "/transfer/show/6a5b2cbf47e3790001d8a2c9/session": SESSIONS_FIXTURE,
      "/seatPlan": SEATPLAN_FIXTURE,
      find_tickets: ticketsFixture,
    });
    const snap = await fetchMotianlunShow({
      httpClient: http,
      showId: "6a5b2cbf47e3790001d8a2c9",
    });
    expect(snap.sessions[0].id).toBe("6a5b2cbf47e3790001d8a2ca");
    expect(snap.sessions[0].name).toBe("2026-08-28 19:00");
  });

  it("参数非法 → invalid_args", async () => {
    await expect(
      fetchMotianlunShow({ httpClient: okClient({}), showId: "!!" }),
    ).rejects.toMatchObject({ reason: "invalid_args" });
  });

  it("单档 find_tickets 556 → 该档缺货，不拖垮整场", async () => {
    const http = okClient({
      "/showapi/pub/show/": SHOW_FIXTURE,
      "/transfer/show/6a5b2cbf47e3790001d8a2c9/session": SESSIONS_FIXTURE,
      "/seatPlan": SEATPLAN_FIXTURE,
      find_tickets: (body: any) => {
        if (body && body.seatPlanId === "plan1080") {
          return { statusCode: 556, comments: "访客过多" };
        }
        return ticketsFixture(body);
      },
    });
    const snap = await fetchMotianlunShow({
      httpClient: http,
      showId: "6a5b2cbf47e3790001d8a2c9",
    });
    const tiers = snap.sessions[0].tiers;
    expect(tiers.find((t: any) => t.id === "plan580").lowPrice).toBe("298");
    expect(tiers.find((t: any) => t.id === "plan1080").hasTicket).toBe(false);
  });
});

describe("aggregateTicketMins / normalizeMotianlunTiers", () => {
  it("同档取最低价；0/非法跳过", () => {
    expect(
      aggregateTicketMins([
        { seatPlanId: "a", price: 300 },
        { seatPlanId: "a", price: 280 },
        { seatPlanId: "b", price: 0 },
        { seatPlanId: null, price: 1 },
      ]),
    ).toEqual({ a: 280 });
  });

  it("票列表有、seatPlan 无的档仍输出", () => {
    const tiers = normalizeMotianlunTiers([], { ghost: 199 }, 1);
    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({ id: "ghost", lowPrice: "199", hasTicket: true });
  });
});

describe("normalizeMotianlunShow 标题兜底", () => {
  it("originalShowName → showName → 未命名", () => {
    const a = normalizeMotianlunShow({ originalShowName: "A", showName: "B" }, [], [], "s", "e");
    expect(a.title).toBe("A");
    const b = normalizeMotianlunShow({ showName: "B" }, [], [], "s", "e");
    expect(b.title).toBe("B");
    const c = normalizeMotianlunShow({}, [], [], "s", "e");
    expect(c.title).toBe("未命名演出");
  });
});
