// tests/funds/pnlCsv.test.js
// T-B1: 盈亏记录导出 CSV — buildPnlCsv 纯函数单测 (BOM / 列头 / 行数 / 裸数值).
import { describe, it, expect } from "vitest";
import { buildPnlCsv } from "../../src/funds/pnlCsv.js";

const ROWS = [
  { date: "2026-07-10", todayProfit: 123.45, dayReturnPct: 1.23, totalMarketValue: 10000 },
  { date: "2026-07-09", todayProfit: -10, dayReturnPct: -0.5, totalMarketValue: 9876.5 },
  { date: "2026-07-08", todayProfit: 0, dayReturnPct: 0, totalMarketValue: 0 },
];

describe("buildPnlCsv (T-B1)", () => {
  it("以 UTF-8 BOM 开头", () => {
    const csv = buildPnlCsv(ROWS);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("列头为 日期,当日盈亏,收益率,市值", () => {
    const csv = buildPnlCsv(ROWS);
    const header = csv.replace(/^\uFEFF/, "").split("\n")[0];
    expect(header).toBe("日期,当日盈亏,收益率,市值");
  });

  it("行数 = 列头 + 数据行", () => {
    const csv = buildPnlCsv(ROWS);
    const lines = csv.replace(/^\uFEFF/, "").split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(ROWS.length + 1);
  });

  it("数值为裸数值 (带符号, 不含 ¥/%): 当日盈亏/市值 2 位, 收益率不带 %)", () => {
    const csv = buildPnlCsv(ROWS);
    const lines = csv.replace(/^\uFEFF/, "").split("\n").filter((l) => l.length > 0);
    // 第一行数据 (2026-07-10)
    expect(lines[1]).toBe("2026-07-10,+123.45,+1.23,+10000.00");
    // 第二行 (负数)
    expect(lines[2]).toBe("2026-07-09,-10.00,-0.50,+9876.50");
  });

  it("空数组 → 仅列头 + BOM", () => {
    const csv = buildPnlCsv([]);
    const lines = csv.replace(/^\uFEFF/, "").split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe("日期,当日盈亏,收益率,市值");
  });
});
