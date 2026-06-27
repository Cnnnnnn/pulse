// @vitest-environment happy-dom
/**
 * tests/renderer/TrendSparkline.test.jsx
 *
 * Task 16: TrendSparkline — 纯函数 SVG 折线, 空数据返回空 <svg>.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { TrendSparkline } from "../../src/renderer/components/TrendSparkline.jsx";

describe("TrendSparkline", () => {
  it("渲染 svg with path", () => {
    const { container } = render(<TrendSparkline data={[1, 3, 2, 4, 5, 3, 6]} />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("svg path")).toBeTruthy();
  });
  it("空数据不渲染 path", () => {
    const { container } = render(<TrendSparkline data={[]} />);
    expect(container.querySelector("svg path")).toBeFalsy();
  });
});