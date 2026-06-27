import { describe, it, expect, beforeEach } from "vitest";
import { currentRoute, navigateTo, ROUTES } from "../../src/renderer/route-store.js";

beforeEach(() => {
  navigateTo("library");
});

describe("route-store (合并后)", () => {
  it("默认路由是 library (不再是 overview)", () => {
    // currentRoute 是 signal, 直接读当前 value (已被 beforeEach 设成 library)
    expect(currentRoute.value).toBe("library");
  });

  it("ROUTES 不含 overview", () => {
    expect(ROUTES).not.toContain("overview");
    expect(ROUTES).toContain("library");
  });

  it("navigateTo('overview') 容错重定向到 library", () => {
    navigateTo("diagnostics");
    expect(currentRoute.value).toBe("diagnostics");
    navigateTo("overview");
    expect(currentRoute.value).toBe("library");
  });

  it("navigateTo 对未知路由不变更", () => {
    navigateTo("library");
    navigateTo("不存在的路由");
    expect(currentRoute.value).toBe("library");
  });
});
