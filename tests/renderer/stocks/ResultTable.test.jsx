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
    // ponytail: 列隐藏必须跟 grid 列数同步, 否则 hidden 后 grid 留白列. 直接读 stocks.css
    //   (P0-1 polish 后 stocks 样式已从 styles.css 迁到 src/renderer/stocks/stocks.css,
    //   验证 stocks 那段 (避免抓错同名 @media, 比如 metals 也有 800px media).
    const fs = require("fs");
    const path = require("path");
    const css = fs.readFileSync(
      path.resolve(__dirname, "../../../src/renderer/stocks/stocks.css"),
      "utf8",
    ) + fs.readFileSync(
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

  it("P-2: rows < 200 → 不加 .stock-table-rows-virtualized (避免开销)", () => {
    // ponytail: 阈值内 套 wrapper 是浪费 — content-visibility 自身有少量解析成本.
    results.value = Array.from({ length: 100 }, (_, i) => ({
      code: `c${i}`, name: `n${i}`, price: 10, changePct: 0, pe: 10, roe: 10, industry: "x",
    }));
    const { container } = render(<ResultTable api={{}} />);
    expect(container.querySelector(".stock-table-rows-virtualized")).toBeNull();
  });

  it("P-2: rows >= 200 → 套 .stock-table-rows-virtualized, CSS 触发 content-visibility: auto", () => {
    // ponytail: 套 wrapper, 视口外 row 跳过 layout/paint. 浏览器原生, 零依赖.
    results.value = Array.from({ length: 200 }, (_, i) => ({
      code: `c${i}`, name: `n${i}`, price: 10, changePct: 0, pe: 10, roe: 10, industry: "x",
    }));
    const { container } = render(<ResultTable api={{}} />);
    const wrapper = container.querySelector(".stock-table-rows-virtualized");
    expect(wrapper).toBeTruthy();
    // CSS 规则确实给了 content-visibility: auto
    const fs = require("fs");
    const path = require("path");
    const css = fs.readFileSync(
      path.resolve(__dirname, "../../../src/renderer/stocks/stocks.css"),
      "utf8",
    ) + fs.readFileSync(
      path.resolve(__dirname, "../../../styles.css"),
      "utf8",
    );
    const m = css.match(/\.stock-table-rows-virtualized\s*>\s*\.stock-table-row\s*\{([^}]+)\}/);
    expect(m).toBeTruthy();
    expect(/content-visibility:\s*auto/.test(m[1])).toBe(true);
    // 顺带断言 contain-intrinsic-size 行高估计, 滚动条不抖
    expect(/contain-intrinsic-size:\s*auto\s+\d+px/.test(m[1])).toBe(true);
  });

  it("UX-2: 列头 role=columnheader + aria-sort (none/ascending/descending)", () => {
    // ponytail: 当前 sortKey=roe desc → 那列 aria-sort=descending, 其余=none.
    // 行动列 (sortable: false) 不带 aria-sort.
    results.value = [{ code: "x", name: "x", price: 10, changePct: 0, pe: 10, roe: 10, industry: "x" }];
    const { container } = render(<ResultTable api={{}} />);
    const ths = container.querySelectorAll('[role="columnheader"]');
    // 7 列: 名称/现价/涨跌/PE/ROE/行业/行动
    expect(ths.length).toBe(7);
    // 当前 sortKey 默认 = 'roe' desc (stockStore 默认)
    const roeTh = Array.from(ths).find((el) => /ROE/.test(el.textContent));
    expect(roeTh.getAttribute("aria-sort")).toBe("descending");
    // 其余 (除 actions) 应该是 none
    const nameTh = Array.from(ths).find((el) => /名称/.test(el.textContent));
    expect(nameTh.getAttribute("aria-sort")).toBe("none");
    // 行动列: 无 aria-sort
    const actionTh = Array.from(ths).find((el) => el.textContent.trim() === "");
    expect(actionTh.hasAttribute("aria-sort")).toBe(false);
  });

  it("UX-2: 点击可排序列头 → aria-sort 切到 ascending/descending", () => {
    // ponytail: 列头 click → setSort 触发 sortKey/sortDir 切换, aria-sort 跟随.
    results.value = [{ code: "x", name: "x", price: 10, changePct: 0, pe: 10, roe: 10, industry: "x" }];
    const { container } = render(<ResultTable api={{}} />);
    const ths = container.querySelectorAll('[role="columnheader"]');
    const roeTh = Array.from(ths).find((el) => /ROE/.test(el.textContent));
    // 当前是 roe desc
    expect(roeTh.getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(roeTh);
    // 点 ROE 一次 → toggle 到 asc
    expect(roeTh.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(roeTh);
    // 再点 → desc
    expect(roeTh.getAttribute("aria-sort")).toBe("descending");
  });
});
