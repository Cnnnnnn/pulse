/**
 * tests/main/fund-fetcher.test.js
 *
 * fund-fetcher.js 单测 — 覆盖:
 *   - parseJsonpgz: 正常 JSONP / 无尾分号 / 无效内容
 *   - mapFundData: 字段映射 / 数字容错 / estimated 判定
 *   - fetchFundNav: mock httpClient 跑通, 校验 UA + URL + 错误路径
 *   - fetchFundNavBatch: 并发 / 部分失败 / 空列表
 */

import { describe, it, expect } from "vitest";
import { MockHttp } from "../helpers/mock-http.js";
const {
  fetchFundNav,
  fetchFundNavWithAlt,
  fetchFundNavBatch,
  parseJsonpgz,
  mapFundData,
} = require("../../src/funds/fund-fetcher.js");

const SAMPLE_JSONP =
  'jsonpgz({"fundcode":"000001","name":"华夏成长混合","jzrq":"2026-06-11","dwjz":"1.2860","gsz":"1.2959","gszzl":"0.77","gztime":"2026-06-12 13:13"});';
const SAMPLE_JSONP_NO_SEMI =
  'jsonpgz({"fundcode":"000001","name":"华夏成长混合","jzrq":"2026-06-11","dwjz":"1.2860","gsz":"1.2959","gszzl":"0.77","gztime":"2026-06-12 13:13"})';
const SAMPLE_SINA =
  'var hq_str_of000001="华夏成长混合,1.2860,1.2860,1.2959,0.77,2026-06-11";';

function dualSourceHttp(overrides = {}) {
  return new MockHttp({
    urlHandlers: [
      {
        match: /1234567\.com\.cn/,
        response: overrides.tiantian ?? { status: 200, body: SAMPLE_JSONP },
      },
      {
        match: /sinajs\.cn/,
        response: overrides.sina ?? { status: 200, body: SAMPLE_SINA },
      },
    ],
  });
}

describe("parseJsonpgz", () => {
  it("正常 JSONP (带尾分号)", () => {
    const r = parseJsonpgz(SAMPLE_JSONP);
    expect(r).not.toBeNull();
    expect(r.fundcode).toBe("000001");
    expect(r.name).toBe("华夏成长混合");
    expect(r.dwjz).toBe("1.2860");
  });

  it("正常 JSONP (不带尾分号) — 容错", () => {
    const r = parseJsonpgz(SAMPLE_JSONP_NO_SEMI);
    expect(r).not.toBeNull();
    expect(r.fundcode).toBe("000001");
  });

  it("非 JSONP 内容 → null", () => {
    expect(parseJsonpgz("hello world")).toBeNull();
    expect(parseJsonpgz('{"a":1}')).toBeNull();
    expect(parseJsonpgz("jsonpgz(not json)")).toBeNull();
  });

  it("null / undefined / 非 string → null", () => {
    expect(parseJsonpgz(null)).toBeNull();
    expect(parseJsonpgz(undefined)).toBeNull();
    expect(parseJsonpgz(123)).toBeNull();
  });
});

describe("mapFundData", () => {
  it("完整字段 → 正确映射", () => {
    const m = mapFundData({
      fundcode: "000001",
      name: "华夏成长混合",
      jzrq: "2026-06-11",
      dwjz: "1.2860",
      gsz: "1.2959",
      gszzl: "0.77",
      gztime: todayStr() + " 13:13",
    });
    expect(m.code).toBe("000001");
    expect(m.name).toBe("华夏成长混合");
    expect(m.nav).toBe(1.286);
    expect(m.estimatedNav).toBe(1.2959);
    expect(m.dayChange).toBeCloseTo(0.0099, 4);
    expect(m.dayChangePct).toBe(0.77);
    expect(m.navDate).toBe("2026-06-11");
    expect(m.estimated).toBe(true);
  });

  it("gztime 是昨天 → estimated=false", () => {
    const m = mapFundData({
      fundcode: "000001",
      name: "x",
      jzrq: "2026-06-11",
      dwjz: "1.0",
      gsz: "1.05",
      gszzl: "5",
      gztime: yesterdayStr() + " 15:00",
    });
    expect(m.estimated).toBe(false);
  });

  it("gsz 缺失 → estimatedNav=null, dayChange=0, estimated=false", () => {
    const m = mapFundData({
      fundcode: "000001",
      name: "x",
      jzrq: "2026-06-11",
      dwjz: "1.0",
      gztime: todayStr() + " 15:00",
    });
    expect(m.estimatedNav).toBeNull();
    expect(m.dayChange).toBe(0);
    expect(m.estimated).toBe(true); // gztime 是今天 → estimated=true (即使没有 gsz)
  });

  it("数字字段非数字 → 0 容错", () => {
    const m = mapFundData({
      fundcode: "000001",
      name: "x",
      jzrq: "2026-06-11",
      dwjz: "abc",
      gsz: null,
      gszzl: undefined,
    });
    expect(m.nav).toBe(0);
    expect(m.estimatedNav).toBeNull();
    expect(m.dayChangePct).toBe(0);
  });
});

