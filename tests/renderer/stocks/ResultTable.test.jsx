// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";
import { ResultTable } from "../../../src/renderer/stocks/ResultTable.jsx";
import { results } from "../../../src/renderer/stocks/stockStore.js";
import { stockDiagnosisCode, stockActiveTab } from "../../../src/renderer/stocks/diagnosisStore.js";

vi.mock("../../../src/renderer/api.js", () => ({ api: {} }));
afterEach(() => { cleanup(); results.value = []; stockDiagnosisCode.value = null; stockActiveTab.value = "screen"; });

describe("ResultTable 诊断按钮", () => {
  it("每行末尾有「诊断」按钮", () => {
    results.value = [
      { code: "300750", name: "宁德时代", price: 218, changePct: 2.3, pe: 28, roe: 24, industry: "电池" },
      { code: "600519", name: "贵州茅台", price: 1680, changePct: -0.5, pe: 35, roe: 30, industry: "白酒" },
    ];
    const { container } = render(<ResultTable api={{}} />);
    const btns = container.querySelectorAll('[data-testid="diagnosis-btn"]');
    expect(btns.length).toBe(2);
  });
  it("点击诊断按钮 → stockDiagnosisCode 设为该 code", () => {
    results.value = [{ code: "300750", name: "宁德时代", price: 218 }];
    const { container } = render(<ResultTable api={{}} />);
    fireEvent.click(container.querySelector('[data-testid="diagnosis-btn"]'));
    expect(stockDiagnosisCode.value).toBe("300750");
  });

  it("UX-1: <1100px 隐藏行业列, <800px 进一步藏 PE, 列数同步 grid (CSS rule)", () => {
    // ponytail: 列隐藏必须跟 grid 列数同步, 否则 hidden 后 grid 留白列. 直接读 styles.css
    //   验证 stocks 那段 (避免抓错同名 @media, 比如 metals 也有 800px media).
    const fs = require("fs");
    const path = require("path");
    const css = fs.readFileSync(
      path.resolve(__dirname, "../../../styles.css"),
      "utf8",
    );
    // stocks 段的 stock-table CSS 后立刻跟我们的 @media (注释里有 ponytail 2026-07-08 UX-1)
    const stockTableEnd = css.indexOf("stock-table-loading .stock-table-head");
    expect(stockTableEnd).toBeGreaterThan(-1);
    const stocksUi = css.slice(stockTableEnd);
    // ponytail: 行号漂移敏感, 用特征串 "ponytail 2026-07-08 UX-1" 锚定
    const anchor = "ponytail 2026-07-08 UX-1";
    expect(stocksUi.indexOf(anchor)).toBeGreaterThan(-1);

    // 1100px 块: grid 6 列 + 第 6 子隐藏
    const splitTopLevel = (s) => {
      const out = [];
      let depth = 0, cur = "";
      for (const ch of s) {
        if (ch === "(") depth++, cur += ch;
        else if (ch === ")") depth--, cur += ch;
        else if (ch === " " && depth === 0) {
          if (cur) out.push(cur);
          cur = "";
        } else cur += ch;
      }
      if (cur) out.push(cur);
      return out;
    };
    const grabMediaBlock = (label) => {
      // ponytail: 大括号栈式匹配, 处理嵌套 (e.g. .foo > :nth { ... }).
      const idx = stocksUi.indexOf(label);
      expect(idx).toBeGreaterThan(-1);
      // 跳过 "@media ... {"
      const openStart = stocksUi.indexOf("{", idx);
      let depth = 0, end = -1;
      for (let i = openStart; i < stocksUi.length; i++) {
        if (stocksUi[i] === "{") depth++;
        else if (stocksUi[i] === "}") {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      expect(end).toBeGreaterThan(-1);
      return stocksUi.slice(openStart + 1, end);
    };

    const block1100 = grabMediaBlock("@media (max-width: 1100px)");
    const cols1100 = (block1100.match(/grid-template-columns:\s*([^;]+);/) || [null, ""])[1];
    expect(splitTopLevel(cols1100).length).toBe(6);
    expect(block1100).toMatch(/nth-child\(6\)/);
    expect(block1100).toMatch(/display:\s*none/);

    const block800 = grabMediaBlock("@media (max-width: 800px)");
    const cols800 = (block800.match(/grid-template-columns:\s*([^;]+);/) || [null, ""])[1];
    expect(splitTopLevel(cols800).length).toBe(5);
    // ponytail: 800px 比 1100px 多藏 PE (nth-child(4)). 第 6 列 (行业) 在两个 media 都该藏.
    // 用 nth-child 计数 — 复合选择器里出现几次算几次.
    const n4 = (block800.match(/nth-child\(4\)/g) || []).length;
    const n6 = (block800.match(/nth-child\(6\)/g) || []).length;
    expect(n4).toBeGreaterThanOrEqual(1);
    expect(n6).toBeGreaterThanOrEqual(1);
  });
});
