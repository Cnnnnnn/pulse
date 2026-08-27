import { describe, it, expect } from "vitest";
const { requireMain } = require("../_setup/require-main.cjs");
const { createConcertsCache, createFilePersist } = requireMain("concerts/cache");

function piaoniuSnap(key: string, minPrice: string) {
  return {
    platform: "piaoniu",
    key,
    title: `演出 ${key}`,
    detailUrl: "https://www.piaoniu.com/activity/x",
    sessions: [{ id: "ev1", name: "10-01 19:30", minPrice, currencySymbol: "¥", status: "ONSALE", hasTicket: true }],
    fetchedAt: Date.now(),
    source: "piaoniu-api",
  };
}

function watch(id: string) {
  if (id.startsWith("piaoniu")) {
    const activityId = id.split(":")[1];
    return { id, platform: "piaoniu", activityId, url: "https://www.piaoniu.com/activity/" + activityId };
  }
  const [, rest] = id.split(":");
  const [tourId, showId] = rest.split("/");
  return { id, platform: "moretickets", tourId, showId, url: "https://x" };
}

/** 双 fetcher 注入：key→快照 或 Error（带 reason） */
function makeDeps(results: Record<string, any>, persistedState?: any) {
  let saveCalls = 0;
  const updates: any[] = [];
  const cache = createConcertsCache({
    httpClient: {},
    getWatches: () => Object.keys(results).map(watch),
    fetchPiaoniu: async ({ activityId }: any) => {
      const key = `piaoniu:${activityId}`;
      if (results[key] instanceof Error) throw results[key];
      return results[key];
    },
    fetchPiaoniuTiers: async ({ eventId }: any) => ({
      ok: true,
      eventId: String(eventId),
      tiers: [{ id: "t1", name: "看台", lowPrice: "280", hasTicket: true }],
    }),
    fetchPiaoniuQtyPrices: async () => ({
      ok: true,
      eventId: "ev1",
      ticketCategoryId: "t1",
      qtyPrices: [
        { qty: 1, salePrice: "280" },
        { qty: 2, salePrice: "300" },
      ],
    }),
    fetchMoretickets: async ({ tourId }: any) => {
      const hit = Object.keys(results).find((k) => k === `moretickets:${tourId}/`);
      throw new Error("unexpected moretickets call " + String(hit));
    },
    persist: {
      read: () => persistedState ?? null,
      write: (s: any) => {
        saveCalls++;
        expect(s.payload).toBeTruthy();
      },
    },
    onUpdate: (p: any) => updates.push(p),
  });
  return { cache, updates, saveCallsRef: () => saveCalls };
}

