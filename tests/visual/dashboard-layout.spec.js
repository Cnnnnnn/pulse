/**
 * Dashboard 小窗口布局回归：系统卡不能覆盖最近活动。
 *
 * 只注入 4 条最近活动，复现用户截图中的首页内容密度；不接 Electron，
 * 直接复用 visual-serve 提供的静态 renderer 页面。
 */
import { test, expect } from "@playwright/test";

test.use({
  viewport: { width: 1280, height: 720 },
});

test("small dashboard keeps recent activity below system tile", async ({ page }) => {
  await page.addInitScript(() => {
    const entries = [
      { kind: "fund-nav-fetch", title: "fund-nav-fetch", ts: Date.now() - 2 * 3600_000 },
      { kind: "fund-view", title: "fund-view", ts: Date.now() - 2 * 3600_000 },
      { kind: "app-check", title: "app-check", ts: Date.now() - 2 * 3600_000 },
      { kind: "fund-nav-fetch", title: "fund-nav-fetch", ts: Date.now() - 2 * 3600_000 },
    ];
    const stub = new Proxy({}, {
      get(_, key) {
        if (typeof key === "symbol") return undefined;
        if (key === "recentList") return async () => ({ ok: true, entries });
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
  await page.waitForSelector(".dashboard-recent-item", {
    state: "visible",
    timeout: 15_000,
  });

  const boxes = await page.evaluate(() => {
    const systemCard = [...document.querySelectorAll(".dashboard-tile-section")]
      .find((section) => section.textContent.includes("系统"))
      ?.querySelector(".dashboard-tile")
      ?.getBoundingClientRect();
    const recent = document.querySelector(".dashboard-recent")?.getBoundingClientRect();
    const title = document.querySelector(".dashboard-recent-title")?.getBoundingClientRect();
    return {
      systemBottom: systemCard?.bottom ?? null,
      recentTop: recent?.top ?? null,
      titleTop: title?.top ?? null,
    };
  });

  expect(boxes.systemBottom).not.toBeNull();
  expect(boxes.recentTop).not.toBeNull();
  expect(boxes.titleTop).not.toBeNull();
  expect(boxes.systemBottom).toBeLessThanOrEqual(boxes.recentTop);
  expect(boxes.systemBottom).toBeLessThanOrEqual(boxes.titleTop);
});
