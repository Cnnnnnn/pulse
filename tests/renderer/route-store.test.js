import { describe, it, expect, beforeEach } from "vitest";
import { currentRoute, navigateTo, ROUTES } from "../../src/renderer/route-store.js";

beforeEach(() => { currentRoute.value = "overview"; });

describe("route-store", () => {
  it("currentRoute 默认 overview", () => {
    expect(currentRoute.value).toBe("overview");
  });
  it("ROUTES 包含 5 个 view", () => {
    expect(ROUTES).toEqual(["overview", "library", "diagnostics", "insights", "settings"]);
  });
  it("navigateTo 切换路由", () => {
    navigateTo("library");
    expect(currentRoute.value).toBe("library");
  });
  it("navigateTo 非法路由不改变", () => {
    navigateTo("invalid-route-xyz");
    expect(currentRoute.value).toBe("overview");
  });
});
