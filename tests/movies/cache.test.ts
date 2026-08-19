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

  it("load() 返回最近一次 refresh 的 payload 快照", async () => {
    const { c } = build();
    expect(c.load()).toBeNull(); // 初始空
    const p = await c.refresh();
    const loaded = c.load();
    expect(loaded.source).toBe("maoyan-netstart");
    expect(loaded.nowPlaying).toEqual(p.nowPlaying);
  });
});
