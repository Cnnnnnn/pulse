/**
 * Playwright 视觉回归配置 — P3 创建, P4/P5 演进
 *
 * ponytail: 视觉回归跑静态 index.html + renderer-dist/*, 不接 Electron.
 * 静态 http server 由 scripts/visual-serve.cjs (零依赖 Node 实现) 提供.
 *
 * P5 演进:
 * - 8 张 baseline (overview-light/dark/win32, sidenav-collapsed-light,
 *   worldcup-light/dark, funds-light, wechat-hot-light)
 * - 默认每 PR 跑 (CI workflow)
 * - maxDiffPixels 500 + threshold 0.3 容忍跨平台 font subpixel 差异
 *   (baseline 由 dev 本机 mac 拍, ubuntu runner 跑会有抗锯齿漂移,
 *    真回归 dev 本机先 fail, CI 仅作"降级监控")
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
    // 跨平台稳定性: 关动画 + 隐藏光标 + 禁用 caret blink
    // 让 ubuntu↔mac 像素差异控制在 threshold 内
    launchOptions: {
      args: ["--disable-blink-features=AutomationControlled"],
    },
    contextOptions: {
      reducedMotion: "reduce",
    },
  },
  webServer: {
    command: "node scripts/visual-serve.cjs",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  expect: {
    toHaveScreenshot: {
      // P5: 放宽容忍, 跨 ubuntu↔mac 字体抗锯齿差异 (~500-800 像素)
      maxDiffPixels: 500,
      threshold: 0.3,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  timeout: 30_000,
});