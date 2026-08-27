import { describe, it, expect, vi } from "vitest";
const { requireMain } = require("../_setup/require-main.cjs");

describe("movies cache (L1-L4 degradation)", () => {
  const { createMoviesCache } = requireMain("movies/cache");

  const OK_NETSTART = {
    nowPlaying: [{ id: "1", title: "A", source: "maoyan-netstart" }],
    coming: [{ id: "2", title: "B", source: "maoyan-netstart" }],
    fetchedAt: Date.now(),
    source: "maoyan-netstart",
  };
  const OK_DIRECT = {
    nowPlaying: [{ id: "1", title: "A", source: "maoyan-direct" }],
    coming: [],
    fetchedAt: Date.now(),
    source: "maoyan-direct",
  };
  const OK_TMDB = {
    nowPlaying: [{ id: "1", title: "A", source: "tmdb" }],
    coming: [],
    fetchedAt: Date.now(),
    source: "tmdb",
  };
  function okSample() {
    return {
      nowPlaying: [{ id: "s1", title: "SA", source: "sample", isSample: true }],
      coming: [{ id: "c1", title: "SB", source: "sample", isSample: true }],
      fetchedAt: Date.now(),
      source: "sample",
    };
  }

  function build(opts: any = {}) {
    const calls: string[] = [];
    const c = createMoviesCache({
      httpClient: {},
      tmdbApiKey: opts.tmdbApiKey,
      fetchMaoyanLists: async ({ useDirect }: any) => {
        calls.push(useDirect ? "L2" : "L1");
        if (!useDirect && opts.l1Fail) throw Object.assign(new Error("x"), { reason: "fetch_failed" });
        if (useDirect && opts.l2Fail) throw Object.assign(new Error("x"), { reason: "fetch_failed" });
        return useDirect ? OK_DIRECT : OK_NETSTART;
      },
      fetchTmdbLists: async () => {
        calls.push("L3");
        if (opts.l3Fail) throw Object.assign(new Error("x"), { reason: "fetch_failed" });
        return OK_TMDB;
      },
      getMoviesSample: () => {
        calls.push("L4");
        return okSample();
      },
      persist: opts.persist,
      cityId: opts.cityId,
      onUpdate: opts.onUpdate,
    });
    return { c, calls };
  }

  it("L1 成功 → 不试 L2/L3/L4", async () => {
    const { c, calls } = build();
    const p = await c.refresh();
    expect(p.source).toBe("maoyan-netstart");
    expect(calls).toEqual(["L1"]);
  });

  it("L1 失败 → 降级 L2 成功", async () => {
    const { c, calls } = build({ l1Fail: true });
    const p = await c.refresh();
    expect(p.source).toBe("maoyan-direct");
    expect(calls).toEqual(["L1", "L2"]);
  });

  it("L1+L2 失败 → L3(tmdb) 成功（有 key）", async () => {
    const { c, calls } = build({ l1Fail: true, l2Fail: true, tmdbApiKey: "KEY" });
    const p = await c.refresh();
    expect(p.source).toBe("tmdb");
    expect(calls).toEqual(["L1", "L2", "L3"]);
  });

  it("L1+L2 失败 + 有 key 但 L3 失败 → L4 示例", async () => {
    const { c, calls } = build({ l1Fail: true, l2Fail: true, l3Fail: true, tmdbApiKey: "KEY" });
    const p = await c.refresh();
    expect(p.source).toBe("sample");
    expect(p.nowPlaying[0].isSample).toBe(true);
    expect(calls).toEqual(["L1", "L2", "L3", "L4"]);
  });

  it("L1+L2 失败 + 无 key → 跳过 L3 → L4 示例", async () => {
    const { c, calls } = build({ l1Fail: true, l2Fail: true, tmdbApiKey: undefined });
    const p = await c.refresh();
    expect(p.source).toBe("sample");
    expect(calls).toEqual(["L1", "L2", "L4"]); // L3 未调用
  });

  it("refresh 永远 resolve（最坏 = L4 示例，不抛硬失败）", async () => {
    const calls: string[] = [];
    const c = createMoviesCache({
      httpClient: {},
      fetchMaoyanLists: async () => {
        calls.push("L1");
        throw Object.assign(new Error("x"), { reason: "fetch_failed" });
      },
      fetchTmdbLists: async () => {
        calls.push("L3");
        throw Object.assign(new Error("x"), { reason: "fetch_failed" });
      },
      getMoviesSample: () => {
        calls.push("L4");
        return okSample();
      },
    });
    const p = await c.refresh();
    expect(p.source).toBe("sample");
  });

  it("in-flight 防重：并发 refresh 只触发一次 L1", async () => {
    let l1Count = 0;
    let resolveL1: (v: any) => void;
    const l1Promise = new Promise<any>((res) => (resolveL1 = res));
    const c = createMoviesCache({
      httpClient: {},
      fetchMaoyanLists: async () => {
        l1Count++;
        return l1Promise;
      },
      fetchTmdbLists: async () => OK_TMDB,
      getMoviesSample: okSample,
    });
    const r1 = c.refresh();
    const r2 = c.refresh();
    resolveL1!(OK_NETSTART);
    const [p1, p2] = await Promise.all([r1, r2]);
    expect(l1Count).toBe(1);
    expect(p1).toBe(p2);
  });

  it("refresh 后 onUpdate 被调用且带 payload", async () => {
    const onUpdate = vi.fn();
    const { c } = build({ onUpdate });
    await c.refresh();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].source).toBe("maoyan-netstart");
  });

  it("未注入 fetcher 时走真实默认 L1（http 成功即不是示例）", async () => {
    const http = {
      get: async (url: string) => {
        if (String(url).includes("movieOnInfoList")) {
          return {
            status: 200,
            body: JSON.stringify({
              movieList: [{ id: 1, nm: "真片", sc: 8.2, img: "//cdn/a.jpg" }],
            }),
          };
        }
        return {
          status: 200,
          body: JSON.stringify({
            coming: [{ id: 2, nm: "未映", wish: 10, comingTitle: "9月" }],
          }),
        };
      },
    };
    const c = createMoviesCache({ httpClient: http });
    const p = await c.refresh();
    expect(p.source).toBe("maoyan-netstart");
    expect(p.nowPlaying[0].title).toBe("真片");
    expect(p.coming[0].title).toBe("未映");
  });

  it("load() 返回最近一次 refresh 的 payload 快照", async () => {
    const { c } = build();
    expect(c.load()).toBeNull(); // 初始空
    const p = await c.refresh();
    const loaded = c.load();
    expect(loaded.source).toBe("maoyan-netstart");
    expect(loaded.nowPlaying).toEqual(p.nowPlaying);
    expect(loaded.cityId).toBe(1);
  });

  it("persist hydrate：启动即可 load 到上次片单", () => {
    const persist = {
      state: { cityId: 10, payload: OK_NETSTART },
      read() {
        return this.state;
      },
      write(s: any) {
        this.state = s;
      },
    };
    const { c } = build({ persist });
    const loaded = c.load();
    expect(loaded.source).toBe("maoyan-netstart");
    expect(loaded.cityId).toBe(10);
  });

  it("L1 成功写入 persist；示例不覆盖 live", async () => {
    const persist = {
      state: null as any,
      read() {
        return this.state;
      },
      write(s: any) {
        this.state = s;
      },
    };
    const { c } = build({ persist });
    await c.refresh();
    expect(persist.state.payload.source).toBe("maoyan-netstart");

    const failing = createMoviesCache({
      httpClient: {},
      persist,
      fetchMaoyanLists: async () => {
        throw Object.assign(new Error("x"), { reason: "fetch_failed" });
      },
      fetchTmdbLists: async () => {
        throw Object.assign(new Error("x"), { reason: "fetch_failed" });
      },
      getMoviesSample: okSample,
    });
    const p = await failing.refresh();
    expect(p.source).toBe("maoyan-netstart");
    expect(p.degraded).toBe(true);
    expect(persist.state.payload.source).toBe("maoyan-netstart");
  });

  it("L1-L3 失败但内存已有 live → 不落到 sample", async () => {
    let fail = false;
    const c = createMoviesCache({
      httpClient: {},
      fetchMaoyanLists: async () => {
        if (fail) throw Object.assign(new Error("x"), { reason: "fetch_failed" });
        return OK_NETSTART;
      },
      fetchTmdbLists: async () => {
        throw Object.assign(new Error("x"), { reason: "fetch_failed" });
      },
      getMoviesSample: okSample,
    });
    await c.refresh();
    fail = true;
    const p = await c.refresh();
    expect(p.source).toBe("maoyan-netstart");
    expect(p.degraded).toBe(true);
  });

  it("refresh 把 cityId 传给 L1", async () => {
    let seen: any;
    const c = createMoviesCache({
      httpClient: {},
      fetchMaoyanLists: async (opts: any) => {
        seen = opts;
        return OK_NETSTART;
      },
      fetchTmdbLists: async () => OK_TMDB,
      getMoviesSample: okSample,
    });
    await c.refresh({ cityId: 30 });
    expect(seen.cityId).toBe(30);
    expect(c.load().cityId).toBe(30);
  });

  it("getItem 能从片单找到影片", async () => {
    const { c } = build();
    await c.refresh();
    expect(c.getItem("1").title).toBe("A");
    expect(c.getItem("2").title).toBe("B");
    expect(c.getItem("missing")).toBeNull();
  });

  it("香港跳过猫眼，直接 TMDB region=HK", async () => {
    const calls: string[] = [];
    let tmdbOpts: any;
    const c = createMoviesCache({
      httpClient: {},
      tmdbApiKey: "KEY",
      fetchMaoyanLists: async () => {
        calls.push("maoyan");
        return OK_NETSTART;
      },
      fetchTmdbLists: async (opts: any) => {
        tmdbOpts = opts;
        calls.push("tmdb");
        return OK_TMDB;
      },
      getMoviesSample: okSample,
    });
    const p = await c.refresh({ cityId: 90001 });
    expect(calls).toEqual(["tmdb"]);
    expect(tmdbOpts.region).toBe("HK");
    expect(tmdbOpts.language).toBe("zh-HK");
    expect(p.source).toBe("tmdb");
    expect(p.cityId).toBe(90001);
  });

  it("切到港澳时不复用内地 stale 片单", async () => {
    const c = createMoviesCache({
      httpClient: {},
      tmdbApiKey: "",
      fetchMaoyanLists: async () => OK_NETSTART,
      fetchTmdbLists: async () => OK_TMDB,
      getMoviesSample: okSample,
    });
    await c.refresh({ cityId: 1 });
    const p = await c.refresh({ cityId: 90002 });
    expect(p.source).toBe("sample");
    expect(p.cityId).toBe(90002);
  });
});
