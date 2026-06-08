/**
 * vitest 配置 — CommonJS 项目，跟现有 main.js / checker.js 保持一致。
 * detector / worker pool / integration 跑在 node 下；
 * renderer 组件测试用 happy-dom 隔离环境（在测试文件头部加
 * `// @vitest-environment happy-dom` 切换）。
 */
const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',     // 默认 node；renderer 组件测试显式切到 happy-dom
    include: ['tests/**/*.test.{js,jsx}'],
    testTimeout: 8000,       // 多数 detector 自身 timeout 就是 8s
    pool: 'forks',           // macOS 稳；windows 也兼容
    globals: false,          // 显式 import，避免 vitest 1.x 的隐式全局
    env: {
      // Phase B1: AI Sessions tests assume UTC for local-day arithmetic
      // (filterByLocalDay / _localDayStart). Default macOS / Linux tz
      // would make dayStart off by hours, breaking dateKey assumptions.
      TZ: 'UTC',
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
});
