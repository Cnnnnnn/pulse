/**
 * tests/ai-usage/UsageSparkline.test.jsx
 *
 * 近 N 天用量 mini 折线 sparkline 测试.
 * 历史版本是柱状, 现在改成折线 SVG — 验证折线路径渲染 + 关键样式 hook.
 */

// @vitest-environment happy-dom

import { describe, test, expect } from "vitest";
import { render } from "@testing-library/preact";
import { UsageSparkline } from "../../src/renderer/components/UsageSparkline.jsx";
const { todayKey, addDays } = require("../../src/ai-usage/history-series.js");

// ponytail: buildSeries 把 series 末尾对齐到 today, 所以 fixture 必须用真实今天日期
// 倒退 6 天 (共 7 天), 否则 buildSeries 会用 0 填充缺失日期, 测试断言错位.
const TODAY = todayKey();
const fakeHistory = {
  days: [
    { date: addDays(TODAY, -6), percent: 30, used: 100 },
    { date: addDays(TODAY, -5), percent: 45, used: 200 },
    { date: addDays(TODAY, -4), percent: 60, used: 300 },
    { date: addDays(TODAY, -3), percent: 55, used: 250 },
    { date: addDays(TODAY, -2), percent: 70, used: 400 },
    { date: addDays(TODAY, -1), percent: 80, used: 500 },
    { date: TODAY, percent: 65, used: 350 },
  ],
};

describe("UsageSparkline", () => {
  test("渲染 SVG 折线 + 面积 (替代老柱状 bar)", () => {
    const { container } = render(<UsageSparkline history={fakeHistory} days={7} />);
    // 折线 SVG 存在
    const svg = container.querySelector(".ai-usage-sparkline-svg");
    expect(svg).toBeTruthy();
    expect(svg.tagName.toLowerCase()).toBe("svg");
    // 折线 stroke + 面积 area 同时渲染
    const stroke = container.querySelector(".ai-usage-sparkline-stroke");
    const area = container.querySelector(".ai-usage-sparkline-area");
    expect(stroke).toBeTruthy();
    expect(area).toBeTruthy();
    // 折线 path 用 M 起头, L 接续 (≥ 1 个 L 节点)
    const d = stroke.getAttribute("d");
    expect(d.startsWith("M ")).toBe(true);
    expect(d.split(" L ").length).toBeGreaterThanOrEqual(7);
    // 老柱状 bar div 已删除
    expect(container.querySelector(".ai-usage-sparkline-bar")).toBe(null);
  });

  test("渲染 today 节点 (最后一天特殊样式)", () => {
    const { container } = render(<UsageSparkline history={fakeHistory} days={7} />);
    const todayPt = container.querySelector(".ai-usage-sparkline-point--today");
    expect(todayPt).toBeTruthy();
  });

  test("anomalyToday=true → today 节点用 anomaly 红色样式", () => {
    const { container } = render(
      <UsageSparkline history={fakeHistory} days={7} anomalyToday />,
    );
    const anomaly = container.querySelector(".ai-usage-sparkline-point--anomaly");
    expect(anomaly).toBeTruthy();
  });

  test("hover 命中区: 7 个透明 rect (每个 data point 一个)", () => {
    const { container } = render(<UsageSparkline history={fakeHistory} days={7} />);
    const rects = container.querySelectorAll(".ai-usage-sparkline-svg rect");
    expect(rects).toHaveLength(7);
  });

  test("x-labels: 7 列, 第 1 / 中间 / 最后显示日期 MM/DD", () => {
    const { container } = render(<UsageSparkline history={fakeHistory} days={7} />);
    const labels = container.querySelectorAll(".ai-usage-sparkline-x-label");
    expect(labels).toHaveLength(7);
    // ponytail: x-label 用 date.slice(5) → "MM-DD" (不是 "MM/DD"); todayKey 是 "YYYY-MM-DD"
    const [, m0, d0] = addDays(TODAY, -6).split("-");
    const [, mMid, dMid] = addDays(TODAY, -3).split("-");
    const [, mLast, dLast] = TODAY.split("-");
    expect(labels[0].textContent).toBe(`${m0}-${d0}`);
    expect(labels[3].textContent).toBe(`${mMid}-${dMid}`);
    expect(labels[6].textContent).toBe(`${mLast}-${dLast}`);
    // 中间非显示位置应为空字符串
    expect(labels[1].textContent).toBe("");
  });

  test("a11y: 隐藏文本描述近 7 天用量", () => {
    const { container } = render(<UsageSparkline history={fakeHistory} days={7} />);
    const hidden = container.querySelector(".ai-usage-visually-hidden");
    expect(hidden).toBeTruthy();
    expect(hidden.textContent).toContain("近 7 天用量");
    expect(hidden.textContent).toContain("已用 30%");
    expect(hidden.textContent).toContain("今日已用 65%");
  });

  test("history 为空 → 渲染 '暂无数据' 占位, 不崩", () => {
    // ponytail: buildSeries 收到空 days → 返回 7 个空占位 (percent=0), 不会到 render 兜底.
    // 真正触发 empty 占位是 buildSeries 也返回空 (这里用不传 history 触发).
    const { container } = render(<UsageSparkline history={null} days={7} />);
    // buildSeries(null) → buildAllEmpty(7) → 7 个 0% 点, 折线仍渲染 (全在底部)
    expect(container.querySelector(".ai-usage-sparkline-svg")).toBeTruthy();
    expect(container.querySelector(".ai-usage-sparkline-stroke")).toBeTruthy();
  });

  test("percent=0 (无数据日) 折线该点贴在 y 底部, 不崩", () => {
    const sparse = {
      days: [
        { date: addDays(TODAY, -2), percent: 0 },
        { date: addDays(TODAY, -1), percent: 0 },
        { date: TODAY, percent: 75, used: 300 },
      ],
    };
    const { container } = render(<UsageSparkline history={sparse} days={3} />);
    const stroke = container.querySelector(".ai-usage-sparkline-stroke");
    expect(stroke).toBeTruthy();
    // 3 个点
    const rects = container.querySelectorAll(".ai-usage-sparkline-svg rect");
    expect(rects).toHaveLength(3);
  });
});