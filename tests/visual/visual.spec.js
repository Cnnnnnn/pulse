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

test("worldcup tab — light theme baseline (FeatureHeader 壳)", async ({
  page,
}) => {
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
  await expect(page).toHaveScreenshot("worldcup-light.png", {
    fullPage: false,
  });
});

test("funds tab — light theme baseline (FundHeader 5 张空 summary)", async ({
  page,
}) => {
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

test("wechat-hot tab — light theme baseline (cooldown 倒计时 UI)", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "light");
    } catch {}
    // stub Date.now 让 cooldown 倒计时稳定 (WechatHotHeader useNowTick(1000) 每秒刷)
    const fixed = new Date("2026-07-09T10:00:00Z").getTime();
    const _Date = window.Date;
     
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
  await expect(page).toHaveScreenshot("wechat-hot-light.png", {
    fullPage: false,
  });
});

test("worldcup tab — dark theme baseline (跨主题 OKLCH 一致性)", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "dark");
    } catch {}
  });
  await page.goto("/");
  await waitForShell(page);
  const worldcupNav = page.locator('li[data-nav="worldcup"]').first();
  if (await worldcupNav.count()) {
    await worldcupNav.click();
    await page.waitForTimeout(800);
  }
  await expect(page).toHaveScreenshot("worldcup-dark.png", { fullPage: false });
});

test("overview (Library page) — win32 platform baseline (浅底 accent 验证)", async ({
  page,
}) => {
  // ponytail: 切平台 stub 到 win32, 触发 body.platform-win CSS 分支
  // (--accent-primary 浅蓝, 字体走 --font-windows, 字号全局 +1px).
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "light");
      window.platformInfo = { platform: "win32" };
    } catch {}
  });
  await page.goto("/");
  // 等 addInitScript 注入 + body class 切换
  await page.waitForSelector(".app-shell", {
    state: "visible",
    timeout: 15_000,
  });
  await page.evaluate(() => {
    document.body.classList.add("platform-win");
  });
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot("overview-win32.png", {
    fullPage: false,
  });
});

test("settings page — P13 4-section 卡片化 baseline", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "light");
      // P13: recent/reminders 都给空数组 (与 stubIpc 默认行为一致, 但显式给空 entries
      // 让 SettingsPage 渲染空态而不是 "暂无最近活动" 默认 fallback).
      const orig = window.api;
      const patched = new Proxy(orig || {}, {
        get(_, key) {
          if (key === "recentList" || key === "remindersList") {
            return async () => ({ ok: true, entries: [], reminders: [] });
          }
          return orig && orig[key];
        },
      });
      window.api = patched;
    } catch {}
  });
  await page.goto("/");
  await waitForShell(page);
  // 切到 settings subtab
  await page
    .locator(".versions-subtab")
    .filter({ hasText: "设置" })
    .first()
    .click();
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot("settings-light.png", {
    fullPage: false,
  });
});

test("settings page — P15 AI 配置 tab baseline", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "light");
      const orig = window.api;
      const patched = new Proxy(orig || {}, {
        get(_, key) {
          if (key === "recentList" || key === "remindersList") {
            return async () => ({ ok: true, entries: [], reminders: [] });
          }
          return orig && orig[key];
        },
      });
      window.api = patched;
    } catch {}
  });
  await page.goto("/");
  await waitForShell(page);
  // 切到 settings subtab → AI 配置 subtab
  await page
    .locator(".versions-subtab")
    .filter({ hasText: "设置" })
    .first()
    .click();
  await page.waitForTimeout(200);
  await page
    .locator(".settings-subtab")
    .filter({ hasText: "AI 配置" })
    .first()
    .click();
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot("settings-ai-light.png", {
    fullPage: false,
  });
});

/* ───────────────────────────────────────────────────────────
   AI Coding 用量 dashboard — 浅/暗双主题 baseline
   (UsageDashboard 接入 UsageTrendChart + 主站系统迁移后)

   ponytail: visual-serve 不接 main 进程, snapshot 永远 null.
   必须 patch api.onAiUsageUpdated 在订阅时立刻 push fixture, 让
   aiUsageSnapshot signal 拿到完整 usageSummary, 这样 UsageDashboard 才会渲染.
   ─────────────────────────────────────────────────────────── */

