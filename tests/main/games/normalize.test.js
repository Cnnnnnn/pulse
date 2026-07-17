/**
 * tests/main/games/normalize.test.js
 *
 * 规范化层 toGameDeal() 单测：缺字段兜底、savings 钳位、isFree 双判定。
 * fetchJson 超时/HTTP 错误用 vi.stubGlobal("fetch") 隔离。
 */
import { describe, it, expect, afterEach, vi } from "vitest";

const {
  toGameDeal,
  fetchJson,
  PLATFORM_KEYS,
} = require("../../../src/main/games/normalize.js");

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("toGameDeal — 缺字段兜底", () => {
  it("空对象回退全部默认值，platform 回退 steam", () => {
    const d = toGameDeal({});
    expect(d.platform).toBe("steam");
    expect(d.title).toBe("未知游戏");
    expect(d.salePrice).toBeNull();
    expect(d.normalPrice).toBeNull();
    expect(d.savings).toBe(0);
    expect(d.isFree).toBe(false);
    expect(d.store).toBe("Steam");
    expect(d.source).toBe("sample");
    expect(d.currency).toBe("USD");
    expect(typeof d.id).toBe("string");
    expect(d.id.length).toBeGreaterThan(0);
  });

  it("未知 platform 回退 steam", () => {
    const d = toGameDeal({ platform: "android", title: "X" });
    expect(d.platform).toBe("steam");
    expect(d.store).toBe("Steam");
  });

  it("合法 platform 原样保留", () => {
    for (const p of PLATFORM_KEYS) {
      expect(toGameDeal({ platform: p }).platform).toBe(p);
    }
  });

  it("id 缺失时用 platform-title 生成", () => {
    const d = toGameDeal({ platform: "epic", title: "Fortnite" });
    expect(d.id).toBe("epic-Fortnite");
  });
});

describe("toGameDeal — savings 钳位到 [0,100]", () => {
  it("负数归零", () => {
    expect(toGameDeal({ savings: -20 }).savings).toBe(0);
  });
  it("超过 100 截到 100", () => {
    expect(toGameDeal({ savings: 150 }).savings).toBe(100);
  });
  it("正常值四舍五入", () => {
    expect(toGameDeal({ savings: 85.4 }).savings).toBe(85);
    expect(toGameDeal({ savings: 85.6 }).savings).toBe(86);
  });
  it("null/undefined 归零", () => {
    expect(toGameDeal({ savings: null }).savings).toBe(0);
    expect(toGameDeal({}).savings).toBe(0);
  });
});

describe("toGameDeal — isFree 双判定", () => {
  it("显式 isFree=true", () => {
    expect(toGameDeal({ isFree: true }).isFree).toBe(true);
  });
  it("salePrice=0 且 normalPrice>0 推断为免费", () => {
    expect(toGameDeal({ salePrice: 0, normalPrice: 20 }).isFree).toBe(true);
  });
  it("salePrice=0 但 normalPrice=0 不算免费（未上架）", () => {
    expect(toGameDeal({ salePrice: 0, normalPrice: 0 }).isFree).toBe(false);
  });
  it("salePrice=0 但 normalPrice=null 不算免费", () => {
    expect(toGameDeal({ salePrice: 0, normalPrice: null }).isFree).toBe(false);
  });
});

describe("toGameDeal — 字段映射", () => {
  it("source 仅 'live' 原样保留，其余回退 sample", () => {
    expect(toGameDeal({ source: "live" }).source).toBe("live");
    expect(toGameDeal({ source: "xxx" }).source).toBe("sample");
    expect(toGameDeal({}).source).toBe("sample");
  });
  it("rating 数值化", () => {
    expect(toGameDeal({ rating: "88" }).rating).toBe(88);
    expect(toGameDeal({ rating: 88.6 }).rating).toBe(89);
    expect(toGameDeal({}).rating).toBeNull();
  });
  it("price 数值化，thumb/dealUrl 空值回退 null", () => {
    const d = toGameDeal({ salePrice: "19.99", normalPrice: "39.99" });
    expect(d.salePrice).toBeCloseTo(19.99);
    expect(d.normalPrice).toBeCloseTo(39.99);
    expect(toGameDeal({}).thumb).toBeNull();
    expect(toGameDeal({}).dealUrl).toBeNull();
  });
  it("保留合法免费活动元数据", () => {
    const deal = toGameDeal({
      promotionType: "key",
      requirements: "领取后激活",
      provider: "gamerpower",
    });

    for (const promotionType of [
      "giveaway",
      "key",
      "free-weekend",
      "free-play-days",
    ]) {
      expect(toGameDeal({ promotionType }).promotionType).toBe(promotionType);
    }
    expect(deal.requirements).toBe("领取后激活");
    expect(deal.provider).toBe("gamerpower");
  });
  it("非法免费活动类型回退 null", () => {
    for (const promotionType of ["unknown", undefined, 123]) {
      expect(toGameDeal({ promotionType }).promotionType).toBeNull();
    }
  });
  it("requirements/provider 非有效字符串时回退 null", () => {
    for (const value of ["", "   ", null, 123]) {
      const deal = toGameDeal({ requirements: value, provider: value });
      expect(deal.requirements).toBeNull();
      expect(deal.provider).toBeNull();
    }
  });
});

describe("fetchJson — 超时与错误", () => {
  it("HTTP 非 2xx 抛错", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })));
    await expect(fetchJson("http://x")).rejects.toThrow(/HTTP 503/);
  });

  it("超时（AbortController）抛错", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, opts) =>
        new Promise((_resolve, reject) => {
          if (opts && opts.signal) {
            opts.signal.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }
        }),
      ),
    );
    const p = fetchJson("http://x", { timeoutMs: 100 });
    vi.advanceTimersByTime(150);
    await expect(p).rejects.toThrow();
  });

  it("成功返回解析后的 JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ hello: "world" }),
    })));
    await expect(fetchJson("http://x")).resolves.toEqual({ hello: "world" });
  });
});
