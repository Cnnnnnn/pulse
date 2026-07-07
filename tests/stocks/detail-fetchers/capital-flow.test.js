/**
 * tests/stocks/detail-fetchers/capital-flow.test.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchCapitalFlow } from "../../../src/stocks/detail-fetchers/capital-flow.js";

const emOK = (klines) => ({
  ok: true,
  status: 200,
  body: { data: { klines } },
});
const fail = () => ({ ok: false, status: 500, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

const kline = (date, main) => `${date},${main},0,0,0,0,0`;

beforeEach(() => vi.restoreAllMocks());

describe("fetchCapitalFlow", () => {
  it("sums 5d/10d main net inflow", async () => {
    // 15 天数据, main = [1..15] * 1e6. last5 = sum([11..15]) = 65e6. last10 = sum([6..15]) = 105e6.
    const klines = Array.from({ length: 15 }, (_, i) =>
      kline(`2026-06-${(i + 1).toString().padStart(2, "0")}`, (i + 1) * 1e6),
    );
    const http = makeClient([emOK(klines)]);
    const r = await fetchCapitalFlow(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.mainNetInflow5d).toBe(65e6);
    expect(r.data.mainNetInflow10d).toBe(105e6);
  });

  it("ok with zero inflow when klines empty (no data for this stock)", async () => {
    // ponytail: em fflow 接口对部分股票 (新股/小盘/北交所) 返 klines:[],
    // 视为"该股暂无资金流向数据" 而非失败, 返 ok + 0 让 UI 显式标"暂无".
    const http = makeClient([emOK([])]);
    const r = await fetchCapitalFlow(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.mainNetInflow5d).toBe(0);
    expect(r.data.mainNetInflow10d).toBe(0);
    expect(r.data.sampleCount).toBe(0);
  });

  it("all fail → graceful noData 占位 (避免 DataGapsIndicator 把它列入缺口)", async () => {
    const http = makeClient([fail(), fail()]);
    const r = await fetchCapitalFlow(http, { code: "600519" });
    // ponytail: 2026-07-07 全部失败时不再返 ok:false, 而是 noData 占位, 让
    // 资金卡显示 "暂无资金流向" + scoreCapital 走换手率 fallback.
    expect(r.ok).toBe(true);
    expect(r.data.noData).toBe(true);
    expect(r.data.mainNetInflow5d).toBe(0);
    expect(r.data.sampleCount).toBe(0);
  });
});
