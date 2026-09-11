/**
 * tests/renderer/shared-layout-css.test.ts
 *
 * 回归保护：PageHeader / MergedFilterChip / ViewSwitcher 等共享布局 class
 * 必须落在「始终加载」的 styles.css，不能被抽进懒注入的模块 CSS
 * （stocks.css 等）。v2.85 懒 CSS 注入后曾因误抽导致应用库工具栏塌陷。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "../..");
const stylesCss = readFileSync(join(root, "styles.css"), "utf-8");

const REQUIRED_SELECTORS = [
  ".page-header",
  ".page-header-title",
  ".page-header-actions",
  ".page-action-icon-btn",
  ".view-switcher",
  ".view-switcher-btn",
  ".merged-filter",
  ".merged-filter-search",
  ".merged-filter-chip",
  ".command-palette",
  ".topbar",
  ".app-card",
  ".kpi-card",
  ".ai-drawer-shell",
  // Settings 页 TMDB / GitHub Token 输入（误进 github.css 懒注入时设置页无样式）
  ".github-token-input-wrap",
  ".github-token-input",
  ".github-token-reveal",
  ".settings-link",
];

describe("shared layout CSS stays in styles.css", () => {
  for (const sel of REQUIRED_SELECTORS) {
    it(`${sel} 有定义`, () => {
      // 宽松匹配：选择器出现在文件里即认为规则还在
      expect(stylesCss).toContain(sel);
    });
  }

  it("styles.css 里 page-header 是 flex 横排（不是默认 block）", () => {
    // 只匹配「独立」.page-header 规则（行首），避免命中 `.library-page > .page-header`
    const m = stylesCss.match(/(?:^|\n)\.page-header\s*\{[^}]+\}/);
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/display:\s*flex/);
    expect(m![0]).toMatch(/justify-content:\s*space-between/);
  });

  it("merged-filter 是 flex 横排", () => {
    const m = stylesCss.match(/(?:^|\n)\.merged-filter\s*\{[^}]+\}/);
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/display:\s*flex/);
  });
});