const AI_USAGE_FIXTURE_SNAPSHOT = {
  fetchedAt: Date.parse("2026-07-10T12:00:00Z"),
  endpoint: "https://api.minimaxi.com/v1/usage",
  windows: {
    "5h": {
      used: 120_000, total: 1_000_000, usedPercent: 12, remaining: 880_000,
      resetAt: Date.parse("2026-07-10T14:00:00Z"), resetInSec: 7200,
      label: "5 小时滚动窗口", modelName: "general", status: 1,
      startTime: Date.parse("2026-07-10T12:00:00Z"), endTime: Date.parse("2026-07-10T14:00:00Z"),
    },
    weekly: {
      used: 4_500_000, total: 10_000_000, usedPercent: 45, remaining: 5_500_000,
      resetAt: Date.parse("2026-07-15T00:00:00Z"), resetInSec: 4 * 86400,
      label: "周窗口", modelName: "general", status: 1,
      startTime: Date.parse("2026-07-08T00:00:00Z"), endTime: Date.parse("2026-07-15T00:00:00Z"),
    },
    video: {
      used: 0, total: 3, usedPercent: 0, remaining: 3,
      resetAt: Date.parse("2026-07-11T00:00:00Z"), resetInSec: 86400,
      label: "视频赠送", modelName: "video", status: 1,
    },
    videoWeekly: {
      used: 0, total: 21, usedPercent: 0, remaining: 21,
      resetAt: Date.parse("2026-07-15T00:00:00Z"), resetInSec: 4 * 86400,
      label: "视频周额度", modelName: "video", status: 1,
    },
  },
  credits: { used: 0, total: 5000, remaining: 5000, label: "积分" },
  weeklyBoostPermille: 1500,
  usageSummary: {
    totalDays: 90,
    totalTokenConsumed: 7_450_000_000,
    usageRankingPercent: 1,
    activeDays: 90,
    currentConsecutiveDays: 90,
    lastUpdateTime: "07-10 12:00",
    mostActiveDay: {
      date: "2026-06-07",
      tokenCount: 452_780_000,
      imageCount: 0,
      videoCount: 0,
      musicCount: 0,
      voiceCharacterCount: 0,
    },
    dailyTokenUsage: Array.from({ length: 90 }, (_, i) => 10_000_000 + i * 1_000_000),
    dateModelUsage: [
      { date: "2026-07-10", models: [
        { model: "MiniMax-M3-512k", totalToken: 879_600_096, cacheHitPercent: 96.33 },
        { model: "MiniMax-M2.7", totalToken: 6_787_710, cacheHitPercent: 67.13 },
      ], totals: { totalToken: 886_387_806 } },
    ],
    modelBreakdown: [
      { model: "MiniMax-M3-512k", totalToken: 879_600_096, sharePercent: 99.2 },
      { model: "MiniMax-M2.7", totalToken: 6_787_710, sharePercent: 0.8 },
    ],
    grandTotal: 886_387_806,
    recent7Avg: 123_456_789,
    recent30Avg: 87_654_321,
  },
};

const AI_USAGE_FIXTURE_HISTORY = {
  days: Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { date: iso, percent: 12 + i * 5, used: 5_000 + i * 1_200 };
  }),
};

const pushAiUsageFixture = `
  (function pushAiUsageFixture() {
    if (typeof window.api === 'undefined') return;
    // ponytail: Proxy 的 get trap 永远返 empty — 直接 set 不影响下次 get.
    // 解决方案: 用 Object.assign 包一层, get 先查 explicit overrides 再 fallback 到 proxy.
    const origApi = window.api;
    const overrides = {};
    overrides.onAiUsageUpdated = function (cb) {
      window.__aiUsageSubscribed = (window.__aiUsageSubscribed || 0) + 1;
      // 推迟 100ms (等 AIUsageLayout mount + useEffect 跑完)
      setTimeout(function () {
        if (typeof cb === 'function') {
          window.__aiUsagePushed = (window.__aiUsagePushed || 0) + 1;
          try {
            cb({ provider: 'minimax', snapshot: ${JSON.stringify(AI_USAGE_FIXTURE_SNAPSHOT)}, history: ${JSON.stringify(AI_USAGE_FIXTURE_HISTORY)} });
          } catch (e) {
            window.__pushError = e.message;
          }
        }
      }, 100);
    };
    window.api = new Proxy(origApi, {
      get(target, key) {
        if (key in overrides) return overrides[key];
        return target[key];
      },
      set(target, key, value) {
        overrides[key] = value;
        return true;
      },
    });
  })();
`;

test("ai-usage tab — light theme baseline (UsageDashboard + UsageTrendChart)", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "light");
    } catch {}
  });
  await page.addInitScript(pushAiUsageFixture);
  await page.goto("/");
  await waitForShell(page);
  const aiTile = page.locator('[aria-label*="AI 用量"]').first();
  if (await aiTile.count()) {
    await aiTile.click();
  }
  await page.waitForSelector(".ai-usage-dashboard", { timeout: 15_000 });
  // 等 SVG path + brush + tooltip 状态稳定
  await page.waitForTimeout(1200);
  await expect(page).toHaveScreenshot("ai-usage-tab-light.png", {
    fullPage: false,
  });
});

