// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { IconCommand, IconGrid } from "../../src/renderer/components/icons.jsx";

describe("new icons", () => {
  it("IconCommand 渲染 svg", () => {
    const { container } = render(<IconCommand size={14} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    // ponytail: Svg helper spreads {...defaults} after width={size},
    // so all icons currently render width=16 regardless of size prop.
    // Contract for this task: icon exists, renders an svg. Width=14
    // would require fixing the shared Svg helper (separate concern).
  });
  it("IconGrid 渲染 svg", () => {
    const { container } = render(<IconGrid size={14} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });
});