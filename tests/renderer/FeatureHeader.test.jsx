// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { FeatureHeader } from "../../src/renderer/components/FeatureHeader.jsx";

describe("FeatureHeader", () => {
  it("默认 className 'feature-header', brand 在左", () => {
    const { container } = render(
      <FeatureHeader brand={<h2>世界杯 2026</h2>}>
        <button>refresh</button>
      </FeatureHeader>
    );
    const root = container.querySelector(".feature-header");
    expect(root).toBeTruthy();
    expect(screen.getByText("世界杯 2026")).toBeTruthy();
    expect(screen.getByText("refresh")).toBeTruthy();
    // brand 子节点包含 h2
    const brand = container.querySelector(".feature-header-brand");
    expect(brand?.querySelector("h2")?.textContent).toBe("世界杯 2026");
  });

  it("自定义 className 双 class 叠加, brand/controls 仍可被 feature 特有 CSS 命中", () => {
    const { container } = render(
      <FeatureHeader
        className="worldcup-header"
        brand={<h2 class="worldcup-header-title">世界杯 2026</h2>}
      >
        <input class="worldcup-search-input" placeholder="搜索" />
      </FeatureHeader>
    );
    // 双 class
    const root = container.querySelector(".feature-header.worldcup-header");
    expect(root).toBeTruthy();
    // feature 特有类仍生效
    expect(container.querySelector(".worldcup-header-title")).toBeTruthy();
    expect(container.querySelector(".worldcup-search-input")).toBeTruthy();
    // 双 class 也加在 brand/controls
    expect(container.querySelector(".feature-header-brand.worldcup-header-brand")).toBeTruthy();
    expect(container.querySelector(".feature-header-controls.worldcup-header-controls")).toBeTruthy();
  });

  it("无 children 时不渲染 controls 区", () => {
    const { container } = render(
      <FeatureHeader brand={<span>仅 brand</span>} />
    );
    expect(container.querySelector(".feature-header-brand")).toBeTruthy();
    expect(container.querySelector(".feature-header-controls")).toBeNull();
  });

  it("无 brand 时仍能渲染 controls", () => {
    const { container } = render(
      <FeatureHeader>
        <button>action</button>
      </FeatureHeader>
    );
    expect(container.querySelector(".feature-header-controls")).toBeTruthy();
    expect(screen.getByText("action")).toBeTruthy();
  });
});