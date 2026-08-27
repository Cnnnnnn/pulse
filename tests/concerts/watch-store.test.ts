import { describe, it, expect } from "vitest";
import {
  parseConcertWatchUrl,
  concertWatchKey,
  concertDetailUrl,
} from "../../src/shared/concerts-constants";
const { requireMain } = require("../_setup/require-main.cjs");
const { createConcertWatchlist } = requireMain("concerts/watch-store");

// DI 内存版 state（不碰真实 state.json）
function memoryState(initial: any = {}) {
  let state: any = { ...initial };
  return {
    loadState: () => state,
    patch: (updater: (s: any) => void) => updater(state), // 测试内同步执行，等价真实 patchState
  };
}

const PN_URL = "https://www.piaoniu.com/activity/778118";
const MT_URL = "https://www.moretickets.com/tour-detail?tourId=t1&showId=s1";
const MTL_URL =
  "https://m.motianlun.cn/package-buy/seat-and-seatplan/seat-and-seatplan?sessionId=6a5b2cbf47e3790001d8a2ca&showId=6a5b2cbf47e3790001d8a2c9&ticketCount=2";

describe("parseConcertWatchUrl", () => {
  it("票牛详情页 → piaoniu + activityId", () => {
    expect(parseConcertWatchUrl("https://www.piaoniu.com/activity/778118")).toEqual({
      platform: "piaoniu",
      activityId: "778118",
    });
    expect(parseConcertWatchUrl("https://www.piaoniu.com/activity/778118?channel=zy_dx_hy_yc_520490")).toMatchObject({
      platform: "piaoniu",
      activityId: "778118",
    });
    expect(parseConcertWatchUrl("https://m.piaoniu.com/activity/100")).toMatchObject({
      platform: "piaoniu",
      activityId: "100",
    });
  });

  it("摩天轮国内详情页 / 选座页 → showId（sessionId 可选）", () => {
    expect(parseConcertWatchUrl(MTL_URL)).toEqual({
      platform: "motianlun",
      showId: "6a5b2cbf47e3790001d8a2c9",
      sessionId: "6a5b2cbf47e3790001d8a2ca",
      ticketCount: 2,
    });
    expect(
      parseConcertWatchUrl(
        "https://m.motianlun.cn/pages/show-detail/show-detail?showId=6a5b2cbf47e3790001d8a2c9&utm_source=x",
      ),
    ).toEqual({
      platform: "motianlun",
      showId: "6a5b2cbf47e3790001d8a2c9",
      sessionId: undefined,
      ticketCount: undefined,
    });
    expect(
      parseConcertWatchUrl("https://m.motianlun.cn/show/6a5b2cbf47e3790001d8a2c9"),
    ).toEqual({
      platform: "motianlun",
      showId: "6a5b2cbf47e3790001d8a2c9",
      sessionId: undefined,
      ticketCount: undefined,
    });
  });

  it("摩天轮国际详情页 → tourId/showId（参数顺序不限）", () => {
    expect(
      parseConcertWatchUrl(
        "https://www.moretickets.com/tour-detail?tourId=6a8a9cd12025a8000108e84b&showId=6a8aa0b2a70b410001bd01ed",
      ),
    ).toEqual({
      platform: "moretickets",
      tourId: "6a8a9cd12025a8000108e84b",
      showId: "6a8aa0b2a70b410001bd01ed",
    });
    expect(
      parseConcertWatchUrl(
        "https://www.moretickets.com/tour-detail?showId=S2&utm=x&tourId=T1",
      ),
    ).toEqual({ platform: "moretickets", showId: "S2", tourId: "T1" });
  });

  it("非法输入 → null", () => {
    expect(parseConcertWatchUrl(null)).toBeNull();
    expect(parseConcertWatchUrl("")).toBeNull();
    expect(parseConcertWatchUrl("https://www.piaoniu.com/other/123")).toBeNull();
    expect(parseConcertWatchUrl("not a url")).toBeNull();
    expect(parseConcertWatchUrl("https://www.moretickets.com/tour-detail?tourId=x")).toBeNull();
  });
});

