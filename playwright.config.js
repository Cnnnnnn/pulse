/**
 * Playwright 视觉回归配置 — P3 创建, P4/P5 演进
 *
 * ponytail: 视觉回归跑静态 index.html + renderer-dist/*, 不接 Electron.
 * 静态 http server 由 scripts/visual-serve.cjs (零依赖 Node 实现) 提供.
 *
 * P5 演进:
 * - 7 张 baseline (overview-light/dark/win32, sidenav-collapsed-light,
 *   funds-light, wechat-hot-light, ai-usage-tab 系列)
 * - baseline 只在 macOS 跑：由 dev 本机人工审阅，避免 Ubuntu 字体渲染把
 *   平台差异误报为 UI 回归；CI 仍执行不依赖截图的结构化视觉规范。
 *
 * 首次跑 baseline 用 `npm run test:visual:update`,
 * 之后 PR 跑 `npm run test:visual` 做对比.
 */
"use strict";
const { defineConfig } = require("@playwright/test");
const visualPort = Number(process.env.PULSE_VISUAL_PORT || 4173);

module.exports = defineConfig({
  testDir: "./tests/visual",
  // visual.spec 在 Phase 6 从 .js 更名为 .ts，但历史基线仍是人工审阅的
  // visual.spec.js-snapshots/*-darwin.png。显式保留该位置，避免文件名迁移
  // 让 Playwright 把全部已存在基线误判成缺失。
  snapshotPathTemplate: "{testDir}/{testFileBaseName}.js-snapshots/{arg}{-snapshotSuffix}{ext}",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${visualPort}`,
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
    command: `PORT=${visualPort} node scripts/visual-serve.cjs`,
    port: visualPort,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  expect: {
    toHaveScreenshot: {
      // 同一 macOS 基线的小范围字体抗锯齿差异。
      maxDiffPixels: 500,
      threshold: 0.3,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  timeout: 30_000,
});
