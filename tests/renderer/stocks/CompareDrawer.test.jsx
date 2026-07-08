// @vitest-environment happy-dom
/**
 * tests/renderer/stocks/CompareDrawer.test.jsx
 *
 * 对比池抽屉渲染:
 *   - grid 9 列结构 (head/row 同一 grid-template-columns → 列对齐)
 *   - 缺价 entry 在打开 drawer 时通过 api.stocksSearch 反查补价 (写回 pool)
 *   - 缺 scores 时综合分/5 维显示 "—"
 *   - D-5: 4 财务列 (PE/PB/ROE/市值) 也由 stocksSearch 一次性补齐
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/preact";
import { CompareDrawer } from "../../../src/renderer/stocks/CompareDrawer.jsx";
import {
  comparePool,
  compareDrawerOpen,
  toggleCompare,
  clearCompare,
} from "../../../src/renderer/stocks/comparePool.js";

// ponytail: 把 grid-template-columns 字符串按顶层空格切分. minmax(0, 1fr) 内部
// 空格+逗号因 depth>0 视作 1 token.
function splitTopLevel(s) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === " " && depth === 0) {
      if (cur) { out.push(cur); cur = ""; }
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

describe("CompareDrawer", () => {
  beforeEach(() => {
    clearCompare();
    compareDrawerOpen.value = false;
  });

  it("D-5: grid 9 列对齐: head 跟 row 用同一份 grid-template-columns (CSS rule)", () => {
    // ponytail: 关键 — head 跟 row 共用同一份 grid-template-columns, 才不会对不齐.
    // happy-dom 不解析 grid-template-columns 计算值, 直接读 styles.css 文本, 数 9 列.
    const fs = require("fs");
    const path = require("path");
    const css = fs.readFileSync(
      path.resolve(__dirname, "../../../styles.css"),
      "utf8",
    );
    // ponytail: 用 stack-based 解析 .cmp-head, .cmp-row { ... } 这条规则.
    // grid-template-columns 现在多行 (换行分列), 简单 { } 贪婪匹配会截断. 改用逐字符 stack.
    const startIdx = css.indexOf(".cmp-head, .cmp-row");
    expect(startIdx).toBeGreaterThanOrEqual(0);
    const braceStart = css.indexOf("{", startIdx);
    let depth = 1;
    let i = braceStart + 1;
    for (; i < css.length && depth > 0; i++) {
      const c = css[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
    }
    const body = css.slice(braceStart + 1, i - 1);
    expect(/display:\s*grid/.test(body)).toBe(true);
    // 9 列: 1fr 名称 + 56 现价 + 44 PE + 44 PB + 44 ROE + 56 市值 + 32 综合 + 60 5 维 + 24 删
    const colMatch = body.match(/grid-template-columns:\s*([\s\S]+?);/);
    expect(colMatch).toBeTruthy();
    const tokens = splitTopLevel(colMatch[1].trim().replace(/\s+/g, " "));
    expect(tokens.length).toBe(9);
    expect(tokens[0]).toBe("minmax(0, 1fr)");

    // ponytail: 再 render 一份, 确认 cmp-head 跟 cmp-row 节点都存在 (drawer 渲染没炸)
    compareDrawerOpen.value = true;
    toggleCompare({ code: "002463", name: "沪电股份", price: 218, changePct: 2.3, industry: "PCB" });
    const { container } = render(<CompareDrawer api={null} />);
    expect(container.querySelector(".cmp-head")).toBeTruthy();
    expect(container.querySelector(".cmp-row")).toBeTruthy();
  });

  it("缺价 entry 在 drawer 打开时通过 api.stocksSearch 反查补价", async () => {
    compareDrawerOpen.value = true;
    // 模拟搜索路径: entry 来自搜索, 没价
    toggleCompare({ code: "002463", name: "沪电股份" });
    toggleCompare({ code: "600519", name: "贵州茅台", price: 1685 });
    const api = {
      stocksSearch: vi.fn(async (q) => {
        if (q === "002463") {
          return {
            ok: true,
            results: [{ code: "002463", name: "沪电股份", price: 218, changePct: 2.3 }],
          };
        }
        return { ok: true, results: [] };
      }),
    };
    render(<CompareDrawer api={api} />);
    await waitFor(() => {
      const updated = comparePool.value.find((e) => e.code === "002463");
      expect(updated.price).toBe(218);
      expect(updated.changePct).toBe(2.3);
    });
    // 已有价的不重查
    expect(api.stocksSearch).toHaveBeenCalledTimes(1);
    expect(api.stocksSearch).toHaveBeenCalledWith("002463");
  });

  it("缺 scores 时综合分跟 5 维小柱都显示 —", () => {
    compareDrawerOpen.value = true;
    toggleCompare({ code: "002463", name: "沪电股份", price: 218, changePct: 2.3 });
    const { container } = render(<CompareDrawer api={null} />);
    expect(container.querySelector(".cmp-overall-missing")).toBeTruthy();
    // 5 维小柱有 dim-missing 占位
    expect(container.querySelectorAll(".cmp-dim-missing").length).toBe(5);
  });

  it("D-5: 缺 4 财务字段的 entry 在 drawer 打开时一次性补齐 (pe/pb/roe/marketCap)", async () => {
    compareDrawerOpen.value = true;
    // ponytail: 模拟 entry 来自搜索 (没价) → useEnrichMissingPrices 会触发 stocksSearch,
    //   拿到行后一次性补全 4 财务字段. 之前测试 4 误传 price: 218, 让 useEnrichMissingPrices
    //   跳过 (只在 price==null 时拉), 故没拉到 pe/pb/roe/marketCap.
    toggleCompare({ code: "002463", name: "沪电股份" }); // 故意没价
    const api = {
      stocksSearch: vi.fn(async (q) => {
        if (q === "002463") {
          return {
            ok: true,
            results: [{
              code: "002463", name: "沪电股份", price: 218, changePct: 2.3,
              pe: 25.4, pb: 5.1, roe: 18.3, marketCap: 4.2e11,
            }],
          };
        }
        return { ok: true, results: [] };
      }),
    };
    render(<CompareDrawer api={api} />);
    await waitFor(() => {
      const updated = comparePool.value.find((e) => e.code === "002463");
      expect(updated.pe).toBe(25.4);
      expect(updated.pb).toBe(5.1);
      expect(updated.roe).toBe(18.3);
      expect(updated.marketCap).toBe(4.2e11);
    });
  });

  it("D-5: 缺 4 财务字段时 FinCell 显示 — (cmp-fin-missing)", () => {
    compareDrawerOpen.value = true;
    // 模拟只带价的 entry, 4 财务字段全 null
    toggleCompare({ code: "002463", name: "沪电股份", price: 218, changePct: 2.3 });
    const { container } = render(<CompareDrawer api={null} />);
    // 4 个 FinCell 缺数据 → 4 个 cmp-fin-missing
    const missing = container.querySelectorAll(".cmp-fin-missing");
    expect(missing.length).toBeGreaterThanOrEqual(4);
  });

  it("D-5: 市值格式 formatMarketCap (亿/万)", () => {
    // ponytail: 验证 formatMarketCap 的紧凑展示: 100亿+ 取整, 1-100亿 1 位小数
    compareDrawerOpen.value = true;
    toggleCompare({
      code: "X1", name: "大市值", price: 100, marketCap: 5.0e11, // 5000 亿
      pe: 10, pb: 2, roe: 15,
    });
    toggleCompare({
      code: "X2", name: "小市值", price: 50, marketCap: 8.5e9, // 85 亿
      pe: 30, pb: 4, roe: 8,
    });
    const { container } = render(<CompareDrawer api={null} />);
    const txt = container.textContent;
    expect(txt).toMatch(/5000亿/);
    expect(txt).toMatch(/85\.0亿/);
  });
});
