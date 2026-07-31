/**
 * tests/main/finance/finance-symbols.test.ts
 *
 * A2 验证：行情符号已从 main/finance/fetcher-market-quote.ts 与
 * renderer/finance/quoteSymbols.ts 两份重复定义收敛到单一来源 src/shared/finance-symbols.ts。
 * 该文件为纯数据模块，可直接由 vitest 转译导入（无需 requireMain）。
 */
import { describe, it, expect } from "vitest";
import {
  INDEX_SYMBOLS,
  FX_SYMBOLS,
  shortName,
} from "../../../src/shared/finance-symbols";

describe("finance-symbols · 单一事实来源 (A2)", () => {
  it("INDEX_SYMBOLS 含 5 大指数且 short 派生正确", () => {
    expect(INDEX_SYMBOLS.length).toBe(5);
    const syms = INDEX_SYMBOLS.map((s) => s.symbol);
    expect(syms).toContain("s_sh000001");
    expect(syms).toContain("s_sh000688");
    expect(shortName(INDEX_SYMBOLS[0])).toBe("上证");
    expect(shortName(INDEX_SYMBOLS[0])).toBe(INDEX_SYMBOLS[0].short);
  });

  it("FX_SYMBOLS 含美元/人民币", () => {
    expect(FX_SYMBOLS.length).toBe(1);
    expect(FX_SYMBOLS[0].symbol).toBe("USDCNY");
    expect(shortName(FX_SYMBOLS[0])).toBe("美元/人民币");
  });

  it("shortName 缺省回退 name", () => {
    expect(shortName({ symbol: "X", name: "某指数" })).toBe("某指数");
  });
});
