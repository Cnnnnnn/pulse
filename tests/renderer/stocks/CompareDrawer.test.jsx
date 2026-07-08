// @vitest-environment happy-dom
/**
 * tests/renderer/stocks/CompareDrawer.test.jsx
 *
 * 对比池抽屉渲染:
 *   - grid 5 列结构 (head/row 同一 grid-template-columns → 列对齐)
 *   - 缺价 entry 在打开 drawer 时通过 api.stocksSearch 反查补价 (写回 pool)
 *   - 缺 scores 时综合分/5 维显示 "—"
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

describe("CompareDrawer", () => {
  beforeEach(() => {
    clearCompare();
    compareDrawerOpen.value = false;
  });

  it("grid 5 列对齐: head 跟 row 用同一份 grid-template-columns (CSS rule)", () => {
    // ponytail: 关键 — head 跟 row 共用同一份 grid-template-columns, 才不会对不齐.
    // happy-dom 不解析 grid-template-columns 计算值, 直接读 styles.css 文本, 数 5 列.
    const fs = require("fs");
    const path = require("path");
    const css = fs.readFileSync(
      path.resolve(__dirname, "../../../styles.css"),
      "utf8",
    );
    // 截取 .cmp-head, .cmp-row { ... } 这条规则
    const m = css.match(/\.cmp-head,\s*\.cmp-row\s*\{([^}]+)\}/);
    expect(m).toBeTruthy();
    const body = m[1];
    expect(/display:\s*grid/.test(body)).toBe(true);
    // grid-template-columns: minmax(0, 1fr) 78px 32px 76px 24px → 5 列
    const colMatch = body.match(/grid-template-columns:\s*([^;]+);/);
    expect(colMatch).toBeTruthy();
    // ponytail: 用 splitTopLevel 把 minmax(0, 1fr) 当 1 个 column 处理 (它内部有空格 + 逗号)
    const splitTopLevel = (s) => {
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
    };
    const tokens = splitTopLevel(colMatch[1].trim());
    expect(tokens.length).toBe(5);
    expect(tokens[0]).toBe("minmax(0, 1fr)");
    expect(tokens[1]).toBe("78px");
    expect(tokens[2]).toBe("32px");
    expect(tokens[3]).toBe("76px");
    expect(tokens[4]).toBe("24px");

    // ponytail: 再 render 一份, 确认 cmp-head 跟 cmp-row 节点都存在 (drawer 渲染没炸)
    compareDrawerOpen.value = true;
    toggleCompare({ code: "002463", name: "沪电股份", price: 218, changePct: 2.3, industry: "PCB" });
    const { container } = render(<CompareDrawer api={null} />);
    expect(container.querySelector(".cmp-head")).toBeTruthy();
    expect(container.querySelector(".cmp-row")).toBeTruthy();
  });

  it("缺价 entry 在 drawer 打开时通过 api.stocksSearch 反查补价", async () => {
    compareDrawerOpen.value = true;
    // 模拟 search 路径: entry 来自搜索, 没价
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
});
