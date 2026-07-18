// @vitest-environment node
// ponytail 2026-07-18 P0-1 polish: 视觉契约兜底 — 断言 src/renderer/stocks/stocks.css
//   包含从根 styles.css 迁过来的所有 stocks-only class, 防止被搬走或被删.
// ponytail: 不引 stylelint 也不引 chromium. 真 chromium 视觉回归由
//   tests/visual/visual.spec.js 兜底. 本文件做模块级 CSS 边界兜底.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// tests/renderer/stocks/stocks-css-contract.test.jsx → 4 层 .. 走出到 repo root,
// 然后 src/renderer/stocks/stocks.css. 同 DataHealthPill.styles.test.jsx.
const cssPath = join(here, "..", "..", "..", "src", "renderer", "stocks", "stocks.css");
const css = readFileSync(cssPath, "utf8");

// P0-1 polish 搬过来的 ~95 个 stocks-only selector. 每个都是单一模块的 class, 不在
// src/renderer/{funds,invest,metals,games,news}/ 用到. styles.css 里这类 class 出现的
// 来源也被搬过来了. 这里列表是这份搬运的最小保证 — 任何丢失会触发 CI fail.
const STOCKS_ONLY_CLASSES = [
  // 个股对比池 (add-compare-*)
  ".add-compare-btn", ".add-compare-card", ".add-compare-mark",
  ".add-compare-row", ".add-compare-in", ".add-compare-flash-full",
  // 个股对比抽屉 (cmp-*)
  ".cmp-empty", ".cmp-empty-hint", ".cmp-head", ".cmp-row", ".cmp-list",
  ".cmp-cell", ".cmp-cell-name", ".cmp-name", ".cmp-code",
  ".cmp-cell-price", ".cmp-price-num", ".cmp-change",
  ".cmp-cell-overall", ".cmp-overall-num", ".cmp-overall-missing",
  ".cmp-cell-dims", ".cmp-dim-label", ".cmp-mini-dim", ".cmp-mini-track", ".cmp-mini-fill",
  ".cmp-dim-missing", ".cmp-cell-fin", ".cmp-fin-missing", ".cmp-fin-num",
  ".cmp-cell-actions", ".cmp-remove", ".cmp-foot", ".cmp-foot-hint",
  // 对比池浮动按钮 (compare-pool-*)
  ".compare-pool-fab", ".compare-pool-fab-icon", ".compare-pool-fab-count",
  // 诊断页 (diagnosis-*)
  ".diagnosis-actions", ".diagnosis-toolbar", ".diagnosis-back",
  ".diagnosis-hero-info", ".diagnosis-hero-title",
  ".diagnosis-hero-code", ".diagnosis-hero-price",
  ".diagnosis-rating-box", ".diagnosis-rating-num", ".diagnosis-rating-max", ".diagnosis-rating-label",
  ".diagnosis-report-grid", ".diagnosis-loading", ".diagnosis-error",
  ".diagnosis-disclaimer",
  ".diagnosis-data-gaps", ".diagnosis-data-gaps-text",
  ".diagnosis-skel-banner",
  // AI 解读行 (ai-note-*)
  ".ai-note-line", ".ai-note-icon", ".ai-note-text",
  ".ai-note-refresh", ".ai-note-line-failed", ".ai-note-refresh-failed",
  // 9 张诊断卡 module-card / module-grid
  ".module-card", ".module-card-wrap", ".module-card-title",
  ".module-card-body", ".module-card-empty", ".module-card--risk",
  ".module-card-risk-list", ".module-card-sub",
  ".module-card-skel", ".module-card-skel-label",
  ".module-grid",
  // 同业/行业对比 (peer-compare-* / ind-compare-*)
  ".peer-compare-industry", ".peer-compare-status",
  ".peer-compare-medians", ".peer-compare-median",
  ".ind-compare", ".ind-compare-label", ".ind-compare-row",
  ".ind-compare-mine", ".ind-compare-ind",
  ".ind-compare-track", ".ind-compare-fill", ".ind-compare-midmark",
  ".ind-compare-mark", ".ind-compare-val", ".ind-compare-delta",
  ".ind-compare-positive", ".ind-compare-cautious", ".ind-compare-neutral", ".ind-compare-pct",
  // 个股诊断页面壳
  ".stock-diagnosis-page",
  // 个股搜索框
  ".stock-search-wrap", ".stock-search-input", ".stock-search-dropdown",
  ".stock-search-item", ".stock-search-item-name", ".stock-search-item-code",
  ".stock-search-empty",
  // 表格骨架 + 加载状态 (来自 stocks-only 复合 selector)
  ".stock-table-loading", ".stock-table-loading-bar", ".stock-table-loading-bar-inner",
  ".stock-empty-state", ".stock-empty-title", ".stock-empty-sub",
  // 维度评分对比柱 (DimensionScores)
  ".dimension-scores", ".dimension-scores-bars", ".dimension-scores-skel",
  // CardFreshness (数据新鲜度徽标)
  ".card-freshness", ".card-freshness-stale",
];

describe("stocks.css 模块边界 — 95+ 个 stocks-only class 锁住不被搬走", () => {
  it("stocks.css 是 stocks 模块的 CSS 边界文件 (来自 src/renderer/stocks/*.jsx 编译)", () => {
    // sanity: 确认文件存在且非空
    expect(css.length).toBeGreaterThan(10000);
  });

  for (const cls of STOCKS_ONLY_CLASSES) {
    it(`stocks.css 含 ${cls}`, () => {
      expect(css).toContain(cls);
    });
  }
});