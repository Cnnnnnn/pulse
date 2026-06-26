/**
 * tests/stocks/stock-detail-fetcher.test.js
 *
 * ponytail: vitest 1.6 的 vi.mock 只 hook ESM import, 不 hook CJS require
 * (vitest-dev/vitest#5359). stock-detail-fetcher.js 是 CJS, 内部用 require(...).
 * 改用 require.cache 注入模式 (见 tests/ai/stock-screener-advisor.test.js).
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const anglesPath = require.resolve("../../src/stocks/stock-detail-angles.js");
const fetcherPath = require.resolve("../../src/stocks/stock-detail-fetcher.js");

const mockPriceTrendFetcher = vi.fn(async (_http, { code }) => ({
  ok: true,
  data: { code, close: 100 },
}));
const mockValuationFetcher = vi.fn(async () => ({
  ok: false,
  reason: "fetch_failed",
  error: "network",
}));
const mockThrowsFetcher = vi.fn(async () => {
  throw new Error("boom");
});

const mockAngleDefs = [
  {
    key: "price_trend",
    label: "价格趋势",
    group: "行情",
    promptHint: "test",
    dataShape: "PriceTrendData",
    fetcher: mockPriceTrendFetcher,
  },
  {
    key: "valuation",
    label: "估值",
    group: "财务",
    promptHint: "test",
    dataShape: "ValuationData",
    fetcher: mockValuationFetcher,
  },
  {
    key: "throws_angle",
    label: "抛错",
    group: "异常",
    promptHint: "test",
    dataShape: "ThrowsData",
    fetcher: mockThrowsFetcher,
  },
];

function injectMockAngles() {
  require.cache[anglesPath] = {
    id: anglesPath,
    filename: anglesPath,
    loaded: true,
    exports: {
      ANGLE_DEFS: mockAngleDefs,
      getAngle: (k) => mockAngleDefs.find((a) => a.key === k) || null,
    },
  };
  delete require.cache[fetcherPath];
}

injectMockAngles();
const { fetchStockDetailAngles } = require("../../src/stocks/stock-detail-fetcher.js");

const httpClient = { get: vi.fn() };

describe("fetchStockDetailAngles", () => {
  it("returns perAngle with status for each angle", async () => {
    const out = await fetchStockDetailAngles(httpClient, "600519", ["price_trend", "valuation"]);
    expect(out.totalCount).toBe(2);
    expect(out.fulfilledCount).toBe(1);
    expect(out.perAngle.price_trend.status).toBe("ok");
    expect(out.perAngle.price_trend.data.code).toBe("600519");
    expect(out.perAngle.valuation.status).toBe("failed");
    expect(out.perAngle.valuation.reason).toBe("fetch_failed");
  });

  it("fulfilledCount=0 when all fail", async () => {
    const out = await fetchStockDetailAngles(httpClient, "600519", ["valuation"]);
    expect(out.fulfilledCount).toBe(0);
    expect(out.totalCount).toBe(1);
  });

  it("skips unknown angle keys", async () => {
    const out = await fetchStockDetailAngles(httpClient, "600519", ["price_trend", "unknown_key"]);
    expect(out.totalCount).toBe(1);
    expect(out.perAngle.price_trend.status).toBe("ok");
    expect(out.perAngle.unknown_key).toBeUndefined();
  });

  it("returns empty result for empty angles array", async () => {
    const out = await fetchStockDetailAngles(httpClient, "600519", []);
    expect(out.totalCount).toBe(0);
    expect(out.fulfilledCount).toBe(0);
    expect(Object.keys(out.perAngle)).toHaveLength(0);
  });

  it("isolates fetcher rejection as exception without breaking others", async () => {
    const out = await fetchStockDetailAngles(httpClient, "600519", ["price_trend", "throws_angle"]);
    expect(out.totalCount).toBe(2);
    expect(out.fulfilledCount).toBe(1);
    expect(out.perAngle.price_trend.status).toBe("ok");
    expect(out.perAngle.throws_angle.status).toBe("failed");
    expect(out.perAngle.throws_angle.reason).toBe("exception");
    expect(out.perAngle.throws_angle.error).toContain("boom");
  });
});