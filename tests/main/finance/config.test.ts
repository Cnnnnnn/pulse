/**
 * tests/main/finance/config.test.ts
 *
 * 派生分类逻辑单测：默认兜底 + 关键词优先级 + 外汇归全球 + 基金。
 */
import { describe, it, expect } from "vitest";
const { requireMain } = require("../../_setup/require-main.cjs");
const cfg = requireMain("finance/config");
const { deriveCategory, FIN_CATEGORIES } = cfg;

describe("finance config · deriveCategory", () => {
  it("无关键词命中 → 源默认分类兜底", () => {
    const r = deriveCategory("eastmoney", "某普通A股放量上涨", "");
    expect(r.category).toBe("股市");
    expect(r.tags).toEqual([]);
  });

  it("宏观关键词优先级最高，覆盖默认分类", () => {
    const r = deriveCategory("eastmoney", "央行宣布降准0.25个百分点", "");
    expect(r.category).toBe("宏观");
    expect(r.tags).toContain("降准");
  });

  it("全球关键词（美股/非农）覆盖默认分类", () => {
    const r = deriveCategory("eastmoney", "美股非农数据超预期", "");
    expect(r.category).toBe("全球");
    expect(r.tags).toContain("非农");
  });

  it("外汇/汇率/人民币/美元 → 归全球", () => {
    const r = deriveCategory("eastmoney", "美元兑人民币汇率走强", "");
    expect(r.category).toBe("全球");
    expect(r.tags).toContain("美元");
  });

  it("基金关键词（ETF/净值）→ 基金", () => {
    const r = deriveCategory("eastmoney", "某ETF净值创新高", "");
    expect(r.category).toBe("基金");
    expect(r.tags).toContain("ETF");
  });

  it("债券关键词 → 债券", () => {
    const r = deriveCategory("stats", "国债利率招标结果", "");
    expect(r.category).toBe("债券");
    expect(r.tags).toContain("国债");
  });

  it("宏观 > 全球（多关键词取最高优先级）", () => {
    // 同时含 全球(美股) 与 宏观(央行) → 取宏观
    const r = deriveCategory("eastmoney", "央行关注美股波动", "");
    expect(r.category).toBe("宏观");
  });

  it("FIN_CATEGORIES 覆盖五类", () => {
    expect(FIN_CATEGORIES).toEqual(["股市", "基金", "债券", "宏观", "全球"]);
  });
});

// ===== QA 独立验证补充断言（第二轮，独立 fresh eyes）=====
describe("finance config · deriveCategory (QA 补充)", () => {
  it("stats 默认宏观，但仅含债券/利率关键词（无宏观词）→ 返回债券（关键词覆盖源默认）", () => {
    const r = deriveCategory("stats", "国债利率招标结果", "");
    expect(r.category).toBe("债券");
    expect(r.tags).toContain("国债");
    expect(r.tags).toContain("利率");
  });

  it("同含 央行(宏观) 与 国债(债券) 时，宏观优先级更高 → 返回宏观（锁源码优先级行为）", () => {
    // 优先级 宏观(5) > 债券(3)：源码行为正确，此处记录该边界。
    const r = deriveCategory("stats", "央行发行国债 利率招标结果", "");
    expect(r.category).toBe("宏观");
    expect(r.tags).toContain("央行");
    expect(r.tags).toContain("国债");
  });

  it("多关键词命中时取优先级最高：基金(ETF)+债券(利率) → 债券", () => {
    // 债券(3) > 基金(2)
    const r = deriveCategory("eastmoney", "某ETF基金净值创新高 国债利率上行", "");
    expect(r.category).toBe("债券");
  });

  it("关键词在 summary 而非 title 也能命中（title+summary 合并匹配）", () => {
    const r = deriveCategory("eastmoney", "一条普通市场快讯", "央行宣布降准0.25个百分点");
    expect(r.category).toBe("宏观");
    expect(r.tags).toContain("降准");
  });

  it("大小写不敏感：小写 gdp 命中宏观关键词", () => {
    const r = deriveCategory("eastmoney", "gdp数据公布 增速超预期", "");
    expect(r.category).toBe("宏观");
    expect(r.tags).toContain("GDP");
  });

  it("wallstreetcn 默认全球，但含基金关键词 → 基金（关键词优于源默认）", () => {
    const r = deriveCategory("wallstreetcn", "某科技ETF基金获批", "");
    expect(r.category).toBe("基金");
  });

  it("无关键词命中时严格回退源默认分类（eastmoney→股市, wallstreetcn→全球, stats→宏观）", () => {
    expect(deriveCategory("eastmoney", "A股震荡整理", "").category).toBe("股市");
    expect(deriveCategory("wallstreetcn", "海外市场观察", "").category).toBe("全球");
    expect(deriveCategory("stats", "统计公报发布", "").category).toBe("宏观");
  });

  it("未知源 key 回退到股市默认", () => {
    expect(deriveCategory("unknown-src", "foobar", "").category).toBe("股市");
  });

  it("tags 去重且无空串", () => {
    // 「央行降准」同时含 宏观(降准/央行)，但不应产生重复 tag
    const r = deriveCategory("eastmoney", "央行降准", "");
    const unique = new Set(r.tags);
    expect(r.tags.length).toBe(unique.size);
    expect(r.tags.every((t: string) => t.length > 0)).toBe(true);
  });
});
