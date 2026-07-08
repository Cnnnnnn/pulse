/**
 * tests/stocks/detail-fetchers/valuation.test.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchValuation } from "../../../src/stocks/detail-fetchers/valuation.js";

const push2OK = (data) => ({ ok: true, status: 200, body: { data } });
const dcOK = (data) => ({ ok: true, status: 200, body: { result: { data } } });
const tencentOK = (text) => ({ ok: true, status: 200, body: text });
const fail = () => ({ ok: false, status: 500, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

beforeEach(() => vi.restoreAllMocks());

// 腾讯返回示例: v_sh600519="1~名称~600519~1188.80~...~17.97~...~6.38~..."
// 索引 [3]=价 [39]=PE [46]=PB
const tencentBody = (price, pe, pb) =>
  `v_sh600519="1~名称~600519~${price}~1206.91~1200.00~27365~12006~15368~${price}~29~${price}~4~${price}~1~${price}~3~${price}~7~${price}~2~${price}~2~${price}~49~${price}~1~${price}~5~~20260707161445~-18.11~-1.50~1202.00~${price}~${price}/27365/3264967794~27365~326497~0.22~${pe}~~1202.00~${price}~1.15~14860.97~14860.97~${pb}~1327.60~1086.22~0.66~-15~${price}~13.64~18.05~~~0.34~326496.7794~106.9920~9~ A~GP-A~-11.89~0.28~4.38~30.53~26.78~1539.98~1151.01~-0.47~-3.74~-17.27~1250081601~1250081601~-14.56~-14.15~1250081601~~~-12.51~-0.04~~CNY~0~___D__F__N~${price}~10~";`;

describe("fetchValuation", () => {
  it("主路径: push2 f9/f23 直接给 PE/PB", async () => {
    const http = makeClient([push2OK({ f43: 168500, f9: 53.6, f23: 5.4 })]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.pe).toBe(53.6);
    expect(r.data.pb).toBe(5.4);
    expect(r.data.price).toBe(1685);
  });

  it("fallback: push2 没 f9, datacenter 拿 EPS/BPS 算", async () => {
    // f9 缺, f23 有 → PB 直接拿, PE 走 datacenter
    // 调顺序: push2 → tencent(fail) → datacenter. tencent 跳过 (PB 已 ok),
    //  datacenter 算 PE.
    const http = makeClient([
      push2OK({ f43: 168500, f9: 0, f23: 5.4 }),
      fail(), // tencent fail
      dcOK([{ SECUCODE: "600519.SH", EPSXS: 31.4, BPS: 312 }]),
    ]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.pe).toBeCloseTo(1685 / 31.4, 1);
    expect(r.data.pb).toBe(5.4);
  });

  it("ok with pe=null when datacenter has no EPS and f9 missing", async () => {
    // 调顺序: push2 → tencent(fail) → datacenter. datacenter 没 EPS → pe=null
    const http = makeClient([
      push2OK({ f43: 168500, f9: 0, f23: 0 }),
      fail(), // tencent fail
      dcOK([{ SECUCODE: "600519.SH", EPSXS: null, BPS: 312 }]),
    ]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.pe).toBeNull();
    expect(r.data.pb).toBeCloseTo(1685 / 312, 1);
  });

  it("tencent fallback: push2 fail, 腾讯拿 PE/PB/价", async () => {
    // 调顺序: push2 → tencent → datacenter. push2 失败 → tencent 拿数据 → 后面不需要
    //  (tencent 已经填全了 PE/PB/price, datacenter 条件 pe==null || pb==null → false 跳过).
    const http = makeClient([
      fail(), // push2
      tencentOK(tencentBody(1188.8, 17.97, 6.38)), // tencent
    ]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.pe).toBe(17.97);
    expect(r.data.pb).toBe(6.38);
    expect(r.data.price).toBe(1188.8);
  });

  it("tencent 补缺: push2 有 price 但 f9/f23 全 0, tencent 补 PE/PB", async () => {
    const http = makeClient([
      push2OK({ f43: 168500, f9: 0, f23: 0 }),
      tencentOK(tencentBody(1685, 53.6, 5.4)),
    ]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.pe).toBe(53.6);
    expect(r.data.pb).toBe(5.4);
  });

  it("datacenter 补缺: tencent 也 fail, datacenter 算 PE/PB", async () => {
    const http = makeClient([
      push2OK({ f43: 168500, f9: 0, f23: 0 }),
      fail(), // tencent 也 fail
      dcOK([{ SECUCODE: "600519.SH", EPSXS: 31.4, BPS: 312 }]), // datacenter 算
    ]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.pe).toBeCloseTo(1685 / 31.4, 1);
    expect(r.data.pb).toBeCloseTo(1685 / 312, 1);
  });

  it("仅现价: 全部数据源都失败时 ok:false", async () => {
    const http = makeClient([fail(), fail(), fail()]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });

  it("深市代码: 腾讯 fallback 用 sz 前缀", async () => {
    const szBody = tencentBody(10.47, 15.63, 0.44).replace(
      "v_sh600519",
      "v_sz000001",
    );
    const http = makeClient([
      fail(), // push2
      tencentOK(szBody), // tencent
    ]);
    const r = await fetchValuation(http, { code: "000001" });
    expect(r.ok).toBe(true);
    expect(r.data.pe).toBe(15.63);
    expect(r.data.price).toBe(10.47);
  });
});
