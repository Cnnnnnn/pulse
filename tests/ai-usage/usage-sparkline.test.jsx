/**
 * tests/ai-usage/usage-sparkline.test.js
 *
 * 单测 UsageSparkline 组件: 7 天 bar, 今天在最右, hover 显示 tooltip,
 * 同 date 多次取 max, 缺失天补空.
 */

// @vitest-environment happy-dom

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDay(yyyyMmDd, deltaDays) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

beforeEach(() => {
  cleanup();
});

describe("UsageSparkline", () => {
  test("空 history → 渲染 7 根空 bar, 最后一根是 today", async () => {
    const { UsageSparkline } = await import("../../src/renderer/components/UsageSparkline.jsx");
    const { container } = render(<UsageSparkline history={{ days: [] }} days={7} />);
    const bars = container.querySelectorAll(".ai-usage-sparkline-bar");
    expect(bars.length).toBe(7);
    // 没有 filled
    expect(container.querySelectorAll(".ai-usage-sparkline-bar--filled").length).toBe(0);
    // 最后那根应该是 today
    expect(bars[bars.length - 1].classList.contains("ai-usage-sparkline-bar--today")).toBe(true);
  });

  test("有数据 → 7 根 bar, 2 根 filled, today 在最右", async () => {
    const { UsageSparkline } = await import("../../src/renderer/components/UsageSparkline.jsx");
    const today = todayKey();
    const { container } = render(
      <UsageSparkline
        history={{
          days: [
            { date: today, used: 500, percent: 30 },
            { date: shiftDay(today, -2), used: 200, percent: 10 },
          ],
        }}
        days={7}
      />
    );
    const bars = container.querySelectorAll(".ai-usage-sparkline-bar");
    expect(bars.length).toBe(7);
    expect(container.querySelectorAll(".ai-usage-sparkline-bar--filled").length).toBe(2);
    expect(bars[bars.length - 1].classList.contains("ai-usage-sparkline-bar--today")).toBe(true);
    // filled 的 bar 高度 > 0
    const filled = container.querySelectorAll(".ai-usage-sparkline-bar--filled");
    expect(parseInt(filled[0].style.height, 10)).toBeGreaterThan(0);
  });

  test("同 date 多次 → 只 1 根 filled, 取最大 used 决定高度", async () => {
    const { UsageSparkline } = await import("../../src/renderer/components/UsageSparkline.jsx");
    const today = todayKey();
    const { container } = render(
      <UsageSparkline
        history={{
          days: [
            { date: today, used: 100 },
            { date: today, used: 300 },
            { date: today, used: 200 },
          ],
        }}
        days={7}
      />
    );
    const filled = container.querySelectorAll(".ai-usage-sparkline-bar--filled");
    expect(filled.length).toBe(1);
    // yMax=300, max filled = (300/300)*(56-6) = 50px
    expect(parseInt(filled[0].style.height, 10)).toBeGreaterThan(40);
  });

  test("数据多过 N → 截到最近 7 天 (今天永远在最右)", async () => {
    const { UsageSparkline } = await import("../../src/renderer/components/UsageSparkline.jsx");
    const today = todayKey();
    const days = [];
    for (let i = 30; i >= 0; i--) days.push({ date: shiftDay(today, -i), used: 100 + i });
    const { container } = render(
      <UsageSparkline history={{ days }} days={7} />
    );
    const bars = container.querySelectorAll(".ai-usage-sparkline-bar");
    expect(bars.length).toBe(7);
  });

  test("无 history 数据 → 渲染 7 根空 bar (骨架, 表达 '没有数据' 状态)", async () => {
    const { UsageSparkline } = await import("../../src/renderer/components/UsageSparkline.jsx");
    const { container } = render(
      <UsageSparkline history={{ days: [] }} days={7} />
    );
    const bars = container.querySelectorAll(".ai-usage-sparkline-bar");
    expect(bars.length).toBe(7);
    // 全空, 没有 filled
    expect(container.querySelectorAll(".ai-usage-sparkline-bar--filled").length).toBe(0);
  });

  test("hover bar → 显示 tooltip (含数字)", async () => {
    const { UsageSparkline } = await import("../../src/renderer/components/UsageSparkline.jsx");
    const today = todayKey();
    const { container } = render(
      <UsageSparkline
        history={{ days: [{ date: today, used: 500, percent: 30 }] }}
        days={7}
      />
    );
    const bar = container.querySelector(".ai-usage-sparkline-bar--filled");
    fireEvent.mouseEnter(bar);
    const tooltip = container.querySelector(".ai-usage-sparkline-tooltip");
    expect(tooltip).toBeTruthy();
    expect(tooltip.textContent).toMatch(/500/);
    expect(tooltip.textContent).toMatch(/30%/);
    fireEvent.mouseLeave(bar);
  });
});