describe("createConcertWatchlist", () => {
  function make(initial = {}) {
    const mem = memoryState(initial);
    return createConcertWatchlist({ loadState: mem.loadState, patch: mem.patch, now: () => 42 });
  }

  it("add 票牛 → 归一化 watch 落盘", () => {
    const wl = make();
    const r = wl.add({ url: PN_URL });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.added).toBe(true);
      expect(r.item).toEqual({
        id: "piaoniu:778118",
        platform: "piaoniu",
        activityId: "778118",
        url: PN_URL,
        createdAt: 42,
      });
    }
    expect(wl.list()).toHaveLength(1);
  });

  it("add 摩天轮国内 → id 仅 showId，保留 ticketCount", () => {
    const wl = make();
    const r = wl.add({ url: MTL_URL });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.item.id).toBe("motianlun:6a5b2cbf47e3790001d8a2c9");
      expect(r.item.platform).toBe("motianlun");
      expect(r.item.ticketCount).toBe(2);
    }
  });

  it("add 摩天轮国际 → id 含 tourId/showId 两段", () => {
    const wl = make();
    const r = wl.add({ url: MT_URL });
    expect((r as any).item.id).toBe("moretickets:t1/s1");
  });

  it("重复 add 幂等（added=false，返回已有项）", () => {
    const wl = make();
    wl.add({ url: PN_URL });
    const r2 = wl.add({ url: PN_URL });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.added).toBe(false);
    expect(wl.list()).toHaveLength(1);
  });

  it("非法 URL → invalid_url 不落盘", () => {
    const wl = make();
    expect(wl.add({ url: "oops" })).toEqual({ ok: false, reason: "invalid_url" });
    expect(wl.add({})).toEqual({ ok: false, reason: "invalid_url" });
    expect(wl.list()).toHaveLength(0);
  });

  it("remove 删除既有项；删不存在项返回 ok=true（幂等）", () => {
    const wl = make();
    wl.add({ url: PN_URL });
    expect(wl.remove("piaoniu:778118").ok).toBe(true);
    expect(wl.list()).toHaveLength(0);
    expect(wl.remove("piaoniu:778118").ok).toBe(true);
    expect(wl.remove("").ok).toBe(false);
  });

  it("setWatchedTiers 钉选/清空/去重；不存在的 watch → not_found", () => {
    const wl = make();
    wl.add({ url: PN_URL });
    const r = wl.setWatchedTiers("piaoniu:778118", ["60153652", "60153652", "!!", "60153649"], {
      "60153652": 2,
      "60153649": 11,
      ghost: 1,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.item.watchedTierIds).toEqual(["60153652", "60153649"]);
      expect(r.item.watchedTierQty).toEqual({ "60153652": 2 });
    }
    const cleared = wl.setWatchedTiers("piaoniu:778118", []);
    expect(cleared.ok).toBe(true);
    if (cleared.ok) {
      expect(cleared.item.watchedTierIds).toBeUndefined();
      expect(cleared.item.watchedTierQty).toBeUndefined();
    }
    expect(wl.setWatchedTiers("piaoniu:nope", ["1"])).toEqual({ ok: false, reason: "not_found" });
    expect(wl.setWatchedTiers("", ["1"])).toEqual({ ok: false, reason: "invalid_args" });
  });

  it("list 过滤脏数据（platform 非法条目被剔除）", () => {
    const wl = createConcertWatchlist({
      loadState: () => ({
        concertWatchlist: [
          { id: "x", platform: "bogus" },
          { id: "piaoniu:9", platform: "piaoniu", url: "u", createdAt: 1 },
          null,
        ],
      }),
      patch: () => {},
    });
    expect(wl.list()).toHaveLength(1);
  });
});

describe("key/url helpers", () => {
  it("concertWatchKey / concertDetailUrl 往返一致", () => {
    const parsed = parseConcertWatchUrl(MT_URL)!;
    expect(concertWatchKey(parsed)).toBe("moretickets:t1/s1");
    expect(concertDetailUrl({ platform: "moretickets", tourId: "t1", showId: "s1" })).toContain(
      "tourId=t1&showId=s1",
    );
    expect(concertDetailUrl({ platform: "piaoniu", activityId: "778118" })).toContain("/activity/778118");
    expect(concertDetailUrl({ platform: "motianlun", showId: "abc" })).toContain("/show/abc");
    expect(concertDetailUrl({ platform: "piaoniu" })).toBe("");
  });
});
