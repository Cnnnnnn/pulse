import { describe, it, expect } from "vitest";
const { requireMain } = require("../_setup/require-main.cjs");
const {
  fetchMaoyanLists,
  fetchMaoyanDetail,
  fetchMaoyanCinemas,
  fetchMaoyanCinemaShows,
  fetchMaoyanCinemaFilters,
  normalizeMaoyanList,
  normalizeMaoyanDetail,
  normalizeMaoyanCinemas,
  normalizeMaoyanDistricts,
  normalizeMaoyanSlots,
} = requireMain("movies/fetcher-maoyan");

// mock httpClient：成功返回 {status, body(JSON 字符串)}；失败返回 {error}
function okClient(bodyObj: any, status = 200) {
  return { get: async () => ({ status, body: JSON.stringify(bodyObj) }) };
}
function errClient(err: string) {
  return { get: async () => ({ error: err }) };
}

describe("fetchMaoyanLists", () => {
  it("L1 封装成功 → 返回 nowPlaying+coming，source=maoyan-netstart", async () => {
    const http = okClient({
      movieList: [{ id: 1, nm: "测试片", sc: 9.0, img: "//cdn/x.jpg", rt: "2026-08-19" }],
      coming: [{ id: 2, nm: "未映片", wish: 100, comingTitle: "8月上映", showStateButton: { content: "待映" } }],
    });
    const p = await fetchMaoyanLists({ httpClient: http, useDirect: false });
    expect(p.source).toBe("maoyan-netstart");
    expect(p.nowPlaying).toHaveLength(1);
    expect(p.nowPlaying[0].title).toBe("测试片");
    expect(p.nowPlaying[0].poster).toBe("https://cdn/x.jpg");
    expect(p.coming).toHaveLength(1);
    expect(p.coming[0].wish).toBe(100);
  });

  it("L2 直连成功 → source=maoyan-direct", async () => {
    const http = okClient({
      movieList: [{ id: 3, nm: "直连片", sc: 8.5, img: "//c/y.jpg" }],
      coming: [],
    });
    const p = await fetchMaoyanLists({ httpClient: http, useDirect: true });
    expect(p.source).toBe("maoyan-direct");
  });

  it("comingList URL 带 cityId", async () => {
    const urls: string[] = [];
    const http = {
      get: async (url: string) => {
        urls.push(url);
        return { status: 200, body: JSON.stringify({ movieList: [{ id: 1, nm: "A" }], coming: [] }) };
      },
    };
    await fetchMaoyanLists({ httpClient: http, useDirect: false, cityId: 10 });
    expect(urls.some((u) => u.includes("ci=10"))).toBe(true);
  });

  it("解析失败（非对象/空）抛出 withReason parse_failed", async () => {
    const http = okClient({ foo: "bar" });
    await expect(fetchMaoyanLists({ httpClient: http, useDirect: false }))
      .rejects.toMatchObject({ reason: "parse_failed" });
  });

  it("httpClient 缺失抛 fetch_failed", async () => {
    await expect(fetchMaoyanLists({}))
      .rejects.toMatchObject({ reason: "fetch_failed" });
  });
});

describe("fetchMaoyanDetail", () => {
  it("详情直连成功 → 返回归一化 detail，source=maoyan-direct", async () => {
    const http = okClient({ detailMovie: { nm: "片", sc: 9.0, img: "//c/z.jpg", cat: "剧情", dur: 120, dra: "简介" } });
    const d: any = await fetchMaoyanDetail({ httpClient: http, movieId: "5" });
    expect(d.title).toBe("片");
    expect(d.source).toBe("maoyan-direct");
    expect(d.id).toBe("5");
    expect(d.durationMin).toBe(120);
  });
});

describe("normalizeMaoyanList", () => {
  it("now 字段映射 + coming 字段映射", () => {
    const now = normalizeMaoyanList([{ id: 1, nm: "A", sc: 8, img: "//c/a.jpg", showInfo: "X家影院" }], "now");
    expect(now[0].showInfo).toBe("X家影院");
    expect(now[0].poster).toBe("https://c/a.jpg");
    const coming = normalizeMaoyanList([{ id: 2, nm: "B", wish: 500, comingTitle: "8月", showStateButton: { content: "待映" } }], "coming");
    expect(coming[0].wish).toBe(500);
    expect(coming[0].showState).toBe("待映");
    expect(coming[0].comingTitle).toBe("8月");
  });
});