test("ai-usage tab — dark theme baseline (跟随主站 data-theme=dark)", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "dark");
    } catch {}
  });
  await page.addInitScript(pushAiUsageFixture);
  await page.goto("/");
  await waitForShell(page);
  const aiTile = page.locator('[aria-label*="AI 用量"]').first();
  if (await aiTile.count()) {
    await aiTile.click();
  }
  await page.waitForSelector(".ai-usage-dashboard", { timeout: 15_000 });
  await page.waitForTimeout(1200);
  await expect(page).toHaveScreenshot("ai-usage-tab-dark.png", {
    fullPage: false,
  });
});

/* ───────────────────────────────────────────────────────────
   AI Coding 用量 dashboard — Fallback (公开 API only, 401 fallback)

   真实运行时 minimax usage_summary 端点对订阅 key 返回 401. dashboard
   应该用 windows 数据填充概览 KPI, 顶部 banner 说明数据边界, 趋势/分析/
   明细区缺数据不渲染. 验证浅/暗双主题下视觉无破绽.
   ─────────────────────────────────────────────────────────── */

const AI_USAGE_FALLBACK_FIXTURE = {
  fetchedAt: Date.parse("2026-07-10T12:00:00Z"),
  endpoint: "https://www.minimaxi.com/backend/account/token_plan/remains_percent",
  windows: {
    "5h": {
      used: 120_000, total: 1_000_000, usedPercent: 12, remaining: 880_000,
      resetAt: Date.parse("2026-07-10T14:00:00Z"), resetInSec: 7200,
      label: "5 小时滚动窗口", modelName: "general", status: 1,
    },
    weekly: {
      used: 4_500_000, total: 10_000_000, usedPercent: 45, remaining: 5_500_000,
      resetAt: Date.parse("2026-07-15T00:00:00Z"), resetInSec: 4 * 86400,
      label: "周窗口", modelName: "general", status: 1,
    },
    video: {
      used: 0, total: 3, usedPercent: 0, remaining: 3,
      resetAt: Date.parse("2026-07-11T00:00:00Z"), resetInSec: 86400,
      label: "视频赠送", modelName: "video", status: 1,
    },
    videoWeekly: {
      used: 0, total: 21, usedPercent: 0, remaining: 21,
      resetAt: Date.parse("2026-07-15T00:00:00Z"), resetInSec: 4 * 86400,
      label: "视频周额度", modelName: "video", status: 1,
    },
  },
  credits: { used: 0, total: 5000, remaining: 5000, label: "积分" },
  weeklyBoostPermille: 1500,
  // 关键: 故意不带 usageSummary, 触发 fallback (banner + 概览 KPI)
};

const pushAiUsageFallbackFixture = `
  (function pushAiUsageFallbackFixture() {
    if (typeof window.api === 'undefined') return;
    const origApi = window.api;
    const overrides = {};
    overrides.onAiUsageUpdated = function (cb) {
      window.__aiUsageSubscribed = (window.__aiUsageSubscribed || 0) + 1;
      setTimeout(function () {
        if (typeof cb === 'function') {
          window.__aiUsagePushed = (window.__aiUsagePushed || 0) + 1;
          cb({ provider: 'minimax', snapshot: ${JSON.stringify(AI_USAGE_FALLBACK_FIXTURE)}, history: { days: [] } });
        }
      }, 100);
    };
    window.api = new Proxy(origApi, {
      get(target, key) {
        if (key in overrides) return overrides[key];
        return target[key];
      },
      set(target, key, value) {
        overrides[key] = value;
        return true;
      },
    });
  })();
`;

test("ai-usage tab — fallback (公开 API only) light baseline", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "light");
    } catch {}
  });
  await page.addInitScript(pushAiUsageFallbackFixture);
  await page.goto("/");
  await waitForShell(page);
  const aiTile = page.locator('[aria-label*="AI 用量"]').first();
  if (await aiTile.count()) {
    await aiTile.click();
  }
  await page.waitForSelector(".ai-usage-dashboard-banner", { timeout: 15_000 });
  await page.waitForTimeout(1000);
  await expect(page).toHaveScreenshot("ai-usage-tab-fallback-light.png", {
    fullPage: false,
  });
});

test("ai-usage tab — fallback (公开 API only) dark baseline", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "dark");
    } catch {}
  });
  await page.addInitScript(pushAiUsageFallbackFixture);
  await page.goto("/");
  await waitForShell(page);
  const aiTile = page.locator('[aria-label*="AI 用量"]').first();
  if (await aiTile.count()) {
    await aiTile.click();
  }
  await page.waitForSelector(".ai-usage-dashboard-banner", { timeout: 15_000 });
  await page.waitForTimeout(1000);
  await expect(page).toHaveScreenshot("ai-usage-tab-fallback-dark.png", {
    fullPage: false,
  });
});

