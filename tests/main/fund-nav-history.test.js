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
  // 2026-07-15: 东财硬上限 pageSize=20, 必须分页; 把 days 当 pageSize 会 Data:null
  it("请求 45 天时按 pageSize=20 分页拼齐", async () => {
    const urls = [];
    let call = 0;
    const fakeHttp = {
      async get(url) {
        urls.push(url);
        call += 1;
        const n = call < 3 ? 20 : 5;
        const list = Array.from({ length: n }, (_, i) => ({
          FSRQ: `2026-${String(call).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
          DWJZ: "1.0",
        }));
        return {
          status: 200,
          body: JSON.stringify({ Data: { LSJZList: list }, TotalCount: 45 }),
          headers: {},
        };
      },
    };
    const r = await fetchFundNavHistory("000001", fakeHttp, { days: 45 });
    expect(r.ok).toBe(true);
    expect(urls.length).toBe(3);
    expect(urls.every((u) => u.includes("pageSize=20"))).toBe(true);
    expect(urls.some((u) => u.includes("pageIndex=1"))).toBe(true);
    expect(urls.some((u) => u.includes("pageIndex=3"))).toBe(true);
    expect(r.series.length).toBe(45);
  });
  it("URL 永不携带 pageSize=365 (东财会返回空)", async () => {
    const urls = [];
    const fakeHttp = {
      async get(url) {
        urls.push(url);
        return {
          status: 200,
          body: JSON.stringify({
            Data: { LSJZList: [{ FSRQ: "2026-07-01", DWJZ: "1.0" }] },
            TotalCount: 1,
          }),
          headers: {},
        };
      },
    };
    await fetchFundNavHistory("000001", fakeHttp, { days: 365 });
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => !u.includes("pageSize=365"))).toBe(true);
    expect(urls.every((u) => u.includes("pageSize=20"))).toBe(true);
  });
});
