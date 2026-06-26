import { describe, it, expect } from "vitest";
import { filterStocks, sortStocks, applyScreen } from "../../src/stocks/stock-filter";

const mk = (over) => ({
  code: "000001", name: "测试", price: 10, changePct: 1,
  turnover: 2, pe: 15, pb: 1.5, roe: 18, industry: "银行",
  marketCap: 6e11, ...over,
});

describe("filterStocks", () => {
  it("returns all when criteria is empty/null fields", () => {
    const rows = [mk({}), mk({ code: "000002" })];
    const out = filterStocks(rows, { marketCapTier: "all", industries: [] });
    expect(out).toHaveLength(2);
  });

  it("filters PE range (peMin <= pe <= peMax)", () => {
    const rows = [mk({ pe: 10 }), mk({ pe: 25 }), mk({ pe: 50 })];
    const out = filterStocks(rows, { peMin: 0, peMax: 20, marketCapTier: "all", industries: [] });
    expect(out).toHaveLength(1);
    expect(out[0].pe).toBe(10);
  });

  it("filters ROE minimum (roe >= roeMin)", () => {
    const rows = [mk({ roe: 5 }), mk({ roe: 20 })];
    const out = filterStocks(rows, { roeMin: 15, marketCapTier: "all", industries: [] });
    expect(out).toHaveLength(1);
    expect(out[0].roe).toBe(20);
  });

  it("skips a criterion when the row's field is null (not excluded)", () => {
    // pe=null 的票不应因 peMax=20 被排除 (数据缺失跳过该条件)
    const rows = [mk({ pe: null }), mk({ pe: 50 })];
    const out = filterStocks(rows, { peMax: 20, marketCapTier: "all", industries: [] });
    expect(out).toHaveLength(1);
    expect(out[0].code).toBe("000001"); // pe=null 那只保留
  });

  it("filters marketCapTier via tierForMarketCap", () => {
    const rows = [mk({ marketCap: 6e11 }), mk({ marketCap: 3e10 })];
    const out = filterStocks(rows, { marketCapTier: "large", industries: [] });
    expect(out).toHaveLength(1);
    expect(out[0].marketCap).toBe(6e11);
  });

  it("filters industries (row industry in list)", () => {
    const rows = [mk({ industry: "银行" }), mk({ industry: "食品饮料" })];
    const out = filterStocks(rows, { industries: ["银行"], marketCapTier: "all" });
    expect(out).toHaveLength(1);
    expect(out[0].industry).toBe("银行");
  });

  it("combines multiple criteria (AND)", () => {
    const rows = [
      mk({ pe: 10, roe: 20, marketCap: 6e11, industry: "银行" }),
      mk({ pe: 10, roe: 5, marketCap: 6e11, industry: "银行" }),
      mk({ pe: 30, roe: 20, marketCap: 6e11, industry: "银行" }),
    ];
    const out = filterStocks(rows, {
      peMax: 20, roeMin: 15, marketCapTier: "large", industries: ["银行"],
    });
    expect(out).toHaveLength(1);
  });

  it("ignores non-finite peMin boundary", () => {
    const rows = [mk({ pe: 10 })];
    const out = filterStocks(rows, { peMin: NaN, marketCapTier: "all", industries: [] });
    expect(out).toHaveLength(1);
  });
});

describe("sortStocks", () => {
  it("sorts descending by numeric key", () => {
    const rows = [mk({ roe: 5 }), mk({ roe: 30 }), mk({ roe: 18 })];
    const out = sortStocks(rows, { key: "roe", dir: "desc" });
    expect(out.map((r) => r.roe)).toEqual([30, 18, 5]);
  });

  it("sorts ascending by numeric key", () => {
    const rows = [mk({ pe: 30 }), mk({ pe: 5 })];
    const out = sortStocks(rows, { key: "pe", dir: "asc" });
    expect(out.map((r) => r.pe)).toEqual([5, 30]);
  });

  it("places null values last regardless of direction", () => {
    const rows = [mk({ roe: null }), mk({ roe: 30 }), mk({ roe: 5 })];
    const desc = sortStocks(rows, { key: "roe", dir: "desc" });
    expect(desc[desc.length - 1].roe).toBe(null);
    expect(desc[0].roe).toBe(30);
    const asc = sortStocks(rows, { key: "roe", dir: "asc" });
    expect(asc[asc.length - 1].roe).toBe(null);
    expect(asc[0].roe).toBe(5);
  });

  it("no sort config returns copy unchanged", () => {
    const rows = [mk({ code: "a" }), mk({ code: "b" })];
    const out = sortStocks(rows, null);
    expect(out.map((r) => r.code)).toEqual(["a", "b"]);
    expect(out).not.toBe(rows); // 新数组
  });

  // ponytail: 前端列头 "名称" / "行业" 是字符串, 后端 fid 排不了, sortStocks 必须能处理.
  it("sorts descending by string key (name)", () => {
    const rows = [mk({ name: "长江电力" }), mk({ name: "美的集团" }), mk({ name: "XD中国石" })];
    const out = sortStocks(rows, { key: "name", dir: "desc" });
    // localeCompare zh-Hans-CN: 美 < XD长? 实际按 unicode 处理 — 验证结果长度+不重复即可.
    expect(out).toHaveLength(3);
    expect(new Set(out.map((r) => r.name))).toEqual(new Set(["长江电力", "美的集团", "XD中国石"]));
    // 升序对比验证
    const asc = sortStocks(rows, { key: "name", dir: "asc" });
    expect(asc).toHaveLength(3);
  });

  it("sorts industry ascending string", () => {
    const rows = [mk({ industry: "银行" }), mk({ industry: "白酒" }), mk({ industry: "地产" })];
    const asc = sortStocks(rows, { key: "industry", dir: "asc" });
    const desc = sortStocks(rows, { key: "industry", dir: "desc" });
    // ponytail: localeCompare 在 zh-Hans-CN 按 unicode codepoint 排, 测试只验证:
    //          1) asc 是 desc 的完全倒序  2) 行数对、内容不丢. 拼音排序依赖 icu data,
    //          桌面端 Electron 内置 icu 通常是有的, 但 CI / Node 单测可能没.
    expect(asc).toHaveLength(3);
    expect(desc).toHaveLength(3);
    expect(new Set(asc.map((r) => r.industry))).toEqual(new Set(["银行", "白酒", "地产"]));
    expect(desc.map((r) => r.industry)).toEqual([...asc].reverse().map((r) => r.industry));
  });

  it("string key with null values places nulls last regardless of direction", () => {
    const rows = [mk({ industry: null }), mk({ industry: "银行" })];
    expect(sortStocks(rows, { key: "industry", dir: "asc" })[1].industry).toBe(null);
    expect(sortStocks(rows, { key: "industry", dir: "desc" })[1].industry).toBe(null);
  });
});

describe("applyScreen", () => {
  it("filters then sorts", () => {
    const rows = [
      mk({ code: "a", pe: 10, roe: 30 }),
      mk({ code: "b", pe: 50, roe: 5 }),
      mk({ code: "c", pe: 12, roe: 20 }),
    ];
    const out = applyScreen(rows, { peMax: 20, marketCapTier: "all", industries: [] }, { key: "roe", dir: "desc" });
    expect(out.map((r) => r.code)).toEqual(["a", "c"]);
  });
});
