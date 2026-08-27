// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  moviesLoad: vi.fn(async () => null),
  moviesRefresh: vi.fn(async (cityId?: number) => SAMPLE_REFRESH({ cityId: cityId ?? 1 })),
  moviesDetail: vi.fn(async () => ({ id: "1", title: "X", source: "maoyan-direct" })),
  onMoviesUpdated: vi.fn(() => () => {}),
}));

function SAMPLE_REFRESH(extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    nowPlaying: [{ id: "1", title: "A", source: "maoyan-netstart" }],
    coming: [{ id: "2", title: "B", wish: 100, source: "maoyan-netstart" }],
    fetchedAt: Date.now(),
    source: "maoyan-netstart",
    cityId: 1,
    ...extra,
  };
}

vi.mock("../../src/renderer/api.ts", () => ({ api: mockApi }));

import {
  moviesNowPlaying,
  moviesComing,
  moviesSource,
  moviesLoaded,
  moviesLoading,
  moviesDataState,
  moviesLastRefreshAt,
  moviesActiveTab,
  moviesActiveList,
  moviesDetailCache,
  moviesDetailLoading,
  moviesCityId,
  moviesError,
  moviesComingNote,
  applyMoviesPayload,
  bootstrapMoviesTab,
  refreshMovies,
  setMoviesCity,
  fetchMovieDetail,
} from "../../src/renderer/movies/store.ts";
import { DEFAULT_MOVIE_CITY_ID } from "../../src/shared/movies-constants.ts";

function reset() {
  moviesNowPlaying.value = [];
  moviesComing.value = [];
  moviesComingNote.value = "";
  moviesSource.value = "";
  moviesLoaded.value = false;
  moviesLoading.value = false;
  moviesLastRefreshAt.value = 0;
  moviesActiveTab.value = "now";
  moviesCityId.value = DEFAULT_MOVIE_CITY_ID;
  moviesError.value = null;
  moviesDetailCache.value = {};
  moviesDataState.value = {
    phase: "idle",
    data: { nowPlaying: [], coming: [] },
    error: null,
    source: "unknown",
    fetchedAt: 0,
    lastAttemptAt: 0,
  };
  mockApi.moviesLoad.mockClear();
  mockApi.moviesRefresh.mockClear();
  mockApi.moviesDetail.mockClear();
  mockApi.moviesRefresh.mockImplementation(async (cityId?: number) =>
    SAMPLE_REFRESH({ cityId: cityId ?? 1 }),
  );
}

beforeEach(reset);

describe("movies store", () => {
  it("applyMoviesPayload 写入 nowPlaying/coming/source 并标记 loaded", () => {
    applyMoviesPayload(SAMPLE_REFRESH(), "live");
    expect(moviesNowPlaying.value.length).toBe(1);
    expect(moviesComing.value.length).toBe(1);
    expect(moviesSource.value).toBe("maoyan-netstart");
    expect(moviesLoaded.value).toBe(true);
    expect(moviesDataState.value.phase).toBe("ready");
  });

  it("applyMoviesPayload 写入 comingNote", () => {
    applyMoviesPayload(SAMPLE_REFRESH({ comingNote: "暂无澳门待映档期，以下为香港即将上映" }), "live");
    expect(moviesComingNote.value).toMatch(/香港/);
  });

  it("moviesActiveList 随 tab 切换派生 now/coming", () => {
    applyMoviesPayload(SAMPLE_REFRESH(), "live");
    moviesActiveTab.value = "now";
    expect(moviesActiveList.value[0].id).toBe("1");
    moviesActiveTab.value = "coming";
    expect(moviesActiveList.value[0].id).toBe("2");
  });

  it("bootstrapMoviesTab: load 为空 → 触发 refresh", async () => {
    mockApi.moviesLoad.mockImplementation(async () => null);
    await bootstrapMoviesTab();
    expect(mockApi.moviesRefresh).toHaveBeenCalledTimes(1);
    expect(moviesLoaded.value).toBe(true);
  });

  it("bootstrapMoviesTab: load 有新鲜缓存 → 不触发 refresh", async () => {
    mockApi.moviesLoad.mockImplementation(async () => SAMPLE_REFRESH());
    await bootstrapMoviesTab();
    expect(mockApi.moviesRefresh).not.toHaveBeenCalled();
    expect(moviesLoaded.value).toBe(true);
  });

  it("bootstrapMoviesTab: 缓存过期 → 先应用再 refresh", async () => {
    mockApi.moviesLoad.mockImplementation(async () =>
      SAMPLE_REFRESH({ fetchedAt: Date.now() - 31 * 60 * 1000 }),
    );
    await bootstrapMoviesTab();
    expect(mockApi.moviesRefresh).toHaveBeenCalledTimes(1);
    expect(moviesLoaded.value).toBe(true);
  });

  it("refreshMovies: 冷却期内重复调用被跳过", async () => {
    await refreshMovies();
    expect(mockApi.moviesRefresh).toHaveBeenCalledTimes(1);
    expect(mockApi.moviesRefresh).toHaveBeenCalledWith(DEFAULT_MOVIE_CITY_ID);
    await refreshMovies(); // 冷却期 < 30s，跳过
    expect(mockApi.moviesRefresh).toHaveBeenCalledTimes(1);
  });

  it("refreshMovies: 并发 loading 守卫——第二次立即返回 false", async () => {
    let resolveRefresh: (v: any) => void;
    const p = new Promise<any>((res) => (resolveRefresh = res));
    mockApi.moviesRefresh.mockImplementation(async () => p);
    const r1 = refreshMovies();
    const r2 = refreshMovies(); // 同一时刻 loading=true
    resolveRefresh!(SAMPLE_REFRESH());
    const [a, b] = await Promise.all([r1, r2]);
    expect(a).toBe(true);
    expect(b).toBe(false);
    expect(mockApi.moviesRefresh).toHaveBeenCalledTimes(1);
  });

  it("fetchMovieDetail: 拉取后写入 cache，二次命中缓存不重复请求", async () => {
    const d = await fetchMovieDetail("1");
    expect(d.id).toBe("1");
    expect(moviesDetailCache.value["1"]).toBeTruthy();
    await fetchMovieDetail("1");
    expect(mockApi.moviesDetail).toHaveBeenCalledTimes(1);
  });

  it("fetchMovieDetail: 详情返回 ok:false → 返回 null + 设 error", async () => {
    mockApi.moviesDetail.mockImplementation(async () => ({ ok: false, reason: "fetch_failed" }));
    const d = await fetchMovieDetail("9");
    expect(d).toBeNull();
    expect(moviesDetailLoading.value).toBe(false);
  });

  it("applyMoviesPayload: degraded 写入错误文案", () => {
    applyMoviesPayload(SAMPLE_REFRESH({ degraded: true }), "cache");
    expect(moviesError.value).toBe("网络失败，显示上次数据");
  });

  it("setMoviesCity 绕过冷却并带上 cityId", async () => {
    await refreshMovies();
    expect(mockApi.moviesRefresh).toHaveBeenCalledTimes(1);
    await setMoviesCity(10);
    expect(moviesCityId.value).toBe(10);
    expect(mockApi.moviesRefresh).toHaveBeenCalledTimes(2);
    expect(mockApi.moviesRefresh).toHaveBeenLastCalledWith(10);
  });
});
