import { describe, it, expect } from "vitest";
const { requireMain } = require("../_setup/require-main.cjs");
const {
  fetchMoreticketsTour,
  searchMoreticketsShows,
  normalizeMoreticketsSessions,
  normalizeMoreticketsSearchHits,
} = requireMain("concerts/fetcher-moretickets");

// 票牛不同：摩天轮 session_list 是 POST。这里记录 post 调用便于断言 body/header。
function okClient(bodyObj: any) {
  const calls = { get: [] as any[], post: [] as any[] };
  return {
    calls,
    get: async (url: string, opts: any) => {
      calls.get.push({ url, opts });
      return { status: 200, body: JSON.stringify(bodyObj) };
    },
    post: async (url: string, body: any, headers: any, opts: any) => {
      calls.post.push({ url, body: typeof body === "string" ? JSON.parse(body) : body, headers, opts });
      return { status: 200, body: JSON.stringify(bodyObj) };
    },
  };
}
function errClient(err: string) {
  return {
    get: async () => ({ error: err }),
    post: async () => ({ error: err }),
  };
}

// /pub/tour/v1/tour_session_list 实测结构（2026-08 刘德华香港站裁剪）
const TOUR_DETAIL_FIXTURE = {
  statusCode: 200,
  success: true,
  data: { tourId: "t1", tourName: "Andy Lau World Tour", advertise: "" },
};
const SESSION_LIST_FIXTURE = {
  statusCode: 200,
  data: {
    sessionList: [
      {
        sessionId: "s1",
        sessionName: "2026-12-18 20:15",
        minPrice: "4099",
        originalPrice: "4099",
        currencySymbol: "HK$",
        sessionStatus: "ONSALE",
        hasTicket: true,
        showName: "Andy Lau World Tour In Hong Kong",
        cityName: "中國香港",
        venueName: "Hong Kong Coliseum ",
        dateItem: { year: "2026", month: "Dec", dayOfMonth: "18", weekday: "FRI", time: "08:15 PM" },
        price: { minSalePrice: "3880", discountTag: null, currencySymbol: "HK$" },
      },
      { sessionId: "s2", sessionStatus: "SOLDOUT", hasTicket: false, minPrice: null },
    ],
  },
};

describe("fetchMoreticketsTour", () => {
  it("成功 → 快照归一化 + 请求带上下文 header + POST 分页体", async () => {
    const http: any = okClient(SESSION_LIST_FIXTURE);
    // tour_detail 先 GET，session_list 后 POST：两次调用返回体不同 → 按 url 区分
    http.get = async (url: string, opts: any) => {
      (http.calls as any).get.push({ url, opts });
      if (url.includes("/tour_detail")) {
        return { status: 200, body: JSON.stringify(TOUR_DETAIL_FIXTURE) };
      }
      return { status: 200, body: JSON.stringify({}) };
    };
    const snap = await fetchMoreticketsTour({ httpClient: http, tourId: "t1", showId: "sh1" });

    expect(snap.platform).toBe("moretickets");
    expect(snap.key).toBe("moretickets:t1/sh1");
    expect(snap.title).toBe("Andy Lau World Tour In Hong Kong");
    expect(snap.venue).toBe("Hong Kong Coliseum");
    expect(snap.city).toBe("中國香港");

    // 上下文 header（12123 的解药）必须带上
    const postCalls = (http.calls as any).post;
    expect(postCalls).toHaveLength(1);
    const { url, body, headers } = postCalls[0];
    expect(url).toContain("/pub/tour/v1/tour_session_list");
    expect(headers.oc).toBe("MTS");
    expect(headers.lc).toBe("CN-HK");
    expect(headers.cc).toBe("HKD");
    expect(headers.src).toBe("PC");
    // SPA 拦截器同款分页形
    expect(body.tourId).toBe("t1");
    expect(body.completedSession).toBe(false);
    expect(body.page.beforePage).toEqual({ length: 50, offset: 0 });

    // 价格取 price.minSalePrice 优先
    expect(snap.sessions[0]).toMatchObject({
      id: "s1",
      minPrice: "3880",
      originalPrice: "4099",
      currencySymbol: "HK$",
      status: "ONSALE",
      hasTicket: true,
    });
    expect(snap.sessions[1]).toMatchObject({ status: "SOLDOUT", minPrice: undefined });
  });

  it("tour_detail 失败不阻塞场次列表", async () => {
    const http: any = okClient(SESSION_LIST_FIXTURE);
    http.get = async () => ({ status: 500, body: "{}" });
    const snap = await fetchMoreticketsTour({ httpClient: http, tourId: "t1", showId: "sh1" });
    expect(snap.sessions).toHaveLength(2);
  });

  it("statusCode!=200 网关错误 → fetch_failed", async () => {
    const http = okClient({ statusCode: 12123, message: "Sorry" });
    await expect(
      fetchMoreticketsTour({ httpClient: http, tourId: "t1", showId: "sh1" }),
    ).rejects.toMatchObject({ reason: "fetch_failed" });
  });

  it("缺 tourId/showId → invalid_args；超时 → http_timeout", async () => {
    await expect(fetchMoreticketsTour({ httpClient: okClient({}) })).rejects.toMatchObject({
      reason: "invalid_args",
    });
    await expect(
      fetchMoreticketsTour({ httpClient: errClient("timeout"), tourId: "t", showId: "s" }),
    ).rejects.toMatchObject({ reason: "http_timeout" });
  });
});

describe("searchMoreticketsShows", () => {
  it("命中关键词 → hits 提取 tourId/showId", async () => {
    const http: any = okClient({
      statusCode: 200,
      data: [
        {
          title: "鄧紫棋 G.E.M.",
          status: "ONSALE",
          location: "香港",
          imgUrl: "https://x/y.jpg",
          navigateUrl:
            "moretickets://moretickets.com/show_tour_detail?tourId=abc&showId=def&showCode=gem",
        },
        { title: "无跳转的项", navigateUrl: null },
      ],
    });
    const r = await searchMoreticketsShows({ httpClient: http, keyword: "邓紫棋" });
    expect(r.ok).toBe(true);
    expect(r.hits[0]).toMatchObject({ tourId: "abc", showId: "def", title: "鄧紫棋 G.E.M." });
    expect(r.hits[1].tourId).toBeUndefined();
  });

  it("空关键词 → invalid_args", async () => {
    await expect(searchMoreticketsShows({ httpClient: okClient({}), keyword: "  " })).rejects.toMatchObject({
      reason: "invalid_args",
    });
  });
});

describe("normalize helpers", () => {
  it("normalizeMoreticketsSessions 空场次 → 标题兜底", () => {
    const snap = normalizeMoreticketsSessions([], "a", "b");
    expect(snap.title).toBe("未命名演出");
    expect(snap.detailUrl).toContain("tourId=a&showId=b");
  });

  it("normalizeMoreticketsSearchHits 跳过非对象", () => {
    // null 被剔除；无 navigateUrl 的条目保留（title 仍可用）
    const hits = normalizeMoreticketsSearchHits([null, { title: "x" }]);
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("x");
  });
});
