import { describe, it, expect } from "vitest";
import { fetchStocks, parseClist, mapRow } from "../../src/stocks/stock-fetcher";

// 假 httpClient: 返回固定 clist 响应
function mockClient(body) {
  return {
    get: async () => ({ status: 200, body, headers: {}, error: null }),
  };
}

const SAMPLE_BODY = JSON.stringify({
  data: {
    total: 2,
    diff: [
      {
        f12: "600519", f14: "贵州茅台", f2: 1685.2, f3: 1.23, f8: 0.5,
        f9: 18.5, f23: 6.8, f21: 28.4, f100: "食品饮料", f20: 2100000000000,
      },
      {
        f12: "600036", f14: "招商银行", f2: 35.4, f3: -0.45, f8: 1.2,
        f9: 5.6, f23: 0.9, f21: 17.2, f100: "银行", f20: 800000000000,
      },
    ],
  },
});

describe("parseClist", () => {
  it("extracts data.diff array", () => {
    const out = parseClist(SAMPLE_BODY);
    expect(out.total).toBe(2);
    expect(out.diff).toHaveLength(2);
  });

  it("returns empty on invalid JSON / missing data", () => {
    expect(parseClist("not json")).toEqual({ total: 0, diff: [] });
    expect(parseClist(JSON.stringify({ foo: 1 }))).toEqual({ total: 0, diff: [] });
    expect(parseClist(null)).toEqual({ total: 0, diff: [] });
  });
});

describe("mapRow", () => {
  it("maps east-money raw fields to stock keys", () => {
    const raw = {
      f12: "600519", f14: "贵州茅台", f2: 1685.2, f3: 1.23, f8: 0.5,
      f9: 18.5, f23: 6.8, f21: 28.4, f100: "食品饮料", f20: 2100000000000,
    };
    const row = mapRow(raw);
    expect(row).toEqual({
      code: "600519", name: "贵州茅台", price: 1685.2, changePct: 1.23,
      turnover: 0.5, pe: 18.5, pb: 6.8, roe: 28.4, industry: "食品饮料",
      marketCap: 2100000000000,
    });
  });

  it("handles null/missing fields gracefully", () => {
    const row = mapRow({ f12: "000001", f14: "X", f2: "-" });
    expect(row.code).toBe("000001");
    expect(row.name).toBe("X");
    expect(row.price).toBe(null); // "-" 非数 → null
    expect(row.pe).toBe(null);
  });

  it("returns null on non-object input", () => {
    expect(mapRow(null)).toBe(null);
    expect(mapRow(undefined)).toBe(null);
  });
});

describe("fetchStocks", () => {
  it("returns mapped rows + total + fetchedAt", async () => {
    const out = await fetchStocks(mockClient(SAMPLE_BODY));
    expect(out.total).toBe(2);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].code).toBe("600519");
    expect(typeof out.fetchedAt).toBe("number");
  });

  it("returns empty on HTTP error", async () => {
    const client = { get: async () => ({ status: 500, body: "", headers: {}, error: null }) };
    const out = await fetchStocks(client);
    expect(out.rows).toEqual([]);
    expect(out.total).toBe(0);
    expect(out.error).toBeTruthy();
  });

  it("returns empty on network error", async () => {
    const client = { get: async () => ({ status: 0, body: "", headers: {}, error: "timeout" }) };
    const out = await fetchStocks(client);
    expect(out.rows).toEqual([]);
    expect(out.error).toBe("timeout");
  });

  it("skips rows without a code", async () => {
    const body = JSON.stringify({
      data: {
        total: 2,
        diff: [
          { f12: "600519", f14: "贵州茅台" },
          { f14: "无代码的票" }, // 无 f12 → code null → 被过滤
        ],
      },
    });
    const out = await fetchStocks(mockClient(body));
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].code).toBe("600519");
  });
});
