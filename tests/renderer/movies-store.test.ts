// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  moviesLoad: vi.fn(async () => null),
  moviesRefresh: vi.fn(async () => SAMPLE_REFRESH()),
  moviesDetail: vi.fn(async () => ({ id: "1", title: "X", source: "maoyan-direct" })),
  onMoviesUpdated: vi.fn(() => () => {}),
}));

function SAMPLE_REFRESH() {
  return {
    ok: true,
    nowPlaying: [{ id: "1", title: "A", source: "maoyan-netstart" }],
    coming: [{ id: "2", title: "B", wish: 100, source: "maoyan-netstart" }],
    fetchedAt: 1700000000000,
    source: "maoyan-netstart",
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
  applyMoviesPayload,
  bootstrapMoviesTab,
  refreshMovies,
  fetchMovieDetail,
} from "../../src/renderer/movies/store.ts";

function reset() {
  moviesNowPlaying.value = [];
  moviesComing.value = [];
  moviesSource.value = "";
  moviesLoaded.value = false;
  moviesLoading.value = false;
  moviesLastRefreshAt.value = 0;
  moviesActiveTab.value = "now";
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
  mockApi.moviesRefresh.mockImplementation(async () => SAMPLE_REFRESH());
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

  it("bootstrapMoviesTab: load 有缓存 → 不触发 refresh", async () => {
    mockApi.moviesLoad.mockImplementation(async () => SAMPLE_REFRESH());
    await bootstrapMoviesTab();
    expect(mockApi.moviesRefresh).not.toHaveBeenCalled();
    expect(moviesLoaded.value).toBe(true);
  });

  it("refreshMovies: 冷却期内重复调用被跳过", async () => {
    await refreshMovies();
    expect(mockApi.moviesRefresh).toHaveBeenCalledTimes(1);
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
});
