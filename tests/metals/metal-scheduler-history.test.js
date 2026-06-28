import { describe, it, expect, beforeEach } from "vitest";
import { MetalScheduler } from "../../src/metals/metal-scheduler.js";

describe("MetalScheduler.snapshotDailyClose", () => {
  let sched;
  beforeEach(() => {
    sched = new MetalScheduler({ httpGet: async () => "" });
  });

  it("空 quotes 不抛, historyMap 不变", () => {
    const h = { XAU: [] };
    sched.snapshotDailyClose({}, h);
    expect(h).toEqual({ XAU: [] });
  });

  it("同日重复调用 → 不重复写", () => {
    const h = {};
    const now = new Date("2026-06-28T10:00:00");
    sched.snapshotDailyClose({ XAU: { price: 100 } }, h, now);
    sched.snapshotDailyClose({ XAU: { price: 105 } }, h, now);
    expect(h.XAU.length).toBe(1);
    expect(h.XAU[0].close).toBe(100);
  });

  it("不同日 → 累加, 按 date 升序", () => {
    const h = {};
    sched.snapshotDailyClose(
      { XAU: { price: 100 } },
      h,
      new Date("2026-06-28T10:00:00"),
    );
    sched.snapshotDailyClose(
      { XAU: { price: 105 } },
      h,
      new Date("2026-06-29T10:00:00"),
    );
    expect(h.XAU.length).toBe(2);
    expect(h.XAU[0].date).toBe("2026-06-28");
    expect(h.XAU[1].date).toBe("2026-06-29");
  });

  it("超 30 天 → 裁剪, 保留最近 30", () => {
    const h = {};
    for (let i = 0; i < 35; i++) {
      const d = new Date("2026-05-01T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i);
      sched.snapshotDailyClose(
        { XAU: { price: 100 + i } },
        h,
        d,
      );
    }
    expect(h.XAU.length).toBe(30);
    // 35 - 30 = 5 day offset: oldest kept is i=5 (2026-05-06)
    expect(h.XAU[0].date).toBe("2026-05-06");
    // newest is i=34 (2026-06-04)
    expect(h.XAU[29].date).toBe("2026-06-04");
  });

  it("price 非数 → 跳过该品种", () => {
    const h = {};
    sched.snapshotDailyClose({ XAU: { price: NaN } }, h, new Date());
    sched.snapshotDailyClose({ XAG: { price: 100 } }, h, new Date());
    expect(h.XAU).toBeUndefined();
    expect(h.XAG.length).toBe(1);
  });
});

describe("MetalScheduler.detectHistoryGap", () => {
  it("全空 → need 含全部品种", () => {
    const sched = new MetalScheduler({ httpGet: async () => "" });
    const configMetals = [
      { id: "XAU", historySecid: "113.AU2608", unitDivisor: 1 },
      { id: "XAG", historySecid: "113.AG2608", unitDivisor: 1000 },
      { id: "AU9999", historySecid: "118.AU9999", unitDivisor: 1 },
      { id: "AG9999", historySecid: "118.AG9999", unitDivisor: 1000 },
    ];
    const r = sched.detectHistoryGap({}, configMetals);
    expect(r.need.length).toBe(4);
    expect(r.need.map((n) => n.id).sort()).toEqual([
      "AG9999",
      "AU9999",
      "XAG",
      "XAU",
    ]);
  });

  it("全满 (各 ≥ 30) → need 空", () => {
    const sched = new MetalScheduler({ httpGet: async () => "" });
    const configMetals = [
      { id: "XAU", historySecid: "113.AU2608", unitDivisor: 1 },
    ];
    const full = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, "0")}`,
      close: 100,
    }));
    const r = sched.detectHistoryGap({ XAU: full }, configMetals);
    expect(r.need).toEqual([]);
  });

  it("部分缺口 → 只列缺口品种", () => {
    const sched = new MetalScheduler({ httpGet: async () => "" });
    const configMetals = [
      { id: "XAU", historySecid: "113.AU2608", unitDivisor: 1 },
      { id: "AU9999", historySecid: "118.AU9999", unitDivisor: 1 },
    ];
    const full = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, "0")}`,
      close: 100,
    }));
    const r = sched.detectHistoryGap({ XAU: full }, configMetals);
    expect(r.need.length).toBe(1);
    expect(r.need[0].id).toBe("AU9999");
  });
});