describe("createConcertsCache.refresh", () => {
  it("全部成功 → 快照齐全 + 落盘 + 推送更新", async () => {
    const deps = makeDeps({
      "piaoniu:778118": piaoniuSnap("piaoniu:778118", "1301.5"),
      "piaoniu:100": piaoniuSnap("piaoniu:100", "480"),
    });
    const payload = await deps.cache.refresh();
    expect(Object.keys(payload.snapshots)).toHaveLength(2);
    expect(payload.snapshots["piaoniu:778118"].sessions[0].minPrice).toBe("1301.5");
    // 票牛刷新后嵌 tiers + 在售档 qtyPrices
    expect(payload.snapshots["piaoniu:778118"].sessions[0].tiers[0]).toMatchObject({
      id: "t1",
      lowPrice: "280",
      qtyPrices: [
        { qty: 1, salePrice: "280" },
        { qty: 2, salePrice: "300" },
      ],
    });
    expect(payload.source).toBe("live");
    expect(deps.updates.length).toBe(1);
    expect(deps.saveCallsRef()).toBe(1);
  });

  it("票档拉取失败 → session.tiers 空数组，不拖垮整场", async () => {
    const cache = createConcertsCache({
      httpClient: {},
      getWatches: () => [watch("piaoniu:x")],
      fetchPiaoniu: async () => piaoniuSnap("piaoniu:x", "100"),
      fetchPiaoniuTiers: async () => {
        throw Object.assign(new Error("tiers down"), { reason: "http_timeout" });
      },
      fetchPiaoniuQtyPrices: async () => ({ ok: true, qtyPrices: [] }),
      persist: { read: () => null, write: () => {} },
    });
    const payload = await cache.refresh();
    expect(payload.snapshots["piaoniu:x"].sessions[0].tiers).toEqual([]);
    expect(payload.snapshots["piaoniu:x"].error).toBeUndefined();
  });

  it("缺货档不拉 qtyPrices；在售档 qty 失败仍保留票档", async () => {
    let qtyCalls = 0;
    const cache = createConcertsCache({
      httpClient: {},
      getWatches: () => [watch("piaoniu:y")],
      fetchPiaoniu: async () => piaoniuSnap("piaoniu:y", "100"),
      fetchPiaoniuTiers: async () => ({
        ok: true,
        eventId: "ev1",
        tiers: [
          { id: "out", name: "缺货", hasTicket: false },
          { id: "on", name: "在售", lowPrice: "200", hasTicket: true },
        ],
      }),
      fetchPiaoniuQtyPrices: async ({ ticketCategoryId }: any) => {
        qtyCalls++;
        if (ticketCategoryId === "on") throw new Error("qty fail");
        return { ok: true, qtyPrices: [] };
      },
      persist: { read: () => null, write: () => {} },
    });
    const payload = await cache.refresh();
    const tiers = payload.snapshots["piaoniu:y"].sessions[0].tiers;
    expect(qtyCalls).toBe(1); // 只打在售档
    expect(tiers[0].qtyPrices).toBeUndefined();
    expect(tiers[1].id).toBe("on");
    expect(tiers[1].qtyPrices).toBeUndefined(); // 失败不写
  });

  it("单个源失败 → 该 key 回退旧快照 + error 标；其余正常", async () => {
    const prev = await makeDeps({
      "piaoniu:a1": piaoniuSnap("piaoniu:a1", "100"),
      "piaoniu:b2": piaoniuSnap("piaoniu:b2", "200"),
    }).cache.refresh();

    // 第二轮：b2 挂了
    const err = Object.assign(new Error("concerts: piaoniu http_timeout: timeout"), {
      reason: "http_timeout",
    });
    let round = 0;
    const updates: any[] = [];
    const disk = { payload: prev };
    const cache = createConcertsCache({
      httpClient: {},
      getWatches: () => ["piaoniu:a1", "piaoniu:b2"].map(watch),
      fetchPiaoniu: async ({ activityId }: any) => {
        round++;
        if (activityId === "b2") throw err;
        return piaoniuSnap(`piaoniu:${activityId}`, "101");
      },
      fetchPiaoniuTiers: async () => ({ ok: true, eventId: "ev1", tiers: [] }),
      fetchPiaoniuQtyPrices: async () => ({ ok: true, qtyPrices: [] }),
      persist: {
        read: () => disk,
        write: (s: any) => {
          disk.payload = s.payload;
        },
      },
      onUpdate: (p: any) => updates.push(p),
    });

    const payload = await cache.refresh();
    expect(payload.snapshots["piaoniu:a1"].sessions[0].minPrice).toBe("101");
    // b2 失败保留旧快照 + 打错因标
    expect(payload.snapshots["piaoniu:b2"].error).toBeTruthy();
    expect(payload.snapshots["piaoniu:b2"].sessions[0].minPrice).toBe("200");
    expect(updates.length).toBe(1); // refresh 内部推送一次
  });

  it("首次就失败且无旧数据 → 带原始 reason 的占位快照", async () => {
    const err = Object.assign(new Error("boom"), { reason: "parse_failed" });
    const { cache } = createSingleWith({ "piaoniu:c3": err });
    const payload = await cache.refresh();
    const snap = payload.snapshots["piaoniu:c3"];
    expect(snap.error).toBe("parse_failed");
    expect(snap.sessions).toEqual([]);
  });

  it("并发去重：inflight 期间只发起一次网络抓取", async () => {
    let resolveFetch!: (v: any) => void;
    let fetchCount = 0;
    const updates: any[] = [];
    const cache = createConcertsCache({
      httpClient: {},
      getWatches: () => [watch("piaoniu:d4")],
      fetchPiaoniu: async () => {
        fetchCount++;
        return new Promise((res) => {
          resolveFetch = res as any;
        });
      },
      fetchPiaoniuTiers: async () => ({ ok: true, eventId: "ev1", tiers: [] }),
      fetchPiaoniuQtyPrices: async () => ({ ok: true, qtyPrices: [] }),
      persist: { read: () => null, write: () => {} },
      onUpdate: (p: any) => updates.push(p),
    });
    const p1 = cache.refresh();
    const p2 = cache.refresh();
    resolveFetch(piaoniuSnap("piaoniu:d4", "9"));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(fetchCount).toBe(1);
    expect(r1.snapshots["piaoniu:d4"].sessions[0].minPrice).toBe("9");
    expect(r2).toEqual(r1);
  });
});

describe("addAndFetch / load", () => {
  it("新增 watch 立即拉取并写入缓存 + 其它 watch 补 pending 占位", async () => {
    const { cache } = createSingleWith({ "piaoniu:e5": piaoniuSnap("piaoniu:e5", "77") }, []);
    const payload = await cache.addAndFetch(watch("piaoniu:e5"));
    expect(payload.snapshots["piaoniu:e5"].title).toContain("e5");
  });

  it("load 未命中磁盘 → null；命中 → 原样返回", async () => {
    const diskState = {
      payload: {
        watches: [watch("piaoniu:f6")],
        snapshots: { "piaoniu:f6": piaoniuSnap("piaoniu:f6", "12") },
        fetchedAt: 123,
        source: "live",
      },
    };
    const cache = createConcertsCache({
      httpClient: {},
      getWatches: () => [],
      persist: { read: () => diskState, write: () => {} },
    });
    const loaded = cache.load();
    expect(loaded.fetchedAt).toBe(123);
    expect(loaded.snapshots["piaoniu:f6"].sessions[0].minPrice).toBe("12");

    const empty = createConcertsCache({
      httpClient: {},
      getWatches: () => [],
      persist: { read: () => null, write: () => {} },
    });
    expect(empty.load()).toBeNull();
  });

  it("ttl 暴露共享常量值", () => {
    const { CACHE_TTL_MS } = requireMain("concerts/cache");
    expect(CACHE_TTL_MS).toBe(120000);
  });
});

function createSingleWith(results: Record<string, any>, extraWatches?: any[]) {
  const updates: any[] = [];
  const keys = Object.keys(results);
  const cache = createConcertsCache({
    httpClient: {},
    getWatches: () => (extraWatches !== undefined ? extraWatches : keys.map(watch)),
    fetchPiaoniu: async ({ activityId }: any) => {
      const v = results[`piaoniu:${activityId}`];
      if (v instanceof Promise) return v;
      if (v instanceof Error) throw v;
      if (!v) throw Object.assign(new Error("missing"), { reason: "fetch_failed" });
      return v;
    },
    fetchPiaoniuTiers: async ({ eventId }: any) => ({
      ok: true,
      eventId: String(eventId),
      tiers: [],
    }),
    fetchPiaoniuQtyPrices: async () => ({ ok: true, qtyPrices: [] }),
    persist: {
      read: () => null,
      write: () => {},
    },
    onUpdate: (p: any) => updates.push(p),
  });
  return { cache, updates };
}
