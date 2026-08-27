// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";

const SAMPLE_PAYLOAD = () => ({
  watches: [
    {
      id: "piaoniu:778118",
      platform: "piaoniu",
      activityId: "778118",
      url: "https://www.piaoniu.com/activity/778118",
      createdAt: 1,
    },
  ],
  snapshots: {
    "piaoniu:778118": {
      platform: "piaoniu",
      key: "piaoniu:778118",
      title: "[深圳]G.E.M.邓紫棋演唱会",
      detailUrl: "https://www.piaoniu.com/activity/778118",
      sessions: [
        { id: "ev1", name: "10-01", minPrice: "1301.5", currencySymbol: "¥", status: "ONSALE", hasTicket: true },
        { id: "ev2", name: "10-02", minPrice: "1348", currencySymbol: "¥", status: "ONSALE", hasTicket: true },
      ],
      fetchedAt: Date.now(),
      source: "piaoniu-api",
    },
  },
  fetchedAt: Date.now(),
  source: "live",
});

const mockApi = vi.hoisted(() => {
  // 可变槽：测试里用 __setRefresh / __setAdd 注入返回值（hoisted 里不能引外部 let）
  const slots: Record<string, any> = { refresh: null, add: null, remove: null };
  return {
    __set: (k: string, v: any) => {
      slots[k] = v;
    },
    __slots: slots,
    concertsLoad: vi.fn(async () => null),
    concertsRefresh: vi.fn(async () => slots.refresh),
    concertsAdd: vi.fn(async () => slots.add),
    concertsRemove: vi.fn(async () => slots.remove),
    onConcertsUpdated: vi.fn(() => () => {}),
  };
});

vi.mock("../../src/renderer/api.ts", () => ({ api: mockApi }));

import {
  concertsWatches,
  concertsSnapshots,
  concertsPrevSnapshots,
  concertsLoaded,
  concertsLoading,
  concertsError,
  concertsLastFetched,
  concertsLastRefreshAt,
  concertsAddBusy,
  concertsAddError,
  applyConcertsPayload,
  bootstrapConcertsTab,
  refreshConcerts,
  addConcertWatch,
  removeConcertWatch,
  computeSessionDeltas,
  computeTierDeltas,
  flattenSnapshotTiers,
  tierUnitPrice,
  formatConcertsFetchedAt,
} from "../../src/renderer/concerts/store.ts";

function reset() {
  concertsWatches.value = [];
  concertsSnapshots.value = {};
  concertsPrevSnapshots.value = {};
  concertsLoaded.value = false;
  concertsLoading.value = false;
  concertsError.value = null;
  concertsLastFetched.value = 0;
  concertsLastRefreshAt.value = 0;
  concertsAddBusy.value = false;
  concertsAddError.value = null;
}

beforeEach(() => {
  // signals 复位 + 清 mock 调用历史（保留 hoisted 闭包里的实现）
  vi.clearAllMocks();
  reset();
});

describe("concerts store", () => {
  it("applyConcertsPayload 填充 signals；无效 payload 忽略", () => {
    applyConcertsPayload(null as any);
    expect(concertsLoaded.value).toBe(false);
    const p = SAMPLE_PAYLOAD();
    applyConcertsPayload(p);
    expect(concertsLoaded.value).toBe(true);
    expect(concertsWatches.value).toHaveLength(1);
    expect(concertsSnapshots.value["piaoniu:778118"].sessions[0].minPrice).toBe("1301.5");
    expect(concertsError.value).toBeNull();
  });

  it("带 error 标的快照 → degraded 提示文案", () => {
    const p = SAMPLE_PAYLOAD();
    p.snapshots["piaoniu:778118"].error = "fetch_failed";
    applyConcertsPayload(p);
    expect(concertsError.value).toContain("部分场次刷新失败");
  });

  it("refreshConcerts 成功：旧快照进 prev（涨跌基准）", async () => {
    const before = SAMPLE_PAYLOAD();
    applyConcertsPayload(before);
    const next = SAMPLE_PAYLOAD();
    next.snapshots["piaoniu:778118"].sessions[0].minPrice = "999";
    mockApi.__set("refresh", next);
    const ok = await refreshConcerts();
    expect(ok).toBe(true);
    expect(concertsPrevSnapshots.value["piaoniu:778118"].sessions[0].minPrice).toBe("1301.5");
    expect(concertsSnapshots.value["piaoniu:778118"].sessions[0].minPrice).toBe("999");
  });

  it("30 秒冷却内重复刷新被拒", async () => {
    concertsLastRefreshAt.value = Date.now();
    const ok = await refreshConcerts();
    expect(ok).toBe(false);
    expect(mockApi.concertsRefresh).not.toHaveBeenCalled();
  });

  it("bootstrap：缓存过期 → 自动 refresh", async () => {
    mockApi.concertsLoad.mockResolvedValueOnce({
      ...SAMPLE_PAYLOAD(),
      fetchedAt: Date.now() - 10 * 60 * 1000,
    });
    mockApi.__set("refresh", SAMPLE_PAYLOAD());
    await bootstrapConcertsTab();
    expect(mockApi.concertsRefresh).toHaveBeenCalledTimes(1);
  });

  it("addConcertWatch 失败 → 错误文案映射 invalid_url", async () => {
    mockApi.__set("add", { ok: false, reason: "invalid_url" });
    const ok = await addConcertWatch("not-a-url");
    expect(ok).toBe(false);
    expect(concertsAddError.value).toContain("无法识别的链接");
    expect(concertsAddBusy.value).toBe(false);
  });

  it("removeConcertWatch 成功 → 用返回的 payload 直接落地", async () => {
    const p = SAMPLE_PAYLOAD();
    p.watches = [];
    delete p.snapshots["piaoniu:778118"];
    mockApi.__set("remove", { ok: true, payload: p });
    const ok = await removeConcertWatch("piaoniu:778118");
    expect(ok).toBe(true);
    expect(concertsWatches.value).toHaveLength(0);
  });
});

