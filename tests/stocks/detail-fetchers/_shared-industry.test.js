/**
 * tests/stocks/detail-fetchers/_shared-industry.test.js
 *
 * fetchIndustryPeers 两步 LICO_FN_CPD 流程: secucode→BOARD_CODE→行业成员.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { fetchIndustryPeers } = await import(
  "../../../src/stocks/detail-fetchers/_shared-industry.js"
);

// datacenter 200 + data
function dcResponse(rows) {
  return { status: 200, body: { success: true, result: { data: rows } } };
}
const fail = (status = 500) => ({ status, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

// 步骤 1 board row
const BOARD_ROW = { BOARD_CODE: "BK1277", BOARD_NAME: "白酒" };
// 步骤 2 member rows (行业 3 只)
function memberRows() {
  return [
    { SECUCODE: "600519.SH", SECURITY_NAME_ABBR: "贵州茅台", WEIGHTAVG_ROE: 30.1, XSMLL: 91.2, TOTAL_OPERATE_INCOME: 1.5e11, PARENT_NETPROFIT: 8.6e10 },
    { SECUCODE: "000858.SZ", SECURITY_NAME_ABBR: "五粮液", WEIGHTAVG_ROE: 22.5, XSMLL: 75.0, TOTAL_OPERATE_INCOME: 8.3e10, PARENT_NETPROFIT: 3.0e10 },
    { SECUCODE: "002304.SZ", SECURITY_NAME_ABBR: "洋河股份", WEIGHTAVG_ROE: 18.0, XSMLL: 60.0, TOTAL_OPERATE_INCOME: 3.3e10, PARENT_NETPROFIT: 9.3e9 },
  ];
}

beforeEach(() => vi.restoreAllMocks());

describe("fetchIndustryPeers", () => {
  it("正常两步: board + member 都成功 → 返 industry/boardCode/peers", async () => {
    const http = makeClient([dcResponse([BOARD_ROW]), dcResponse(memberRows())]);
    const r = await fetchIndustryPeers(http, "600519");
    expect(r.ok).toBe(true);
    expect(r.data.industry).toBe("白酒");
    expect(r.data.boardCode).toBe("BK1277");
    expect(r.data.peers).toHaveLength(3);
    // 字段映射对
    expect(r.data.peers[0]).toEqual({
      code: "600519",
      name: "贵州茅台",
      roe: 30.1,
      grossMargin: 91.2,
      revenue: 1.5e11,
      netprofit: 8.6e10,
    });
    // secucode → code 去掉了市场后缀
    expect(r.data.peers[1].code).toBe("000858");
    expect(r.data.peers[2].name).toBe("洋河股份");
  });

  it("步骤 1 (board) 500 → reason: fetch_failed", async () => {
    const http = makeClient([fail(500)]);
    const r = await fetchIndustryPeers(http, "600519");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });

  it("步骤 1 board data=[] → reason: no_industry_data", async () => {
    const http = makeClient([dcResponse([])]);
    const r = await fetchIndustryPeers(http, "600519");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_industry_data");
  });

  it("步骤 1 board row 缺 BOARD_CODE → reason: no_industry_data", async () => {
    const http = makeClient([dcResponse([{ BOARD_NAME: "白酒" }])]);
    const r = await fetchIndustryPeers(http, "600519");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_industry_data");
  });

  it("步骤 1 board body 非 JSON → reason: parse_failed", async () => {
    const http = makeClient([{ status: 200, body: "not json {{{" }]);
    const r = await fetchIndustryPeers(http, "600519");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("步骤 2 (member) 500 → reason: fetch_failed", async () => {
    const http = makeClient([dcResponse([BOARD_ROW]), fail(500)]);
    const r = await fetchIndustryPeers(http, "600519");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });

  it("步骤 2 member data=[] → reason: no_industry_data", async () => {
    const http = makeClient([dcResponse([BOARD_ROW]), dcResponse([])]);
    const r = await fetchIndustryPeers(http, "600519");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_industry_data");
  });

  it("步骤 2 member body 非 JSON → reason: parse_failed", async () => {
    const http = makeClient([dcResponse([BOARD_ROW]), { status: 200, body: "<html>x</html>" }]);
    const r = await fetchIndustryPeers(http, "600519");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("深市 code (000001) secucode 带 .SZ", async () => {
    const http = makeClient([
      dcResponse([{ BOARD_CODE: "BK0475", BOARD_NAME: "银行" }]),
      dcResponse([{ SECUCODE: "000001.SZ", SECURITY_NAME_ABBR: "平安银行", WEIGHTAVG_ROE: 10, XSMLL: 50, TOTAL_OPERATE_INCOME: 1e10, PARENT_NETPROFIT: 1e9 }]),
    ]);
    const r = await fetchIndustryPeers(http, "000001");
    expect(r.ok).toBe(true);
    expect(r.data.peers[0].code).toBe("000001");
  });

  it("字段缺失映射为 null (不全报错)", async () => {
    const http = makeClient([
      dcResponse([BOARD_ROW]),
      dcResponse([{ SECUCODE: "600519.SH", SECURITY_NAME_ABBR: "贵州茅台" /* 财务字段缺失 */ }]),
    ]);
    const r = await fetchIndustryPeers(http, "600519");
    expect(r.ok).toBe(true);
    expect(r.data.peers[0]).toEqual({
      code: "600519", name: "贵州茅台", roe: null, grossMargin: null, revenue: null, netprofit: null,
    });
  });
});
