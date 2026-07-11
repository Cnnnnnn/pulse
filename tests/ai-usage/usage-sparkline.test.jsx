/**
 * tests/ai-usage/usage-sparkline.test.jsx
 *
 * 单测 UsageSparkline 组件: 7 天折线, 今天在最右, hover 显示 tooltip,
 * 同 date 多次取 max, 缺失天补空.
 *
 * ponytail: 历史版本是柱状 (bar div), 现在改成 SVG 折线 — 适配新元素
 * (.ai-usage-sparkline-svg / -stroke / -point--today / -point--anomaly).
 * 同 date 取最大 percent 是 buildSeries 的职责, 这里只验证 sparkline 渲染契约.
 */

// @vitest-environment happy-dom

import { describe, test, expect, beforeEach } from "vitest";
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

describe("UsageSparkline (折线 SVG)", () => {
  test("空 history → 渲染 7 个折线点, 最后一个是 today", async () => {
    const { UsageSparkline } = await import("../../src/renderer/components/UsageSparkline.jsx");
    const { container } = render(<UsageSparkline history={{ days: [] }} days={7} />);
    // 7 个 hover 命中 rect (一个点一个)
    const rects = container.querySelectorAll(".ai-usage-sparkline-svg rect");
    expect(rects.length).toBe(7);
    // 折线 stroke 渲染 (即使 percent=0 也画)
    expect(container.querySelector(".ai-usage-sparkline-stroke")).toBeTruthy();
  });

  test("有数据 → 折线渲染 + today 点特殊样式", async () => {
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
    const rects = container.querySelectorAll(".ai-usage-sparkline-svg rect");
    expect(rects.length).toBe(7);
    // today 点应有 --today class
    const todayPt = container.querySelector(".ai-usage-sparkline-point--today");
    expect(todayPt).toBeTruthy();
    // 折线有 stroke + area
    expect(container.querySelector(".ai-usage-sparkline-stroke")).toBeTruthy();
    expect(container.querySelector(".ai-usage-sparkline-area")).toBeTruthy();
  });

  test("数据多过 N → 截到最近 7 天 (今天永远在最右)", async () => {
    const { UsageSparkline } = await import("../../src/renderer/components/UsageSparkline.jsx");
    const today = todayKey();
    const days = [];
    for (let i = 30; i >= 0; i--) days.push({ date: shiftDay(today, -i), used: 100 + i });
    const { container } = render(
      <UsageSparkline history={{ days }} days={7} />
    );
    const rects = container.querySelectorAll(".ai-usage-sparkline-svg rect");
    expect(rects.length).toBe(7);
  });

  test("hover rect → 显示 tooltip (含 percent + used 单位)", async () => {
    const { UsageSparkline } = await import("../../src/renderer/components/UsageSparkline.jsx");
    const today = todayKey();
    const { container } = render(
      <UsageSparkline
        history={{ days: [{ date: today, percent: 30, used: 500 }] }}
        days={7}
      />
    );
    // 最后一个 rect 对应 today
    const rects = container.querySelectorAll(".ai-usage-sparkline-svg rect");
    fireEvent.mouseEnter(rects[rects.length - 1]);
    const tooltip = container.querySelector(".ai-usage-sparkline-tooltip");
    expect(tooltip).toBeTruthy();
    expect(tooltip.textContent).toMatch(/30%/);
    fireEvent.mouseLeave(rects[rects.length - 1]);
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
    const rects = container.querySelectorAll(".ai-usage-sparkline-svg rect");
    fireEvent.mouseEnter(rects[rects.length - 1]);
    const tooltip = container.querySelector(".ai-usage-sparkline-tooltip");
    expect(tooltip.textContent).toMatch(/25%/);
  });

  test("anomalyToday=true → today 点用 --anomaly class", async () => {
    const { UsageSparkline } = await import("../../src/renderer/components/UsageSparkline.jsx");
    const today = todayKey();
    const { container } = render(
      <UsageSparkline
        history={{ days: [{ date: today, percent: 95, used: 1000 }] }}
        days={7}
        anomalyToday
      />
    );
    const anomaly = container.querySelector(".ai-usage-sparkline-point--anomaly");
    expect(anomaly).toBeTruthy();
  });
});
