/**
 * Playwright 视觉回归配置 — P3
 *
 * ponytail: Playwright 视觉回归仅跑静态 index.html + renderer-dist/*, 不接 Electron.
 * 静态 http server 由 scripts/visual-serve.cjs (零依赖 Node 实现) 提供.
 * 3 张基准图 (overview-light/dark + sidenav-collapsed-light) 锁定 P3 后 styles.css 漂移.
 *
 * 首次跑 baseline 用 `npm run test:visual:update`,
 * 之后 PR 跑 `npm run test:visual` 做对比.
 */
"use strict";
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/visual",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "off",
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  },
  webServer: {
    command: "node scripts/visual-serve.cjs",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 200,
      threshold: 0.2,
    },
  },
  timeout: 30_000,
});