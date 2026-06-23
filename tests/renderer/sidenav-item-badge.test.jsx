// @vitest-environment happy-dom
/**
 * tests/renderer/sidenav-item-badge.test.jsx
 *
 * I6: SideNavItem 的 badge prop 渲染.
 * badge=0 不渲染; badge>0 渲染数字胶囊 + aria-label.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { SideNavItem } from "../../src/renderer/components/SideNavItem.jsx";

const baseItem = { key: "ithome", icon: "📰", label: "IT 新闻", tooltip: "x" };

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("SideNavItem — badge prop (I6)", () => {
  it("badge=0 → 不渲染 badge 元素", () => {
    render(<SideNavItem item={baseItem} badge={0} />);
    expect(document.body.querySelector(".side-nav-badge")).toBeNull();
  });

  it("badge=3 → 渲染数字 3 + aria-label 含 3", () => {
    render(<SideNavItem item={baseItem} badge={3} />);
    const badge = document.body.querySelector(".side-nav-badge");
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe("3");
    expect(badge.getAttribute("aria-label")).toContain("3");
  });

  it("不传 badge (默认 0) → 不渲染", () => {
    render(<SideNavItem item={baseItem} />);
    expect(document.body.querySelector(".side-nav-badge")).toBeNull();
  });
});
