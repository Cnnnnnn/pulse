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
const { fetchStockDetailAngles, fetchSingleAngle } = require("../../src/stocks/stock-detail-fetcher.js");

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

describe("fetchStockDetailAngles — lastSuccessAt / failureStreakCount", () => {
  // ponytail 2026-07-18 P0-1: 后端在 perAngle[k] 上挂 lastSuccessAt / failureStreakCount,
  //   让前端能区分"这次是 30 天没更新" vs "本接口真挂了".
  it("records lastSuccessAt and zero failureStreakCount on success", async () => {
    const out = await fetchStockDetailAngles(httpClient, "600519", ["price_trend"]);
    expect(out.perAngle.price_trend.status).toBe("ok");
    expect(typeof out.perAngle.price_trend.lastSuccessAt).toBe("number");
    expect(typeof out.perAngle.price_trend.failureStreakCount).toBe("number");
    expect(out.perAngle.price_trend.failureStreakCount).toBe(0);
  });

  it("accumulates failureStreakCount on repeated failures", async () => {
    // 每个 test 用独立 code 隔离 module 级 _angleHealth 状态
    const out1 = await fetchStockDetailAngles(httpClient, "300001", ["valuation"]);
    expect(out1.perAngle.valuation.status).toBe("failed");
    expect(out1.perAngle.valuation.failureStreakCount).toBe(1);
    expect(out1.perAngle.valuation.lastSuccessAt).toBeNull();

    const out2 = await fetchStockDetailAngles(httpClient, "300001", ["valuation"]);
    expect(out2.perAngle.valuation.failureStreakCount).toBe(2);

    // 成功后归零
    const out3 = await fetchStockDetailAngles(httpClient, "300001", ["price_trend"]);
    expect(out3.perAngle.price_trend.status).toBe("ok");
    expect(out3.perAngle.price_trend.failureStreakCount).toBe(0);
    expect(typeof out3.perAngle.price_trend.lastSuccessAt).toBe("number");
  });
});

describe("fetchSingleAngle — 单条数据重拉 (P0-1 polish #2, DataHealthPill retry)", () => {
  // ponytail: 跟 fetchStockDetailAngles 同 _angleHealth 状态机, 但只跑 1 条 angle.
  //   用于 stocks:angle-reload IPC handler. code/angleKey 缺失返 null (前端 catch 走 markAngleFailed).
  //   成功 / 失败 / exception 行为跟 fetchStockDetailAngles 一致 (复用 recordSuccess/recordFailure).

  it("ok 时: 返 {status:'ok', data, fetchedAt, lastSuccessAt, failureStreakCount:0}", async () => {
    const out = await fetchSingleAngle(httpClient, "600001", "price_trend");
    expect(out.status).toBe("ok");
    expect(out.angleKey).toBe("price_trend");
    expect(out.data.code).toBe("600001");
    expect(out.failureStreakCount).toBe(0);
    expect(typeof out.fetchedAt).toBe("number");
    expect(typeof out.lastSuccessAt).toBe("number");
  });

  it("failed 时 (ok=false from fetcher): 返 status='failed' + reason + error", async () => {
    const out = await fetchSingleAngle(httpClient, "600002", "valuation");
    expect(out.status).toBe("failed");
    expect(out.angleKey).toBe("valuation");
    expect(out.reason).toBe("fetch_failed");
    expect(out.error).toBe("network");
    expect(out.failureStreakCount).toBeGreaterThanOrEqual(1);
  });

  it("fetcher throw: 走 exception 路径, 失败计入 streak", async () => {
    const out = await fetchSingleAngle(httpClient, "600003", "throws_angle");
    expect(out.status).toBe("failed");
    expect(out.reason).toBe("exception");
    expect(out.error).toContain("boom");
  });

  it("code 缺失: 返 null (前端 silent return)", async () => {
    expect(await fetchSingleAngle(httpClient, null, "price_trend")).toBeNull();
    expect(await fetchSingleAngle(httpClient, "", "price_trend")).toBeNull();
  });

  it("angleKey 不在 ANGLE_DEFS: 返 null", async () => {
    expect(await fetchSingleAngle(httpClient, "600004", "unknown_key")).toBeNull();
  });

  it("连续失败后成功: failureStreakCount 归零, lastSuccessAt 重置", async () => {
    // 第一次失败 (新 code 避免跟之前 test 串状态)
    const fail = await fetchSingleAngle(httpClient, "600010", "valuation");
    expect(fail.status).toBe("failed");
    expect(fail.failureStreakCount).toBeGreaterThanOrEqual(1);

    // 第二次还是失败
    const fail2 = await fetchSingleAngle(httpClient, "600010", "valuation");
    expect(fail2.failureStreakCount).toBeGreaterThanOrEqual(2);

    // 成功后归零 + lastSuccessAt 存在
    const ok = await fetchSingleAngle(httpClient, "600010", "price_trend");
    expect(ok.status).toBe("ok");
    expect(ok.failureStreakCount).toBe(0);
    expect(typeof ok.lastSuccessAt).toBe("number");
  });
});