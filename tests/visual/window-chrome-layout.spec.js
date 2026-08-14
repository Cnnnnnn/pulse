/**
 * macOS window chrome layout regression.
 * The native titlebar bridges into a horizontal toolbar without reserving a
 * second blank row above the dashboard.
 */
import { test, expect } from "@playwright/test";

test.use({
  viewport: { width: 1280, height: 720 },
});

test("macOS chrome bridges into the horizontal navigation toolbar", async ({ page }) => {
  await page.addInitScript(() => {
    const stub = new Proxy({}, {
      get(_, key) {
        if (typeof key === "symbol") return undefined;
        if (/^on[A-Z]/.test(key) || key.startsWith("subscribe")) return () => {};
        if (key === "getFunds" || key === "getAlerts") return async () => [];
        return async () => ({});
      },
    });
    window.api = stub;
    window.pulse = stub;
    window.metalsApi = stub;
    window.platformInfo = { platform: "darwin" };
    localStorage.setItem("app-theme-preference", "light");
  });

  await page.goto("/");
  await page.waitForSelector(".app-shell", {
    state: "visible",
    timeout: 15_000,
  });

  const metrics = await page.evaluate(() => {
    const app = document.querySelector("#app");
    const titlebar = document.querySelector("#titlebar");
    const rail = document.querySelector(".icon-rail");
    const home = document.querySelector(".icon-rail-btn");
    const sections = [...document.querySelectorAll(".icon-rail-section")];
    const hero = document.querySelector(".dashboard-hero");
    const railSurface = getComputedStyle(rail, "::before");
    const railStyle = getComputedStyle(rail);
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { top: box.top, width: box.width, height: box.height };
    };
    return {
      appPaddingTop: getComputedStyle(app).paddingTop,
      titlebar: rect(titlebar),
      rail: rect(rail),
      home: rect(home),
      hero: rect(hero),
      railBackground: railStyle.backgroundColor,
      railBorderRight: railStyle.borderRightWidth,
      railSurfaceDisplay: railSurface.display,
      railFlexDirection: railStyle.flexDirection,
      railBorderBottom: railStyle.borderBottomWidth,
      sectionLefts: sections.map((section) => section.getBoundingClientRect().left),
      hasVersionsSubtabs: Boolean(document.querySelector(".versions-subtabs")),
    };
  });

  expect(metrics.appPaddingTop).toBe("0px");
  expect(metrics.rail?.top).toBe(0);
  expect(metrics.home?.top).toBeGreaterThanOrEqual(metrics.titlebar?.height ?? 0);
  expect((metrics.hero?.top ?? 0) - (metrics.rail?.height ?? 0)).toBeGreaterThanOrEqual(0);
  expect((metrics.hero?.top ?? 0) - (metrics.rail?.height ?? 0)).toBeLessThanOrEqual(32);
  expect(metrics.rail?.width).toBeGreaterThanOrEqual(1200);
  expect(metrics.railFlexDirection).toBe("row");
  expect(metrics.railBorderBottom).toBe("1px");
  expect(metrics.railBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(metrics.railBorderRight).toBe("0px");
  expect(metrics.railSurfaceDisplay).toBe("none");
  expect(metrics.sectionLefts[1]).toBeGreaterThan(metrics.sectionLefts[0]);
  expect(metrics.sectionLefts[2]).toBeGreaterThan(metrics.sectionLefts[1]);
  expect(metrics.hasVersionsSubtabs).toBe(false);

  await page.locator(".icon-rail-section").first().hover({ force: true });
  await page.waitForTimeout(180);
  const drawerPosition = await page.locator(".nav-drawer").evaluate((drawer) => ({
    top: Number.parseFloat(getComputedStyle(drawer).top),
    left: getComputedStyle(drawer).left,
  }));
  expect(drawerPosition.top).toBeGreaterThanOrEqual(metrics.rail?.height ?? 0);
  expect(drawerPosition.left).toBe("24px");

  await page.locator('[data-section="system"]').hover({ force: true });
  await page.waitForTimeout(180);
  const systemItems = page.locator('.nav-drawer[data-section="system"] .nav-drawer-item');
  await expect(systemItems).toHaveCount(3);
  await expect(systemItems.nth(0)).toHaveAttribute("data-nav", "library");
  await expect(systemItems.nth(1)).toHaveAttribute("data-nav", "diagnostics");
  await expect(systemItems.nth(2)).toHaveAttribute("data-nav", "settings");
});
