import { describe, it, expect } from "vitest";
const { requireMain } = require("../_setup/require-main.cjs");

describe("movies fetcher-tmdb", () => {
  const tmdb = requireMain("movies/fetcher-tmdb");

  function okRes(body: any) {
    return { status: 200, body: JSON.stringify(body) };
  }

  const NOW_BODY = {
    page: 1,
    results: [
      {
        id: 101,
        title: "奥德赛",
        original_title: "The Odyssey",
        poster_path: "/od.jpg",
        vote_average: 8.2,
        release_date: "2026-08-19",
        genre_ids: [28, 12],
      },
    ],
    total_pages: 1,
  };
  const COMING_BODY = {
    page: 1,
    results: [
      {
        id: 202,
        title: "机器人总动员",
        original_title: "WALL-E",
        poster_path: "/we.jpg",
        vote_average: 9.1,
        release_date: "2026-09-01",
        genre_ids: [16],
      },
    ],
    total_pages: 1,
  };

  it("L3: 拉 now_playing + upcoming（region=CN）并归一化", async () => {
    const calls: string[] = [];
    const httpClient: any = {
      get: async (url: string) => {
        calls.push(url);
        if (url.includes("now_playing")) return okRes(NOW_BODY);
        return okRes(COMING_BODY);
      },
    };
    const p = await tmdb.fetchTmdbLists({ httpClient, apiKey: "KEY", region: "CN" });
    expect(Array.isArray(p.nowPlaying)).toBe(true);
    expect(Array.isArray(p.coming)).toBe(true);
    expect(p.nowPlaying.length).toBe(1);
    expect(p.coming.length).toBe(1);
    expect(p.source).toBe("tmdb");
    const now = p.nowPlaying[0];
    expect(now.id).toBe("101");
    expect(now.title).toBe("奥德赛");
    expect(now.enTitle).toBe("The Odyssey");
    expect(now.rating).toBe(8.2);
    expect(now.releaseDate).toBe("2026-08-19");
    expect(now.poster).toBe("https://image.tmdb.org/t/p/w342/od.jpg");
    expect(now.source).toBe("tmdb");
    // region 拼到两个 URL
    expect(calls.every((u) => u.includes("region=CN"))).toBe(true);
    expect(calls.every((u) => u.includes("api_key=KEY"))).toBe(true);
  });

  it("L3: 无 apiKey → 抛 fetch_failed（触发 cache 跳到 L4 示例）", async () => {
    const httpClient: any = { get: async () => okRes(NOW_BODY) };
    await expect(tmdb.fetchTmdbLists({ httpClient })).rejects.toMatchObject({
      reason: "fetch_failed",
    });
  });

  it("L3: 两列表皆空 → 抛 parse_failed", async () => {
    const httpClient: any = {
      get: async () => okRes({ page: 1, results: [], total_pages: 0 }),
    };
    await expect(
      tmdb.fetchTmdbLists({ httpClient, apiKey: "KEY" }),
    ).rejects.toMatchObject({ reason: "parse_failed" });
  });

  it("L3: HTTP 错误状态 → 抛 fetch_failed", async () => {
    const httpClient: any = { get: async () => ({ status: 401, body: "{}" }) };
    await expect(
      tmdb.fetchTmdbLists({ httpClient, apiKey: "KEY" }),
    ).rejects.toMatchObject({ reason: "fetch_failed" });
  });

  it("L3: HTTP timeout → 抛 http_timeout", async () => {
    const httpClient: any = {
      get: async () => ({ error: "timeout", status: 0 }),
    };
    await expect(
      tmdb.fetchTmdbLists({ httpClient, apiKey: "KEY" }),
    ).rejects.toMatchObject({ reason: "http_timeout" });
  });

  it("L3: 单条缺字段不过滤整列（容错）", async () => {
    const httpClient: any = {
      get: async (url: string) =>
        okRes({
          page: 1,
          results: url.includes("now_playing") ? [{}, { id: 7, title: "X" }] : [],
          total_pages: 1,
        }),
    };
    const p = await tmdb.fetchTmdbLists({ httpClient, apiKey: "KEY" });
    // id 缺失的被跳过，保留 id=7
    expect(p.nowPlaying.length).toBe(1);
    expect(p.nowPlaying[0].id).toBe("7");
  });
});
