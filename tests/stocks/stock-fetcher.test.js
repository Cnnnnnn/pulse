import { describe, it, expect } from "vitest";
import {
  fetchStocks,
  fetchStocksByCodes,
  parseClist,
  mapRow,
  buildUrl,
  codeToSecid,
} from "../../src/stocks/stock-fetcher";

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
        f9: 18.5, f23: 6.8, f173: 28.4, f100: "食品饮料", f20: 2100000000000,
      },
      {
        f12: "600036", f14: "招商银行", f2: 35.4, f3: -0.45, f8: 1.2,
        f9: 5.6, f23: 0.9, f173: 17.2, f100: "银行", f20: 800000000000,
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
      f9: 18.5, f23: 6.8, f173: 28.4, f100: "食品饮料", f20: 2100000000000,
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
  // ponytail: 模拟东财 clist 翻页 — 第 1 页返 100 条 (max), 第 2 页返 50 条 (总 150).
  // 验证 fetchStocks 必须循环翻页拉全量, 而不是只看第 1 页.
  function pagedClient(pageBodies) {
    let i = 0;
    return {
      get: async (url) => {
        const body = pageBodies[i++] || JSON.stringify({ data: { diff: [] } });
        return { status: 200, body, headers: {}, error: null };
      },
    };
  }
  function mkPage(total, startCode) {
    const diff = Array.from({ length: 100 }, (_, j) => ({
      f12: String(600000 + startCode + j),
      f14: `票${startCode + j}`,
      f2: 10 + j * 0.1, f3: j % 2 === 0 ? 1.2 : -0.5, f8: 0.5,
      f9: 5 + j, f23: 1 + j * 0.1, f173: 10 + j * 0.2, f100: "行业",
      f20: 1e11 + j * 1e9,
    }));
    if (startCode === 100) diff.length = 50; // 第二页少
    return JSON.stringify({ data: { total, diff } });
  }

  it("pages through east-money clist to fetch full market (NOT just top-100)", async () => {
    // ponytail: 全市场 ~5000 只, 旧实现只返第一页 top-100, 选股结果严重失真.
    // 修复后必须翻 pn=1..N 直到 total 取完.
    const total = 150;
    const client = pagedClient([mkPage(total, 0), mkPage(total, 100)]);
    const out = await fetchStocks(client);
    expect(out.total).toBe(150);
    expect(out.rows.length).toBeGreaterThanOrEqual(150); // 必须 ≥ total
    expect(out.rows.length).toBeLessThanOrEqual(200); // 但不能死循环
  });

  it("calls pn=1 then pn=2 etc. when paginating", async () => {
    const urls = [];
    const client = {
      get: async (url) => {
        urls.push(url);
        const m = url.match(/pn=(\d+)/);
        const pn = m ? parseInt(m[1], 10) : 1;
        const body = pn === 1
          ? mkPage(150, 0)
          : JSON.stringify({ data: { total: 150, diff: mkPage(150, 100).slice(0, 0) } });
        return { status: 200, body, headers: {}, error: null };
      },
    };
    await fetchStocks(client);
    const pns = urls.map((u) => Number(u.match(/pn=(\d+)/)[1]));
    expect(pns[0]).toBe(1);
    expect(pns.length).toBeGreaterThanOrEqual(2); // 至少翻了 2 页
  });

  it("stops paginating when a page returns < pageSize rows", async () => {
    // ponytail: 边界 — 当 total 整除 pageSize 时, 末页可能返 0 条, 不能无限翻.
    const calls = [];
    const client = {
      get: async (url) => {
        calls.push(url);
        if (calls.length === 1) {
          // 第一页: 100 条 + total=100 (整除 — 末页应空)
          return { status: 200, body: mkPage(100, 0), headers: {}, error: null };
        }
        // 第二页: 空 diff (东财会返 0 条) → 停止
        return { status: 200, body: JSON.stringify({ data: { total: 100, diff: [] } }), headers: {}, error: null };
      },
    };
    await fetchStocks(client);
    expect(calls.length).toBeLessThanOrEqual(3); // 至多 2 次 (容忍一次空页)
  });

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

  it("returns empty on network error (with fallback, error mentions both sources)", async () => {
    // ponytail: 默认开 fallbackToSina, 当东财全失败 + 新浪也失败 → 错误信息合并两条源.
    const client = { get: async () => ({ status: 0, body: "", headers: {}, error: "timeout" }) };
    const out = await fetchStocks(client);
    expect(out.rows).toEqual([]);
    // 错误信息应当提到东财失败 + 新浪也失败, 让用户 / 日志知道两条链路都不通
    expect(out.error).toMatch(/东财|新浪/);
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

  it("passes sortKey as fid to east-money (buildUrl)", () => {
    const url = buildUrl("roe");
    expect(url).toContain("fid=f173");
    const urlPe = buildUrl("pe");
    expect(urlPe).toContain("fid=f9");
  });

  it("falls back to DEFAULT_FID for unknown sortKey", () => {
    const url = buildUrl("nonexistent");
    expect(url).toContain("fid=f173"); // 默认 ROE
  });

  it("caps pz at 100 (east-money page limit)", () => {
    const url = buildUrl();
    expect(url).toMatch(/pz=100/);
  });
});

describe("codeToSecid", () => {
  it("shanghai (6开头) → 1.", () => {
    expect(codeToSecid("600519")).toBe("1.600519");
    expect(codeToSecid("688981")).toBe("1.688981"); // 科创板
  });
  it("shenzhen (0/3开头) → 0.", () => {
    expect(codeToSecid("000001")).toBe("0.000001");
    expect(codeToSecid("300750")).toBe("0.300750"); // 创业板
  });
  it("invalid → null", () => {
    expect(codeToSecid("123")).toBe(null);
    expect(codeToSecid("")).toBe(null);
    expect(codeToSecid(null)).toBe(null);
  });
});

// ── Sina fallback fetcher ─────────────────────────────────────

import {
  fetchStocksSina,
  mapSinaRow,
  parseSinaList,
} from "../../src/stocks/sina-fetcher";

const SINA_SAMPLE = JSON.stringify([
  {
    symbol: "sz001399", code: "001399", name: "N惠科",
    trade: "42.000", pricechange: 31.88, changepercent: 315.02,
    per: 0, pb: 11.608, mktcap: 30650905.8912, nmc: 1808380.2702,
    turnoverratio: 65.91597,
  },
  {
    symbol: "sh600519", code: "600519", name: "XD贵州茅台",
    trade: "1168.63", pricechange: -15.45, changepercent: -1.3,
    per: 18.5, pb: 6.8, mktcap: 1460883000000, nmc: 1460883000000,
    turnoverratio: 0.5,
  },
]);

describe("parseSinaList", () => {
  it("returns array", () => {
    const out = parseSinaList(SINA_SAMPLE);
    expect(out).toHaveLength(2);
    expect(out[0].code).toBe("001399");
  });
  it("handles invalid JSON", () => {
    expect(parseSinaList("not json")).toEqual([]);
    expect(parseSinaList(null)).toEqual([]);
    expect(parseSinaList("[]")).toEqual([]);
  });
});

describe("mapSinaRow", () => {
  it("maps Sina fields to stock row (no ROE — null)", () => {
    const row = mapSinaRow({
      symbol: "sh600519", code: "600519", name: "贵州茅台",
      trade: "1168.63", pricechange: -15.45, changepercent: -1.3,
      per: 18.5, pb: 6.8,
      mktcap: 1.46e8, // Sina 实际单位: 万元 (茅台总市值 1.46 万亿元 → 1.46e8 万元)
      turnoverratio: 0.5,
    });
    expect(row.code).toBe("600519");
    expect(row.name).toBe("贵州茅台");
    expect(row.price).toBe(1168.63);
    expect(row.changePct).toBe(-1.3);
    expect(row.pe).toBe(18.5);
    expect(row.pb).toBe(6.8);
    expect(row.roe).toBe(null); // ponytail: Sina 不返 ROE
    expect(row.industry).toBe(null);
    // marketCap: Sina 单位是"万元", 我们统一存"元" (×10000)
    expect(row.marketCap).toBe(1.46e12);
    expect(row.turnover).toBe(0.5);
  });

  it("handles missing fields gracefully", () => {
    const row = mapSinaRow({ code: "000001", name: "X", trade: "-" });
    expect(row.code).toBe("000001");
    expect(row.price).toBe(null);
    expect(row.pe).toBe(null);
  });
});

describe("fetchStocksSina", () => {
  function pagedClient(bodies) {
    let i = 0;
    return { get: async () => ({ status: 200, body: bodies[i++] || "[]", headers: {}, error: null }) };
  }

  it("returns mapped rows", async () => {
    const out = await fetchStocksSina(pagedClient([SINA_SAMPLE]));
    expect(out.rows.length).toBe(2);
    expect(out.rows[0].code).toBe("001399");
    expect(out.error).toBeUndefined();
  });

  it("paginates via num + page params to cover all ~5000 stocks", async () => {
    // ponytail: Sina 单页 80 条左右 (受 num 限制), 多页拼起来.
    // 注: 实际接口 num 上限 ~200, 但为模拟翻页行为, 测试用 mock.
    // 用满页 (PAGE_SIZE) 模拟 — 这样翻页会继续
    const totalPages = 3;
    const pages = Array.from({ length: totalPages }, (_, i) => {
      const arr = Array.from({ length: 80 }, (_, j) => ({
        code: String(600000 + i * 80 + j).padStart(6, "0"),
        name: `票${i}-${j}`,
        trade: 10,
        changepercent: 1,
        per: 5 + i,
        pb: 1,
        mktcap: 1e12,
      }));
      return JSON.stringify(arr);
    });
    // 加一个"末页不满"终止翻页
    pages.push(JSON.stringify([{ code: "000001", name: "末页", trade: 1, changepercent: 0, per: 5, pb: 1, mktcap: 1e11 }]));
    const out = await fetchStocksSina(pagedClient(pages));
    expect(out.rows.length).toBeGreaterThanOrEqual(80 * 3); // 至少翻了 3 满页
  });

  it("returns empty on network error", async () => {
    const client = { get: async () => ({ status: 0, body: "", headers: {}, error: "network" }) };
    const out = await fetchStocksSina(client);
    expect(out.error).toBe("network");
    expect(out.rows).toEqual([]);
  });
});

// ── fetchStocks 自动 fallback ────────────────────────────────

describe("fetchStocks with Sina fallback", () => {
  it("falls back to Sina when primary east-money fails", async () => {
    const tmp = mockClient(SAMPLE_BODY);
    // mock 一个 client: 第一次返 east-money 网络错, 第二次返 sina 列表
    let callCount = 0;
    const client = {
      get: async (url) => {
        callCount++;
        if (url.includes("push2.eastmoney.com")) {
          return { status: 0, body: "", headers: {}, error: "network" };
        }
        if (url.includes("vip.stock.finance.sina.com.cn")) {
          return { status: 200, body: SINA_SAMPLE, headers: {}, error: null };
        }
        return { status: 0, body: "", headers: {}, error: "unknown" };
      },
    };
    const out = await fetchStocks(client, { sortKey: "roe", fallbackToSina: true });
    expect(out.error).toBeUndefined(); // fallback 成功, 没有 error
    expect(out.rows.length).toBe(2);
    expect(out.rows[0].code).toBe("001399"); // 来自 sina
    expect(out.source).toBe("sina"); // ponytail: 标记数据源
    expect(callCount).toBeGreaterThan(1); // 至少试了东财 + 新浪
  });

  it("uses east-money when primary succeeds (no fallback needed)", async () => {
    const out = await fetchStocks(mockClient(SAMPLE_BODY));
    expect(out.rows.length).toBe(2);
    expect(out.rows[0].code).toBe("600519");
    expect(out.source).toBeUndefined(); // ponytail: 默认源不标记
  });

  it("returns error when BOTH east-money and Sina fail", async () => {
    const client = {
      get: async () => ({ status: 0, body: "", headers: {}, error: "network" }),
    };
    const out = await fetchStocks(client, { fallbackToSina: true });
    expect(out.error).toBeTruthy();
    expect(out.rows).toEqual([]);
  });
});

describe("fetchStocksByCodes", () => {
  it("returns mapped rows for given codes", async () => {
    const body = JSON.stringify({
      data: {
        diff: [
          {
            f12: "600519", f14: "贵州茅台", f2: 1685.2, f3: 1.23, f8: 0.5,
            f9: 18.5, f23: 6.8, f173: 28.4, f100: "食品饮料", f20: 2100000000000,
          },
        ],
      },
    });
    const out = await fetchStocksByCodes(["600519"], mockClient(body));
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].code).toBe("600519");
    expect(out.error).toBeUndefined();
  });

  it("empty codes → empty rows, no request", async () => {
    const client = { get: async () => { throw new Error("should not call"); } };
    const out = await fetchStocksByCodes([], client);
    expect(out.rows).toEqual([]);
  });

  it("invalid codes filtered out", async () => {
    const body = JSON.stringify({ data: { diff: [] } });
    const out = await fetchStocksByCodes(["bad", "123"], mockClient(body));
    expect(out.rows).toEqual([]); // 无有效 secid → 不打接口
  });
});
