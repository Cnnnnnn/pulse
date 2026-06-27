// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { Sparkline } from "../../../src/renderer/components/Sparkline.jsx";

describe("Sparkline", () => {
  it("空 closes 数组不渲染任何 svg", () => {
    const { container } = render(<Sparkline closes={[]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("1 个点渲染 1 个 circle, 无 polyline", () => {
    const { container } = render(<Sparkline closes={[100]} />);
    const svg = container.querySelector("svg.stock-sparkline");
    expect(svg).not.toBeNull();
    expect(svg.querySelectorAll("circle").length).toBe(1);
    expect(svg.querySelector("polyline")).toBeNull();
  });

  it("2 个点上涨: polyline 用 upColor", () => {
    const { container } = render(
      <Sparkline closes={[80, 100]} upColor="#34c759" downColor="#ff3b30" flatColor="#8e8e93" />,
    );
    const poly = container.querySelector("polyline");
    expect(poly).not.toBeNull();
    expect(poly.getAttribute("stroke")).toBe("#34c759");
  });

  it("2 个点下跌: polyline 用 downColor", () => {
    const { container } = render(
      <Sparkline closes={[100, 80]} upColor="#34c759" downColor="#ff3b30" flatColor="#8e8e93" />,
    );
    const poly = container.querySelector("polyline");
    expect(poly.getAttribute("stroke")).toBe("#ff3b30");
  });

  it("2 个点平: polyline 用 flatColor", () => {
    const { container } = render(
      <Sparkline closes={[100, 100]} upColor="#34c759" downColor="#ff3b30" flatColor="#8e8e93" />,
    );
    const poly = container.querySelector("polyline");
    expect(poly.getAttribute("stroke")).toBe("#8e8e93");
  });

  it("30 个点: polyline + 起点/终点 2 circle, viewBox 正确", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const { container } = render(<Sparkline closes={closes} width={100} height={30} />);
    const svg = container.querySelector("svg.stock-sparkline");
    expect(svg.getAttribute("viewBox")).toBe("0 0 100 30");
    expect(svg.getAttribute("width")).toBe("100");
    expect(svg.getAttribute("height")).toBe("30");
    expect(svg.querySelector("polyline")).not.toBeNull();
    expect(svg.querySelectorAll("circle").length).toBe(2);
  });
});