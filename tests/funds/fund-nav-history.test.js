// tests/funds/fund-nav-history.test.js
// T-C1a: 后端基准指数历史 — parseIndexResponse 解析 + fetchIndexHistory 契约 + 缓存读写.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  parseIndexResponse,
  fetchIndexHistory,
} from "../../src/funds/fund-nav-history.js";
import os from "os";
import path from "path";
import fs from "fs";
const { requireMain } = require("../_setup/require-main.cjs");
const {
  loadIndexHistory,
  saveIndexHistory,
} = requireMain("funds/fund-history-store");

describe("parseIndexResponse (T-C1a)", () => {
  it("映射 eastmoney kline 到 {date, value} 升序, 过滤无效", () => {
    const json = {
      data: {
        code: "000300",
        klines: [
          "2024-01-03,3320.81",
          "2024-01-02,3298.44",
          "bad-line",
          "2024-01-04,notanumber",
        ],
      },
    };
    const out = parseIndexResponse(json);
    expect(out).toEqual([
      { date: "2024-01-02", value: 3298.44 },
      { date: "2024-01-03", value: 3320.81 },
    ]);
  });

  it("无 klines → 抛错", () => {
    expect(() => parseIndexResponse({})).toThrow();
    expect(() => parseIndexResponse(null)).toThrow();
  });
});

// 内存态 mock httpClient
function mockHttpClient(body, { status = 200, error = null } = {}) {
  return {
    get: async () => ({ status, body, error, headers: {} }),
  };
}

describe("fetchIndexHistory (T-C1a)", () => {
  it("正常: 返回 {ok, series, reason:null}", async () => {
    const body = JSON.stringify({
      data: { code: "000300", klines: ["2024-01-02,3298.44", "2024-01-03,3320.81"] },
    });
    const out = await fetchIndexHistory("000300", mockHttpClient(body));
    expect(out.ok).toBe(true);
    expect(out.reason).toBeNull();
    expect(out.series).toHaveLength(2);
    expect(out.series[0].date).toBe("2024-01-02");
  });

  it("非法 symbol → ok:false, reason invalid_symbol", async () => {
    const out = await fetchIndexHistory("abc", mockHttpClient("{}"));
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("invalid_symbol");
  });

  it("HTTP 非 200 → ok:false, reason 带状态码", async () => {
    const out = await fetchIndexHistory("000300", mockHttpClient("{}", { status: 403 }));
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("HTTP 403");
  });

  it("网络错误 → ok:false, reason=network", async () => {
    const out = await fetchIndexHistory("000300", mockHttpClient("", { error: "network" }));
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("network");
  });

  it("days 参数截断到最近 N 条", async () => {
    const klines = [];
    for (let i = 1; i <= 10; i++) klines.push(`2024-02-${String(i).padStart(2, "0")},${3000 + i}`);
    const body = JSON.stringify({ data: { code: "000300", klines } });
    const out = await fetchIndexHistory("000300", mockHttpClient(body), { days: 3 });
    expect(out.series).toHaveLength(3);
    expect(out.series[0].date).toBe("2024-02-08");
  });
});

describe("indexHistory 缓存 (T-C1a)", () => {
  const tmp = path.join(os.tmpdir(), `fund-idx-test-${Date.now()}-${Math.random()}.json`);
  beforeEach(() => {
    // stateStore.load 要求顶层有 apps 字段, 否则返回 null.
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, ts: 0, apps: {}, mutes: {} }));
  });
  afterEach(() => {
    try { fs.unlinkSync(tmp); } catch {}
  });

  it("save → load 往返 (独立 key indexHistory[symbol])", () => {
    const series = [{ date: "2024-01-02", value: 3298.44 }];
    saveIndexHistory("000300", series, tmp);
    const loaded = loadIndexHistory("000300", tmp);
    expect(loaded).toEqual(series);
    const fresh = loadIndexHistory("000001", tmp);
    expect(fresh).toEqual([]);
    const raw = JSON.parse(fs.readFileSync(tmp, "utf8"));
    expect(raw.funds.indexHistory["000300"]).toEqual(series);
  });
});
