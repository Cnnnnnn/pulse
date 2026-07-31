/**
 * tests/main/finance/fetcher-market-quote.test.ts
 *
 * 新浪行情解析单测：GB18030 解码 + Sina block 解析 + 指数/FX 两套字段解析。
 */
import { describe, it, expect } from "vitest";
const { requireMain } = require("../../_setup/require-main.cjs");
const mq = requireMain("finance/fetcher-market-quote");
const { safeDecode, parseSinaBlock, parseIndexLine, parseFxLine } = mq;

describe("fetcher-market-quote · GB18030", () => {
  it("safeDecode 解码 GB18030 buffer 中文不乱码", () => {
    // 注：Node 的 Buffer.from 不支持 gb18030 编码，故直接给出 GB18030 字节。
    // 中 = D6 D0，国 = B9 FA（GBK/GB18030 双字节），其余 ASCII 字节原样透传。
    const buf = Buffer.from([
      0xd6, 0xd0, 0xb9, 0xfa, // 中国
      0x2c, // 逗号 ','
      0x33, 0x38, 0x35, 0x38, // "3858"
    ]);
    const text = safeDecode(buf);
    expect(text).toBe("中国,3858");
  });

  it("safeDecode 空 buffer 返回空串不抛", () => {
    expect(safeDecode(Buffer.alloc(0))).toBe("");
  });
});

describe("fetcher-market-quote · parseSinaBlock", () => {
  it("提取 hq_str_<symbol> → 字段串（指数 + FX）", () => {
    const block =
      'var hq_str_s_sh000001="上证指数,3858.2450,44.0472,1.15,5048794,103131214";\n' +
      'var hq_str_USDCNY="18:07:02,6.7659,6.7664,6.7739,42,6.7666,6.7699,6.7657,6.7659,美元/人民币,2026-07-27";';
    const m = parseSinaBlock(block);
    expect(m.s_sh000001).toContain("上证指数");
    expect(m.USDCNY).toContain("美元/人民币");
  });
});

describe("fetcher-market-quote · parseIndexLine (s_ 简化格式)", () => {
  it("名称,当前价,涨跌额,涨跌% 映射正确", () => {
    const d = parseIndexLine(
      "s_sh000001",
      "上证指数,3858.2450,44.0472,1.15,5048794,103131214",
    );
    expect(d.symbol).toBe("s_sh000001");
    expect(d.name).toBe("上证指数");
    expect(d.price).toBeCloseTo(3858.245);
    expect(d.change).toBeCloseTo(44.0472);
    expect(d.changePct).toBeCloseTo(1.15);
  });

  it("字段不足返回 null", () => {
    expect(parseIndexLine("s_sh000001", "上证指数")).toBeNull();
  });
});

describe("fetcher-market-quote · parseFxLine (D2: FX 仅中间价)", () => {
  it("只返回中间价，change/changePct 恒为 0 且标记 isFx=true", () => {
    const d = parseFxLine(
      "USDCNY",
      "18:07:02,6.7659,6.7664,6.7739,42,6.7666,6.7699,6.7657,6.7659,美元/人民币,2026-07-27",
    );
    expect(d.symbol).toBe("USDCNY");
    expect(d.name).toBe("美元/人民币");
    expect(d.price).toBeCloseTo(6.7659);
    // D2：FX 无可靠昨收，不展示可能错误的涨跌
    expect(d.change).toBe(0);
    expect(d.changePct).toBe(0);
    expect(d.isFx).toBe(true);
  });

  it("字段不足时也只返回价格 + isFx 标记，不抛", () => {
    const d = parseFxLine("USDCNY", "18:07:02,6.7659");
    expect(d.price).toBeCloseTo(6.7659);
    expect(d.change).toBe(0);
    expect(d.changePct).toBe(0);
    expect(d.isFx).toBe(true);
  });
});

