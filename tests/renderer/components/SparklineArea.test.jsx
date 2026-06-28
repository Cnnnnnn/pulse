// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { SparklineArea } from "../../../src/renderer/components/SparklineArea.jsx";

describe("SparklineArea", () => {
  it("空 closes 数组 → null (不渲染)", () => {
    const { container } = render(<SparklineArea closes={[]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("1 个点 → null (单点不画 area)", () => {
    const { container } = render(<SparklineArea closes={[100]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("2 个点上涨: path 含 fill='url(#sa-grad-up)' + 闭合 'Z'", () => {
    const { container } = render(
      <SparklineArea closes={[80, 100]} upColor="#0f0" downColor="#f00" flatColor="#888" />,
    );
    const defs = container.querySelector("defs");
    expect(defs.querySelector("linearGradient#sa-grad-up")).not.toBeNull();
    const path = container.querySelector("path");
    expect(path.getAttribute("d")).toMatch(/Z$/);
    expect(path.getAttribute("fill")).toBe("url(#sa-grad-up)");
  });

  it("2 个点下跌: 用 sa-grad-down", () => {
    const { container } = render(
      <SparklineArea closes={[100, 80]} upColor="#0f0" downColor="#f00" flatColor="#888" />,
    );
    const path = container.querySelector("path");
    expect(path.getAttribute("fill")).toBe("url(#sa-grad-down)");
  });

  it("2 个点平: 用 sa-grad-flat", () => {
    const { container } = render(
      <SparklineArea closes={[100, 100]} upColor="#0f0" downColor="#f00" flatColor="#888" />,
    );
    const path = container.querySelector("path");
    expect(path.getAttribute("fill")).toBe("url(#sa-grad-flat)");
  });

  it("含 NaN → path 'd' 不含 'NaN'", () => {
    const { container } = render(<SparklineArea closes={[100, NaN, 200]} />);
    const path = container.querySelector("path");
    expect(path.getAttribute("d")).not.toMatch(/NaN/);
  });

  it("showEndpoints=true (默认): 起点 + 终点 circle 共 2 个", () => {
    const { container } = render(<SparklineArea closes={[80, 90, 100]} />);
    expect(container.querySelectorAll("circle").length).toBe(2);
  });

  it("showEndpoints=false: 无 circle", () => {
    const { container } = render(
      <SparklineArea closes={[80, 90, 100]} showEndpoints={false} />,
    );
    expect(container.querySelectorAll("circle").length).toBe(0);
  });

  it("viewBox 跟 width/height 一致", () => {
    const { container } = render(
      <SparklineArea closes={[80, 90]} width={200} height={50} />,
    );
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("viewBox")).toBe("0 0 200 50");
  });
});