describe("computeSessionDeltas", () => {
  function snap(prices: Record<string, string | null>) {
    return {
      sessions: Object.entries(prices).map(([id, minPrice]) => ({
        id,
        minPrice,
        hasTicket: minPrice != null,
      })),
    };
  }

  it("同场次价差 → 正/负值；新场次与无变化不产生条目", () => {
    const current = { k: snap({ ev1: "1200", ev2: "1500", ev3: null, ev4: "800" }) };
    const prev = { k: snap({ ev1: "1301.5", ev2: "1500", ev3: null }) };
    const d = computeSessionDeltas(current as any, prev as any);
    expect(d.k.ev1).toBe(-101.5);
    expect(d.k.ev2).toBeUndefined(); // 无变化
    expect(d.k.ev3).toBeUndefined(); // 双方都无价
    expect(d.k.ev4).toBeUndefined(); // 新场次无基准
  });

  it("prev 缺 key / 输入为空 → 空结果不抛", () => {
    expect(computeSessionDeltas({}, {})).toEqual({});
    const cur = { k: snap({ ev1: "1" }) };
    expect(computeSessionDeltas(cur as any, undefined as any)).toEqual({});
  });
});

describe("computeTierDeltas / flattenSnapshotTiers", () => {
  function withTiers(tiersBySession: Record<string, any[]>) {
    return {
      sessions: Object.entries(tiersBySession).map(([id, tiers]) => ({
        id,
        name: id,
        tiers,
      })),
    };
  }

  it("同票档价差 → 正/负；无变化 / 新档无基准跳过", () => {
    const current = {
      k: withTiers({
        ev1: [
          { id: "t-a", lowPrice: "280", hasTicket: true },
          { id: "t-b", lowPrice: "350", hasTicket: true },
          { id: "t-c", lowPrice: "540", hasTicket: true },
        ],
      }),
    };
    const prev = {
      k: withTiers({
        ev1: [
          { id: "t-a", lowPrice: "300", hasTicket: true },
          { id: "t-b", lowPrice: "350", hasTicket: true },
        ],
      }),
    };
    const d = computeTierDeltas(current as any, prev as any);
    expect(d.k["t-a"]).toBe(-20);
    expect(d.k["t-b"]).toBeUndefined();
    expect(d.k["t-c"]).toBeUndefined();
  });

  it("指定张数时比 qtyPrices 单价，不是 lowPrice", () => {
    const mk = (sale1: string, sale2: string) =>
      withTiers({
        ev1: [
          {
            id: "t1",
            lowPrice: sale1,
            hasTicket: true,
            qtyPrices: [
              { qty: 1, salePrice: sale1 },
              { qty: 2, salePrice: sale2 },
            ],
          },
        ],
      });
    const d = computeTierDeltas({ k: mk("280", "300") } as any, { k: mk("280", "320") } as any, {
      k: { t1: 2 },
    });
    expect(d.k.t1).toBe(-20); // 2张：300-320
  });

  it("tierUnitPrice / flattenSnapshotTiers", () => {
    expect(tierUnitPrice({ lowPrice: "1", qtyPrices: [{ qty: 2, salePrice: "9" }] }, 2)).toBe("9");
    const flat = flattenSnapshotTiers(
      withTiers({
        ev1: [{ id: "t1", lowPrice: "1", hasTicket: true }],
        ev2: [{ id: "t2", lowPrice: null, hasTicket: false }],
      }),
    );
    expect(flat).toHaveLength(2);
    expect(flat[0]).toMatchObject({ id: "t1", sessionId: "ev1" });
  });
});

describe("formatConcertsFetchedAt", () => {
  it("刚刚 / 分钟 / 小时 / 天", () => {
    const now = new Date(2026, 7, 27, 12, 0, 0).getTime();
    expect(formatConcertsFetchedAt(0)).toBe("");
    expect(formatConcertsFetchedAt(now - 30 * 1000, now)).toBe("刚刚");
    expect(formatConcertsFetchedAt(now - 3 * 60 * 1000, now)).toBe("3 分钟前");
    expect(formatConcertsFetchedAt(now - 2 * 3600 * 1000, now)).toBe("2 小时前");
    expect(formatConcertsFetchedAt(now - 26 * 3600 * 1000, now)).toBe("1 天前");
  });
});