// ===== QA 独立验证补充断言 =====
/** 把 ASCII + 少量 GB18030 汉字编译成 Buffer（Node Buffer.from 不支持 gb18030）。 */
function gb18030(str: string): Buffer {
  const map: Record<string, number[]> = {
    上: [0xc9, 0xcf],
    证: [0xd6, 0xa4],
    指: [0xd6, 0xb8],
    数: [0xca, 0xfd],
    中: [0xd6, 0xd0],
    国: [0xb9, 0xfa],
  };
  const out: number[] = [];
  for (const ch of str) {
    if (map[ch]) out.push(...map[ch]);
    else out.push(ch.charCodeAt(0)); // ASCII
  }
  return Buffer.from(out);
}

describe("fetcher-market-quote · GB18030 真实指数整行解码 (QA 补充)", () => {
  it("safeDecode 解码完整新浪指数行（中文名称 + 数字字段）", () => {
    const line = "上证指数,3858.2450,44.0472,1.15,5048794,103131214";
    const text = safeDecode(gb18030(line));
    expect(text).toBe(line);
  });

  it("safeDecode 纯 ASCII 数字串透传（GB18030 对 ASCII 兼容）", () => {
    const buf = Buffer.from("6.7659,6.7739,42");
    expect(safeDecode(buf)).toBe("6.7659,6.7739,42");
  });
});

describe("fetcher-market-quote · parseIndexLine 边界 (QA 补充)", () => {
  it("恰好 4 字段（名称,价,涨跌额,涨跌%）也能解析，不因缺量/额字段返回 null", () => {
    const d = parseIndexLine("s_sz399006", "创业板指,2000.5,12.3,0.62");
    expect(d).not.toBeNull();
    expect(d.name).toBe("创业板指");
    expect(d.price).toBeCloseTo(2000.5);
    expect(d.change).toBeCloseTo(12.3);
    expect(d.changePct).toBeCloseTo(0.62);
  });

  it("空数据返回 null 不抛", () => {
    expect(parseIndexLine("s_sh000001", "")).toBeNull();
  });
});

describe("fetcher-market-quote · 指数/FX 两套分开解析 (QA 补充)", () => {
  it("fetch 路由：指数走 parseIndexLine、FX 走 parseFxLine，互不串味", () => {
    const block =
      'var hq_str_s_sh000001="上证指数,3858.2450,44.0472,1.15,5048794,103131214";\n' +
      'var hq_str_USDCNY="18:07:02,6.7659,6.7664,6.7739,42,6.7666,6.7699,6.7657,6.7659,美元/人民币,2026-07-27";';
    const parsed = parseSinaBlock(block);
    const idx = parseIndexLine("s_sh000001", parsed.s_sh000001);
    const fx = parseFxLine("USDCNY", parsed.USDCNY);
    // 指数解析出 changePct（第4字段）；FX 仅中间价（isFx），无涨跌
    expect(idx.changePct).toBeCloseTo(1.15);
    expect(fx.price).toBeCloseTo(6.7659);
    // FX 名称来自 FX_SYMBOLS[0]，而非解析文本（与指数不同）
    expect(fx.name).toBe("美元/人民币");
    expect(idx.symbol).toBe("s_sh000001");
    expect(fx.symbol).toBe("USDCNY");
  });

  it("parseFxLine 名称恒为 FX_SYMBOLS[0].name，不依赖解析文本", () => {
    // 即便文本里没有中文名称字段，name 也应正确
    const d = parseFxLine("USDCNY", "18:07:02,6.7659,6.7664,6.7739,42");
    expect(d.name).toBe("美元/人民币");
  });
});

// D2：FX 字段布局无可靠「昨收」列，已决策「仅展示中间价、不展示涨跌」。
// 上面 "D2: FX 仅中间价" 用例已锁定该契约；联调真实行情只需确认中间价解析正确。
describe("fetcher-market-quote · FX 涨跌（已按 D2 退化，无涨跌）", () => {
  it("FX 不暴露涨跌，UI 仅显示中间价（避免误导）", () => {
    const d = parseFxLine("USDCNY", "18:07:02,6.7659,6.7664,6.7739,42");
    expect(d.isFx).toBe(true);
    expect(d.change).toBe(0);
    expect(d.changePct).toBe(0);
  });
});
