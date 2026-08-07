// @vitest-environment happy-dom
/**
 * tests/renderer/nav-drawer-item.test.tsx
 *
 * Phase 9 收尾重命名 — 原 tests/renderer/sidenav-item-badge.test.jsx (I6: SideNavItem badge).
 * 现在测的是 NavDrawerItem (SideNavItem 改名, 唯一使用者变成 NavDrawer).
 *
 * NavDrawerItem 的 badge prop 渲染:
 *   - badge=0 → 不渲染 badge 元素
 *   - badge>0 → 渲染 .nav-drawer-badge 数字胶囊 + aria-label
 *   - 不传 badge (默认 0) → 不渲染
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { NavDrawerItem } from "../../src/renderer/components/NavDrawerItem.tsx";

const baseItem = { key: "news", label: "新闻", tooltip: "x" };

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("NavDrawerItem — badge prop (I6)", () => {
  it("badge=0 → 不渲染 badge 元素", () => {
    render(<NavDrawerItem item={baseItem} badge={0} />);
    expect(document.body.querySelector(".nav-drawer-badge")).toBeNull();
  });

  it("badge=3 → 渲染数字 3 + aria-label 含 3", () => {
    render(<NavDrawerItem item={baseItem} badge={3} />);
    const badge = document.body.querySelector(".nav-drawer-badge");
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe("3");
    expect(badge.getAttribute("aria-label")).toContain("3");
  });

  it("不传 badge (默认 0) → 不渲染", () => {
    render(<NavDrawerItem item={baseItem} />);
    expect(document.body.querySelector(".nav-drawer-badge")).toBeNull();
  });
});