/* ───────────────────────────────────────────────────────────
   AI Coding 用量 dashboard — GLM provider (z.ai 新 UI)

   z.ai /api/monitor/usage/quota/limit 响应驱动: 5h token + 周 token +
   月度 MCP 调用 (TIME_LIMIT) + usageDetails 工具细分 + level 套餐档位.
   验证 GLM 走新 UI dashboard + 套餐 badge + 工具细分列表.
   ─────────────────────────────────────────────────────────── */

const AI_USAGE_GLM_FIXTURE = {
  provider: "glm",
  fetchedAt: Date.parse("2026-07-10T12:00:00Z"),
  endpoint: "https://api.z.ai/api/monitor/usage/quota/limit",
  level: "pro",
  windows: {
    "5h": {
      used: 127_694_464, total: 800_000_000, usedPercent: 15, remaining: 672_305_536,
      resetAt: Date.parse("2026-07-10T15:00:00Z"), resetInSec: 10800,
      label: "5 小时滚动窗口", modelName: null, status: null,
    },
    weekly: {
      used: 890_000_000, total: 5_600_000_000, usedPercent: 16, remaining: 4_710_000_000,
      resetAt: Date.parse("2026-07-15T00:00:00Z"), resetInSec: 4 * 86400,
      label: "周窗口", modelName: null, status: null,
    },
    mcp: {
      used: 1828, total: 4000, usedPercent: 46, remaining: 2172,
      resetAt: null, resetInSec: null,
      label: "MCP 时长", modelName: null, status: null,
    },
  },
  toolUsageDetails: [
    { modelCode: "search-prime", usage: 1433 },
    { modelCode: "web-reader", usage: 462 },
    { modelCode: "zread", usage: 0 },
  ],
};

const pushAiUsageGlmFixture = `
  (function pushAiUsageGlmFixture() {
    if (typeof window.api === 'undefined') return;
    const origApi = window.api;
    const overrides = {};
    overrides.onAiUsageUpdated = function (cb) {
      setTimeout(function () {
        if (typeof cb === 'function') {
          cb({ provider: 'glm', snapshot: ${JSON.stringify(AI_USAGE_GLM_FIXTURE)}, history: { days: [] } });
        }
      }, 100);
    };
    window.api = new Proxy(origApi, {
      get(target, key) {
        if (key in overrides) return overrides[key];
        return target[key];
      },
      set(target, key, value) {
        overrides[key] = value;
        return true;
      },
    });
  })();
`;

test("ai-usage tab — GLM (z.ai) light baseline", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "light");
    } catch {}
  });
  await page.addInitScript(pushAiUsageGlmFixture);
  await page.goto("/");
  await waitForShell(page);
  const aiTile = page.locator('[aria-label*="AI 用量"]').first();
  if (await aiTile.count()) {
    await aiTile.click();
  }
  // 切到 GLM tab (默认 minimax, GLM 数据不会渲染)
  await page.waitForSelector(".ai-usage-tab", { timeout: 5_000 });
  const glmTab = page.locator(".ai-usage-tab", { hasText: "GLM" }).first();
  await glmTab.click();
  // ponytail: 等 plan-badge 出现 (dashboard 跟着), 不等 .ai-usage-dashboard 单独 — 切 tab 时
  // Preact 可能短暂 unmount, visible 检测会重置计时
  await page.waitForSelector(".ai-usage-plan-badge", { timeout: 15_000 });
  await page.waitForTimeout(1000);
  await expect(page).toHaveScreenshot("ai-usage-tab-glm-light.png", {
    fullPage: false,
  });
});

test("ai-usage tab — GLM (z.ai) dark baseline", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "dark");
    } catch {}
  });
  await page.addInitScript(pushAiUsageGlmFixture);
  await page.goto("/");
  await waitForShell(page);
  const aiTile = page.locator('[aria-label*="AI 用量"]').first();
  if (await aiTile.count()) {
    await aiTile.click();
  }
  await page.waitForSelector(".ai-usage-tab", { timeout: 5_000 });
  const glmTab = page.locator(".ai-usage-tab", { hasText: "GLM" }).first();
  await glmTab.click();
  await page.waitForSelector(".ai-usage-plan-badge", { timeout: 15_000 });
  await page.waitForTimeout(1000);
  await expect(page).toHaveScreenshot("ai-usage-tab-glm-dark.png", {
    fullPage: false,
  });
});
