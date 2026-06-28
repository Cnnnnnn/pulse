// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { CandlestickChart } from "../../../src/renderer/components/CandlestickChart";

const sampleKlines = [
  { date: "2026-05-01", open: 100, high: 102, low: 99, close: 101, volume: 1e9, amplitude: 3 },
  { date: "2026-05-02", open: 101, high: 103, low: 100, close: 102, volume: 1.1e9, amplitude: 2.9 },
  { date: "2026-05-03", open: 102, high: 102, low: 99, close: 99, volume: 1.2e9, amplitude: 2.95 },
  { date: "2026-05-04", open: 99, high: 100, low: 97, close: 97.5, volume: 1.3e9, amplitude: 3.05 },
  { date: "2026-05-05", open: 97.5, high: 99, low: 96, close: 98, volume: 1.1e9, amplitude: 3.1 },
  // 30 根 (重复 5 天模型)
];

// 复制扩展到 30 根
const fullKlines = Array.from({ length: 30 }, (_, i) => {
  const t = sampleKlines[i % sampleKlines.length];
  return { ...t, date: `2026-05-${String(i + 1).padStart(2, "0")}` };
});
const fullCloses = fullKlines.map((k) => k.close);

describe("CandlestickChart", () => {
  it("空 klines → 渲染空状态占位", () => {
    const { container } = render(<CandlestickChart klines={[]} closes={[]} />);
    expect(container.querySelector("svg")).toBeTruthy();
    // 没有 kline rect
    expect(container.querySelectorAll("rect.stock-candle").length).toBe(0);
  });

  it("30 根 → 渲染 30 根 candle rect + MA 折线 + volume bar", () => {
    const { container } = render(<CandlestickChart klines={fullKlines} closes={fullCloses} />);
    expect(container.querySelectorAll("rect.stock-candle").length).toBe(30);
    // MA5/MA10/MA20 三条折线 polyline
    expect(container.querySelectorAll("polyline.stock-candle-ma").length).toBe(3);
    // volume bar
    expect(container.querySelectorAll("rect.stock-candle-volume").length).toBeGreaterThan(0);
  });

  it("上涨日 candle 用 up 色, 下跌日用 down 色", () => {
    const { container } = render(<CandlestickChart klines={fullKlines} closes={fullCloses} />);
    const upCandles = container.querySelectorAll("rect.stock-candle-up").length;
    const downCandles = container.querySelectorAll("rect.stock-candle-down").length;
    expect(upCandles + downCandles).toBe(30);
    expect(upCandles).toBeGreaterThan(0);
    expect(downCandles).toBeGreaterThan(0);
  });

  it("A 股惯例: 红涨绿跌 (CSS 变量 --stock-up / --stock-down 决定, 组件不写死颜色)", () => {
    const { container } = render(<CandlestickChart klines={fullKlines} closes={fullCloses} />);
    const up = container.querySelector("rect.stock-candle-up");
    expect(up).toBeTruthy();
    // 组件本身不设置 fill (CSS 控色)
    expect(up.getAttribute("fill")).toBeNull();
  });

  it("showMacd=true 时渲染 MACD 子图, showMacd=false 时不渲染", () => {
    const withMacd = render(<CandlestickChart klines={fullKlines} closes={fullCloses} showMacd={true} />);
    expect(withMacd.container.querySelector("g.stock-candle-macd")).toBeTruthy();
    withMacd.unmount();
    const noMacd = render(<CandlestickChart klines={fullKlines} closes={fullCloses} showMacd={false} />);
    expect(noMacd.container.querySelector("g.stock-candle-macd")).toBeNull();
  });

  it("a11y: svg 带 role=img + aria-label 描述", () => {
    const { container } = render(<CandlestickChart klines={fullKlines} closes={fullCloses} />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toMatch(/K线|蜡烛|MA/);
  });

  it("title + desc 子元素存在", () => {
    const { container } = render(<CandlestickChart klines={fullKlines} closes={fullCloses} />);
    expect(container.querySelector("svg title")).toBeTruthy();
    expect(container.querySelector("svg desc")).toBeTruthy();
  });

  it("30 根时 width 默认 680", () => {
    const { container } = render(<CandlestickChart klines={fullKlines} closes={fullCloses} />);
    expect(container.querySelector("svg").getAttribute("width")).toBe("680");
  });
});