describe("normalizeMaoyanDetail", () => {
  it("cat 拆分 + dra + dur + videourl + 评分兜底", () => {
    const d = normalizeMaoyanDetail({
      nm: "片", enm: "X", sc: 0, scoreLabel: "暂无评分",
      cat: "剧情,犯罪", dur: 160, dra: "简介", videourl: "https://v.mp4",
      star: "甲,乙", dir: "丙", rt: "2026-08-19", img: "//c/z.jpg",
    });
    expect(d.genres).toEqual(["剧情", "犯罪"]);
    expect(d.durationMin).toBe(160);
    expect(d.summary).toBe("简介");
    expect(d.trailerUrl).toBe("https://v.mp4");
    expect(d.ratingLabel).toBe("暂无评分");
    expect(d.poster).toBe("https://c/z.jpg");
  });
});

describe("fetchMaoyanCinemas / shows", () => {
  it("cinemaList 归一化影院字段", async () => {
    const http = {
      get: async (url: string) => {
        expect(url).toContain("cinemaList");
        expect(url).toContain("ci=30");
        expect(url).toContain("day=2026-08-27");
        expect(url).toContain("districtId=-1");
        return {
          status: 200,
          body: JSON.stringify({
            cinemas: [
              {
                id: 9521,
                nm: "百川国际影城",
                addr: "南山",
                distance: "1.8km",
                sellPrice: "39.9",
                tag: { hallType: ["IMAX厅"] },
              },
            ],
            paging: { hasMore: true, total: 254 },
          }),
        };
      },
    };
    const p = await fetchMaoyanCinemas({
      httpClient: http,
      movieId: "1525868",
      cityId: 30,
      day: "2026-08-27",
    });
    expect(p.ok).toBe(true);
    expect(p.cinemas).toHaveLength(1);
    expect(p.cinemas[0].name).toBe("百川国际影城");
    expect(p.cinemas[0].hallTypes).toEqual(["IMAX厅"]);
    expect(p.total).toBe(254);
  });

  it("cinemaList 带 districtId / areaId", async () => {
    let hit = "";
    const http = {
      get: async (url: string) => {
        hit = url;
        return { status: 200, body: JSON.stringify({ cinemas: [], paging: { total: 0 } }) };
      },
    };
    await fetchMaoyanCinemas({
      httpClient: http,
      movieId: "1",
      cityId: 30,
      day: "2026-08-27",
      districtId: 32,
      areaId: 6589,
    });
    expect(hit).toContain("districtId=32");
    expect(hit).toContain("areaId=6589");
  });

  it("filterCinemas 归一化行政区与商圈", async () => {
    const http = {
      get: async (url: string) => {
        expect(url).toContain("filterCinemas");
        expect(url).toContain("ci=30");
        return {
          status: 200,
          body: JSON.stringify({
            district: {
              name: "行政区",
              subItems: [
                { id: -1, name: "全部", count: 254, subItems: [] },
                {
                  id: 32,
                  name: "宝安区",
                  count: 58,
                  subItems: [
                    { id: -1, name: "全部", count: 58 },
                    { id: 6589, name: "福永", count: 14 },
                  ],
                },
              ],
            },
          }),
        };
      },
    };
    const p = await fetchMaoyanCinemaFilters({ httpClient: http, cityId: 30 });
    expect(p.districts).toHaveLength(1);
    expect(p.districts[0].name).toBe("宝安区");
    expect(p.districts[0].areas).toEqual([{ id: 6589, name: "福永", count: 14 }]);
  });

  it("normalizeMaoyanDistricts 跳过全部项", () => {
    expect(
      normalizeMaoyanDistricts([
        { id: -1, name: "全部" },
        { id: 32, name: "宝安区", subItems: [{ id: -1, name: "全部" }] },
      ]),
    ).toEqual([{ id: 32, name: "宝安区", count: undefined, areas: undefined }]);
  });

  it("cinemaDetail 抽出场次时间", async () => {
    const http = okClient({
      showData: {
        cinemaName: "测试影城",
        movies: [
          {
            id: 1,
            shows: [
              {
                showDate: "2026-08-27",
                dateShow: "今天",
                plist: [{ tm: "19:30", th: "1号厅", lang: "国语", tp: "2D", vipPrice: "46" }],
              },
            ],
          },
        ],
      },
    });
    const p = await fetchMaoyanCinemaShows({
      httpClient: http,
      movieId: "1",
      cinemaId: "9",
      cityId: 30,
      day: "2026-08-27",
    });
    expect(p.cinemaName).toBe("测试影城");
    expect(p.days[0].slots[0].time).toBe("19:30");
    expect(p.days[0].slots[0].price).toBe("46");
  });

  it("normalizeMaoyanCinemas 跳过无 id", () => {
    expect(normalizeMaoyanCinemas([{}, { id: 2, nm: "A" }])).toHaveLength(1);
  });

  it("normalizeMaoyanSlots 跳过无 tm", () => {
    expect(normalizeMaoyanSlots([{}, { tm: "10:00" }])).toEqual([
      { time: "10:00", hall: undefined, lang: undefined, type: undefined, price: undefined, seqNo: undefined },
    ]);
  });
});
