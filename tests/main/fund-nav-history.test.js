// tests/main/fund-nav-history.test.js
import { describe, it, expect } from "vitest";
import { parseLsjzResponse, fetchFundNavHistory } from "../../src/funds/fund-nav-history.js";

const SAMPLE = {
  Data: { LSJZList: [
    { FSRQ: "2026-07-10", DWJZ: "1.2345", LJJZ: "2.1" },
    { FSRQ: "2026-07-09", DWJZ: "1.2200", LJJZ: "2.08" },
    { FSRQ: "2026-07-08", DWJZ: "", LJJZ: "2.05" }, // 无效 nav, 应被过滤
  ]},
};

describe("parseLsjzResponse", () => {
  it("映射DWJZ并按日期升序, 过滤无效nav", () => {
    const out = parseLsjzResponse(SAMPLE);
    expect(out).toEqual([
      { date: "2026-07-09", nav: 1.22 },
      { date: "2026-07-10", nav: 1.2345 },
    ]);
  });
  it("形状非法时抛错", () => {
    expect(() => parseLsjzResponse({})).toThrow();
  });
});

describe("fetchFundNavHistory", () => {
  it("200 → ok + series", async () => {
    const fakeHttp = { async get() { return { status: 200, body: JSON.stringify(SAMPLE), headers: {} }; } };
    const r = await fetchFundNavHistory("000001", fakeHttp, { days: 30 });
    expect(r.ok).toBe(true);
    expect(r.series.length).toBe(2);
  });
  it("非200 → ok:false + reason", async () => {
    const fakeHttp = { async get() { return { status: 403, body: "", headers: {} }; } };
    const r = await fetchFundNavHistory("000001", fakeHttp, { days: 30 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/403/);
  });
});
