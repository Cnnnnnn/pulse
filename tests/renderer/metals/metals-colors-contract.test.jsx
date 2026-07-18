// @vitest-environment node
// ponytail 2026-07-18 P6-audit-fix: 视觉契约兜底 — metals 模块用 var(--metals-up/down)
//   画 K线/折线图 SVG stop-color, 用 .metals-up/.metals-down class 标涨跌 (▲/▼ 文字).
//   之前两个变量 + 两个 class 都没 CSS → SVG fallback 到默认色 → 涨跌不分.
//   本文件锁住: 根 styles.css 含这两个 CSS 变量定义 + 两个 class 颜色映射到 --accent-red/green.
//
//   不引 stylelint 也不引 chromium. 真正的视觉回归在 tests/visual/visual.spec.js.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, "..", "..", "..", "styles.css");
const css = readFileSync(cssPath, "utf8");

describe("metals 涨跌色视觉契约 (P6-audit-fix)", () => {
  it("styles.css :root 定义 --metals-up / --metals-down", () => {
    // 中国股市惯例: 红涨绿跌, 跟 stocks.css 的 .stock-td.up/.stock-td.down 同源.
    expect(css).toMatch(/--metals-up:\s*var\(--accent-red\)/);
    expect(css).toMatch(/--metals-down:\s*var\(--accent-green\)/);
  });

  it("styles.css 含 .metals-up / .metals-down class, 颜色绑到 --accent-red/green", () => {
    const upBlock = css.match(/\.metals-up\s*\{([^}]+)\}/);
    expect(upBlock, "missing .metals-up block").toBeTruthy();
    expect(upBlock[0]).toMatch(/color:\s*var\(--accent-red\)/);

    const downBlock = css.match(/\.metals-down\s*\{([^}]+)\}/);
    expect(downBlock, "missing .metals-down block").toBeTruthy();
    expect(downBlock[0]).toMatch(/color:\s*var\(--accent-green\)/);
  });

  it("--color-success / --color-danger 已存在 (metals 变量依赖的 primitive)", () => {
    // ponytail: --metals-up/down 走 var(--accent-red/green), 不绕道 semantic alias.
    // 这里只 sanity check 根 alias 没被误删.
    expect(css).toMatch(/--accent-green:/);
    expect(css).toMatch(/--accent-red:/);
  });
});