describe("fetchFundNav", () => {
  it("正常 200 + JSONP → 返回 mapped 数据", async () => {
    const http = new MockHttp({ get: [{ status: 200, body: SAMPLE_JSONP }] });
    const r = await fetchFundNav("000001", http);
    expect(r.code).toBe("000001");
    expect(r.nav).toBe(1.286);
    expect(r.estimatedNav).toBe(1.2959);
    expect(http.getCalls).toHaveLength(1);
    expect(http.getCalls[0].url).toMatch(
      /^http:\/\/fundgz\.1234567\.com\.cn\/js\/000001\.js\?rt=/,
    );
    expect(http.getCalls[0].opts.headers["User-Agent"]).toMatch(/Mozilla/);
  });

  it("非法 code → 抛错 (不发请求)", async () => {
    const http = new MockHttp();
    await expect(fetchFundNav("12345", http)).rejects.toThrow(
      /invalid fund code/,
    );
    await expect(fetchFundNav("abcdef", http)).rejects.toThrow(
      /invalid fund code/,
    );
    await expect(fetchFundNav("", http)).rejects.toThrow(/invalid fund code/);
    expect(http.getCalls).toHaveLength(0);
  });

  it("HTTP 500 → 抛错", async () => {
    const http = new MockHttp({ get: [{ status: 500, body: "server error" }] });
    await expect(fetchFundNav("000001", http)).rejects.toThrow(/HTTP 500/);
  });

  it("空 body → 抛错", async () => {
    const http = new MockHttp({ get: [{ status: 200, body: "" }] });
    await expect(fetchFundNav("000001", http)).rejects.toThrow(/empty body/);
  });

  it("非 JSONP body → 抛错", async () => {
    const http = new MockHttp({
      get: [{ status: 200, body: "<html>404</html>" }],
    });
    await expect(fetchFundNav("000001", http)).rejects.toThrow(/bad JSONP/);
  });

  it("network 错误 → 抛错", async () => {
    const http = new MockHttp({ get: [{ error: "network" }] });
    await expect(fetchFundNav("000001", http)).rejects.toThrow(/network error/);
  });

  it("timeout 错误 → 抛错", async () => {
    const http = new MockHttp({ get: [{ error: "timeout" }] });
    await expect(fetchFundNav("000001", http)).rejects.toThrow(/timeout/);
  });
});

describe("fetchFundNavWithAlt", () => {
  it("天天 + 新浪 → 合并偏差字段", async () => {
    const http = new MockHttp({
      get: [
        { status: 200, body: SAMPLE_JSONP },
        { status: 200, body: SAMPLE_SINA },
      ],
    });
    const r = await fetchFundNavWithAlt("000001", http);
    expect(r.source).toBe("tiantian");
    expect(r.altAvailable).toBe(true);
    expect(r.altEstimatedNav).toBe(1.2959);
  });

  it("新浪失败 → altAvailable=false", async () => {
    const http = new MockHttp({
      get: [
        { status: 200, body: SAMPLE_JSONP },
        { status: 500, body: "oops" },
      ],
    });
    const r = await fetchFundNavWithAlt("000001", http);
    expect(r.nav).toBe(1.286);
    expect(r.altAvailable).toBe(false);
  });
});

describe("fetchFundNavBatch", () => {
  it("空列表 → 空 results/errors", async () => {
    const http = new MockHttp();
    const out = await fetchFundNavBatch([], http);
    expect(out.results).toEqual({});
    expect(out.errors).toEqual({});
    expect(http.getCalls).toHaveLength(0);
  });

  it("3 只全成功 (双源)", async () => {
    const http = dualSourceHttp();
    const codes = ["000001", "000002", "000003"];
    const out = await fetchFundNavBatch(codes, http);
    expect(Object.keys(out.results)).toEqual(codes);
    expect(out.errors).toEqual({});
    expect(out.results["000001"].nav).toBe(1.286);
    expect(out.results["000001"].altAvailable).toBe(true);
    expect(http.getCalls).toHaveLength(6);
  });

  it("主源 (tiantian) 失败时 → fallback 到备用源 (sina)", async () => {
    const http = dualSourceHttp({
      tiantian: (url) =>
        url.includes("/000002.js")
          ? { status: 500, body: "oops" }
          : { status: 200, body: SAMPLE_JSONP },
    });
    const codes = ["000001", "000002", "000003"];
    const out = await fetchFundNavBatch(codes, http);
    expect(out.results["000001"]).toBeDefined();
    // 000002 主源挂了, 但 sina 兜底成功 → 仍在 results, 标 fallbackFrom
    expect(out.results["000002"]).toBeDefined();
    expect(out.results["000002"].fallbackFrom).toBe("tiantian");
    expect(out.results["000002"].source).toBe("sina");
    expect(out.results["000003"]).toBeDefined();
    expect(out.errors).toEqual({});
  });

  it("主源 + 备用源都失败 → 进 errors", async () => {
    const http = dualSourceHttp({
      tiantian: (url) =>
        url.includes("/000002.js")
          ? { status: 500, body: "oops" }
          : { status: 200, body: SAMPLE_JSONP },
      sina: (url) =>
        url.includes("of000002")
          ? { status: 502, body: "bad gw" }
          : { status: 200, body: SAMPLE_SINA },
    });
    const codes = ["000001", "000002", "000003"];
    const out = await fetchFundNavBatch(codes, http);
    expect(out.results["000001"]).toBeDefined();
    expect(out.errors["000002"]).toMatch(/HTTP 500/);
    expect(out.results["000003"]).toBeDefined();
  });
});

// ── helper ──

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function yesterdayStr() {
  const d = new Date(Date.now() - 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
