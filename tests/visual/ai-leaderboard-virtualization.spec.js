import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 960, height: 643 } });

const leaderboard = {
  ok: true,
  items: Array.from({ length: 596 }, (_, index) => ({
    id: `model-${index}`,
    name: `Demo Model ${index + 1}`,
    vendor: "openai",
    category: "llm",
    license: "proprietary",
    aa: {
      codingIndex: 100 - index / 10,
      intelligenceIndex: 100 - index / 10,
      agenticIndex: 90,
      outputTokensPerSec: 100,
      priceOutputPer1M: 1,
      costPerTask: 1,
    },
    modelsdev: { contextLength: 128000, inputCostPer1M: 1 },
    openrouter: index < 5 ? {} : null,
    sources: {
      arena: "none",
      aa: "live",
      openrouter: index < 5 ? "live" : "none",
      livebench: "none",
      modelsdev: "live",
    },
    isSample: false,
  })),
  sources: { arena: "none", aa: "live", openrouter: "live", livebench: "none", modelsdev: "live" },
  sourceCoverage: { arena: 0, aa: 596, openrouter: 5, livebench: 0, modelsdev: 151, huggingface: 0 },
  attribution: [{ id: "artificial-analysis" }],
  stale: true,
  fromCache: false,
  fetchedAt: "2026-08-12T11:00:00.000Z",
  lastUpdated: "2026-08-12",
  count: 596,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((response) => {
    localStorage.clear();
    localStorage.setItem(
      "pulse.aiLeaderboard.prefs.v3",
      JSON.stringify({ view: "aa", dim: "coding", board: "text", lb: "lb_overall", vendor: "all", license: "all", sortDir: "desc" }),
    );

    const noop = () => {};
    const api = new Proxy(
      {
        getLastActiveNav: async () => ({ lastActiveNav: "ai-leaderboard" }),
        getConfig: async () => ({ apps: [], check_on_launch: false }),
        getCachedState: async () => ({}),
        getLeaderboard: async () => response,
        refreshLeaderboard: async () => response,
        rateBudget: async () => ({ used: 0, limit: 1000, remaining: 1000 }),
        releaseNotes: { getCurrent: async () => null, getVersion: async () => ({}), markSeen: async () => {} },
      },
      {
        get(target, key) {
          if (key in target) return target[key];
          if (typeof key === "string" && /^on[A-Z]/.test(key)) return noop;
          return async () => ({});
        },
      },
    );

    window.api = api;
    window.pulse = new Proxy({}, { get: () => async () => ({}) });
    window.metalsApi = new Proxy({}, { get: () => async () => ({}) });
    window.platformInfo = { platform: "darwin" };
  }, leaderboard);
});

test("AA 榜单在小逻辑视口下仍有可见的虚拟表格视口", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".ai-leaderboard-page");
  await page.waitForFunction(() => document.querySelectorAll(".ai-lb-table tbody tr").length > 0);

  const metrics = await page.locator(".ai-lb-table-wrap").evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    renderedRows: element.querySelectorAll("tbody tr").length,
  }));

  expect(metrics.renderedRows).toBeGreaterThan(0);
  expect(metrics.clientHeight).toBeGreaterThan(100);
  expect(await page.locator(".ai-lb-reading-rail").isVisible()).toBe(true);
  expect(await page.locator(".ai-lb-main .ai-lb-table-region").isVisible()).toBe(true);
  await page.screenshot({
    path: "test-results/ai-leaderboard-reading-rail-final.png",
    fullPage: false,
  });
});

test("AA 榜单在宽桌面视口下把表格作为主阅读区", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1286 });
  await page.goto("/");
  await page.waitForSelector(".ai-leaderboard-page");
  await page.waitForFunction(() => document.querySelectorAll(".ai-lb-table tbody tr").length > 0);

  const metrics = await page.locator(".ai-lb-table-wrap").evaluate((element) => ({
    clientHeight: element.clientHeight,
    renderedRows: element.querySelectorAll("tbody tr").length,
  }));

  expect(metrics.renderedRows).toBeGreaterThan(0);
  expect(metrics.clientHeight).toBeGreaterThan(300);
  await page.screenshot({
    path: "test-results/ai-leaderboard-reading-rail-desktop-final.png",
    fullPage: false,
  });

  await page.locator(".ai-lb-check").nth(0).check();
  await page.locator(".ai-lb-check").nth(1).check();
  await expect(page.locator(".ai-lb-rail__analysis-btn")).toBeEnabled();
  await page.locator(".ai-lb-rail__analysis-btn").click();
  await expect(page.locator(".ai-lb-analysis-panel")).toBeVisible();
  await page.locator(".ai-lb-analysis-panel__close").click();
  await expect(page.locator(".ai-lb-analysis-panel")).toBeHidden();
});
