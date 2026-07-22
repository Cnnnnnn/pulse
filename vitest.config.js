/**
 * vitest 配置 — CommonJS 项目，跟现有 main.js / checker.js 保持一致。
 * detector / worker pool / integration 跑在 node 下；
 * renderer 组件测试用 happy-dom 隔离环境（在测试文件头部加
 * `// @vitest-environment happy-dom` 切换）。
 */
const path = require("path");
const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    environment: "node", // 默认 node；renderer 组件测试显式切到 happy-dom
    include: ["tests/**/*.test.{js,jsx}", "tests/**/*.bench.{js,jsx}"],
    testTimeout: 8000, // 多数 detector 自身 timeout 就是 8s
    pool: "forks", // macOS 稳；windows 也兼容
    globals: false, // 显式 import，避免 vitest 1.x 的隐式全局
    env: {
      // Phase B1: AI Sessions tests assume UTC for local-day arithmetic
      // (filterByLocalDay / _localDayStart). Default macOS / Linux tz
      // would make dayStart off by hours, breaking dateKey assumptions.
      TZ: "UTC",
    },
    server: {
      deps: {
        // Phase B2: 让 vite 把 react-virtuoso 强制走预 bundle, 这样 resolve.alias 才能
        // 把它内部的 react / react-dom / react/jsx-runtime 重写到 preact/compat.
        // 否则 CJS bundle 里的 require('react') 走 Node resolver, 拿到真 react,
        // 产出的 forwardRef / memo 元素带 React $$typeof, preact 不识别, 渲染成 [object Object].
        inline: ["react-virtuoso"],
      },
    },
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  resolve: {
    alias: [
      // Phase v1: 允许 renderer 文件 import 主进程模块 (tray-menu-prefs.js 提供单一真相).
      // vitest 1.x 默认 fs.strict 阻止跨 src 目录, 这里放开.
      { find: /^@main\/(.*)$/, replacement: path.resolve(__dirname, "src/main") + "/$1" },
      // Phase B2: react-virtuoso 是 React 编写的库, 用 preact/compat 替身让其在 happy-dom 下渲染.
      // jsx-runtime 优先指向 preact/jsx-runtime (与 --jsx-import-source=preact 一致);
      // compat 是 React API 的兼容层, 提供 createElement / forwardRef / memo 等.
      { find: /^react\/jsx-runtime$/, replacement: path.resolve(__dirname, "node_modules/preact/jsx-runtime") },
      { find: /^react\/jsx-dev-runtime$/, replacement: path.resolve(__dirname, "node_modules/preact/jsx-runtime") },
      { find: /^react-dom$/, replacement: path.resolve(__dirname, "node_modules/preact/compat") },
      { find: /^react-dom\/client$/, replacement: path.resolve(__dirname, "node_modules/preact/compat/client") },
      { find: /^react$/, replacement: path.resolve(__dirname, "node_modules/preact/compat") },
    ],
  },
});
