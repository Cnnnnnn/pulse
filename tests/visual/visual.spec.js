/**
 * tests/visual/visual.spec.js — P3 视觉回归基线 (ESM)
 *
 * ponytail: 锁住 P3 之后 styles.css 的视觉漂移. 3 张基准图:
 *   1. overview-light  → AppShell 渲染后第一帧 (默认 activeNav = 'versions')
 *   2. overview-dark   → 同上, dark 主题
 *   3. sidenav-collapsed-light → 折叠 SideNav
 *
 * 不接 Electron: 静态 index.html + renderer-dist/*, 在 scripts/visual-serve.cjs 上.
 * window.api / pulse / metalsApi 全部 stub (避免 IPC invoke 卡 promise),
 * 让 AppShell 正常 boot 到 LibraryPage.
 *
 * 注意: tests/package.json 是 "type": "module", 这里必须 ESM 写法.
 */
import { test, expect } from "@playwright/test";

const stubIpc = `
  (function stubIpc() {
    const noop = () => {};
    const empty = async () => ({});
    const emptyArr = async () => [];

    const apiStub = new Proxy({}, {
      get(_, key) {
        if (typeof key === "symbol") return undefined;
        if (/^on[A-Z]/.test(key) || key.startsWith("subscribe")) return noop;
        return empty;
      },
    });

    const pulseStub = new Proxy({}, {
      get(_, key) {
        if (typeof key === "symbol") return undefined;
        if (/^on[A-Z]/.test(key) || key.startsWith("subscribe")) return noop;
        if (key === "getFunds" || key === "getAlerts") return emptyArr;
        if (key === "getSettings") return empty;
        return empty;
      },
    });

    const metalsStub = new Proxy({}, {
      get(_, key) {
        if (typeof key === "symbol") return undefined;
        if (/^on[A-Z]/.test(key) || key.startsWith("subscribe")) return noop;
        return empty;
      },
    });

    window.api = apiStub;
    window.pulse = pulseStub;
    window.metalsApi = metalsStub;
    window.platformInfo = { platform: "darwin" };
  })();
`;

test.beforeEach(async ({ context }) => {
  await context.addInitScript(stubIpc);
});

async function waitForShell(page) {
  await page.waitForSelector(".app-shell", {
    state: "visible",
    timeout: 15_000,
  });
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(500);
}

test("overview (Library page) — light theme baseline", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "light");
    } catch {}
  });
  await page.goto("/");
  await waitForShell(page);
  // ponytail: 用 page (而非 .app-shell) 截整页 — 覆盖 body 背景, 不漏 viewport 周围
  await expect(page).toHaveScreenshot("overview-light.png", {
    fullPage: false,
  });
});

test("overview (Library page) — dark theme baseline", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "dark");
    } catch {}
  });
  await page.goto("/");
  await waitForShell(page);
  await expect(page).toHaveScreenshot("overview-dark.png", { fullPage: false });
});

test("side nav collapsed — light theme baseline", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "light");
    } catch {}
  });
  await page.goto("/");
  await waitForShell(page);
  const toggle = page.locator(".side-nav-toggle").first();
  if (await toggle.count()) {
    await toggle.click();
    await page.waitForTimeout(300);
  }
  await expect(page).toHaveScreenshot("sidenav-collapsed-light.png", {
    fullPage: false,
  });
});

test("worldcup tab — light theme baseline (FeatureHeader 壳)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "light");
    } catch {}
  });
  await page.goto("/");
  await waitForShell(page);
  const worldcupNav = page.locator('li[data-nav="worldcup"]').first();
  if (await worldcupNav.count()) {
    await worldcupNav.click();
    await page.waitForTimeout(800);
  }
  await expect(page).toHaveScreenshot("worldcup-light.png", { fullPage: false });
});

test("funds tab — light theme baseline (FundHeader 5 张空 summary)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "light");
    } catch {}
  });
  await page.goto("/");
  await waitForShell(page);
  const fundsNav = page.locator('li[data-nav="funds"]').first();
  if (await fundsNav.count()) {
    await fundsNav.click();
    await page.waitForTimeout(800);
  }
  await expect(page).toHaveScreenshot("funds-light.png", { fullPage: false });
});

test("wechat-hot tab — light theme baseline (cooldown 倒计时 UI)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "light");
    } catch {}
    // stub Date.now 让 cooldown 倒计时稳定 (WechatHotHeader useNowTick(1000) 每秒刷)
    const fixed = new Date("2026-07-09T10:00:00Z").getTime();
    const _Date = window.Date;
    // eslint-disable-next-line no-global-assign
    window.Date = class extends _Date {
      constructor(...args) {
        if (args.length === 0) super(fixed);
        else super(...args);
      }
      static now() {
        return fixed;
      }
    };
  });
  await page.goto("/");
  await waitForShell(page);
  const wechatNav = page.locator('li[data-nav="wechat-hot"]').first();
  if (await wechatNav.count()) {
    await wechatNav.click();
    await page.waitForTimeout(800);
  }
  await expect(page).toHaveScreenshot("wechat-hot-light.png", { fullPage: false });
});
