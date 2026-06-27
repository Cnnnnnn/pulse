// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/preact";

// mock 掉 CommandPalette 和 TopBar 避免拉真实 IPC
vi.mock("../../src/renderer/components/CommandPalette.jsx", () => ({
  CommandPalette: () => null,
}));

import { VersionsLayout } from "../../src/renderer/components/VersionsLayout.jsx";
import { navigateTo, currentRoute } from "../../src/renderer/route-store.js";

describe("VersionsLayout", () => {
  it("默认渲染 library 而非 overview", () => {
    navigateTo("library");
    const { container } = render(<VersionsLayout />);
    // library 页有 .library-page class; overview 已不存在
    expect(container.querySelector(".library-page")).toBeTruthy();
  });

  it("对 overview 重定向后仍渲染 library", () => {
    navigateTo("overview"); // 已被 route-store 重定向到 library
    const { container } = render(<VersionsLayout />);
    expect(container.querySelector(".library-page")).toBeTruthy();
  });

  it("不再有 overview 专属渲染分支 (即便强制设 overview 也走 library)", () => {
    // 即便绕过 navigateTo 重定向, 强行写 currentRoute="overview",
    // 也不应渲染 dashboard overview (overview-grid / kpi-wall 等) — 因为该分支已删.
    currentRoute.value = "overview";
    const { container } = render(<VersionsLayout />);
    expect(container.querySelector(".overview-grid")).toBeNull();
    expect(container.querySelector(".overview-kpi-wall")).toBeNull();
    // 恢复
    navigateTo("library");
  });
});

