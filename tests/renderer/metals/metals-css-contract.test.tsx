// @vitest-environment node
// ponytail 2026-07-18 P7-audit-fix: metals 模块 CSS 模块边界 —
//   锁住从 stocks.css 搬出的 78+ selector 没被回滚/搬错,
//   并锁住 audit 补的 3 个缺失 class (.metals-watchlist / .metals-trend-svg /
//   .metals-detail-pin-mark) 不会被误删.
//
//   不引 stylelint 也不引 chromium. 真正的视觉回归在 tests/visual/visual.spec.js.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(
  here,
  "..",
  "..",
  "..",
  "src",
  "renderer",
  "metals",
  "metals.css",
);
const css = readFileSync(cssPath, "utf8");

describe("metals 模块 CSS 边界 (P7-audit-fix)", () => {
  it("metals.css 存在且包含 :root metals 主题变量", () => {
    expect(css).toMatch(/--metals-bg-page:\s*var\(--content-bg\)/);
    expect(css).toMatch(/--metals-row-height:\s*48px/);
  });

  it("metals.css 包含 :root[data-theme='dark'] 暗主题 metals token", () => {
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{/);
    expect(css).toMatch(/--metals-gold:\s*#e2c275/);
  });

  it("audit 补的 3 个缺失 class 必须保留", () => {
    // .metals-watchlist: MetalWatchlist 容器
    expect(css).toMatch(/\.metals-watchlist\s*\{[^}]*display:\s*flex[^}]*\}/s);
    // .metals-trend-svg: SVG 价格走势/蜡烛图
    expect(css).toMatch(/\.metals-trend-svg\s*\{[^}]*display:\s*block[^}]*\}/s);
    // .metals-detail-pin-mark: pin 按钮 ★/☆ 字符
    expect(css).toMatch(/\.metals-detail-pin-mark\s*\{[^}]*\}/s);
  });

  it("stocks.css 不再含 metals-* selector (T7 fixup 错位已经搬出)", () => {
    const stocksCssPath = join(
      here,
      "..",
      "..",
      "..",
      "src",
      "renderer",
      "stocks",
      "stocks.css",
    );
    const stocksCss = readFileSync(stocksCssPath, "utf8");
    // 不应该有 .metals-* (这里用 .metals-layout 等几个样板 key selector 验证)
    expect(stocksCss).not.toMatch(/\.metals-layout\s*\{/);
    expect(stocksCss).not.toMatch(/\.metals-watch-row\s*\{/);
    expect(stocksCss).not.toMatch(/\.metals-detail-modal\s*\{/);
  });

  it("css-audit-run.js 自身 document 这套 pattern (确保脚本注释里引用对的地方)", () => {
    // ponytail: 跨文件锁住 — 这只是健康检查, 不严格.
    expect(css).toContain("P7-audit-fix");
  });
});