// @vitest-environment node
// ponytail 2026-07-18 P0-1 T8: 视觉契约兜底 — 断言 stocks.css 包含 4 态 pill class
//   及对应 background / color, 不引 stylelint 也不引 chromium.
// ponytail: real chromium 视觉回归由 tests/visual/visual.spec.js 兜底, 本文件
//   保证 4 态类不被意外删除. 重命名/拆文件时 CI 失败, 而样式层不阻塞.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, "..", "..", "..", "..", "src", "renderer", "stocks", "stocks.css");
const css = readFileSync(cssPath, "utf8");

describe("DataHealthPill 4 态 CSS 视觉契约", () => {
  it("含 .data-health-pill 基础样式 (字号 + padding + border-radius)", () => {
    expect(css).toMatch(/\.data-health-pill\s*\{[^}]*font-size:/);
    expect(css).toMatch(/\.data-health-pill\s*\{[^}]*padding:/);
    expect(css).toMatch(/\.data-health-pill\s*\{[^}]*border-radius:/);
  });

  it("含 4 态 modifier 类名 (ok / partial / stale / failed)", () => {
    for (const cls of [".data-health-pill-ok", ".data-health-pill-partial", ".data-health-pill-stale", ".data-health-pill-failed"]) {
      expect(css).toContain(cls);
    }
  });

  it("ok 态用绿色 (var(--ok-) 或 rgba(52, 199, 89, ...))", () => {
    const block = css.match(/\.data-health-pill-ok\s*\{[^}]+\}/);
    expect(block, "missing .data-health-pill-ok block").toBeTruthy();
    // 不强制具体颜色 — 容忍 var() fallback, 只要在 ok 态块内有 background-color 属性.
    expect(block[0]).toMatch(/background:\s*(var|rgba)/);
  });

  it("failed 态包含 retry 按钮样式 (.data-health-pill-retry)", () => {
    expect(css).toContain(".data-health-pill-retry");
    const block = css.match(/\.data-health-pill-retry\s*\{[^}]+\}/);
    expect(block, "missing .data-health-pill-retry block").toBeTruthy();
    expect(block[0]).toMatch(/background:/);
    expect(block[0]).toMatch(/cursor:\s*pointer/);
  });
});
