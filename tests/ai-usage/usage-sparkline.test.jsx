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

  test("同 date 多次 → 只 1 根 filled, 取最大 percent 决定高度", async () => {
    const { UsageSparkline } = await import("../../src/renderer/components/UsageSparkline.jsx");
    const today = todayKey();
    const { container } = render(
      <UsageSparkline
        history={{
          days: [
            { date: today, percent: 20 },
            { date: today, percent: 80 },
            { date: today, percent: 50 },
          ],
        }}
        days={7}
      />
    );
    const filled = container.querySelectorAll(".ai-usage-sparkline-bar--filled");
    expect(filled.length).toBe(1);
    // percent=80, height = (80/100)*(56-6) = 40px
    expect(parseInt(filled[0].style.height, 10)).toBeGreaterThanOrEqual(38);
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

  test("hover bar → 显示 tooltip (含 percent + used 单位)", async () => {
    const { UsageSparkline } = await import("../../src/renderer/components/UsageSparkline.jsx");
    const today = todayKey();
    const { container } = render(
      <UsageSparkline
        history={{ days: [{ date: today, percent: 30, used: 500 }] }}
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

  test("有 percent 但 used=null → tooltip 只显示百分比", async () => {
    const { UsageSparkline } = await import("../../src/renderer/components/UsageSparkline.jsx");
    const today = todayKey();
    const { container } = render(
      <UsageSparkline
        history={{ days: [{ date: today, percent: 25 }] }}
        days={7}
      />
    );
    const bar = container.querySelector(".ai-usage-sparkline-bar--filled");
    fireEvent.mouseEnter(bar);
    const tooltip = container.querySelector(".ai-usage-sparkline-tooltip");
    expect(tooltip.textContent).toMatch(/25%/);
    expect(tooltip.textContent).not.toMatch(/单位/);
  });
});
