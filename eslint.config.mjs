/**
 * ESLint 9 flat config
 *
 * 分 4 个 scope：
 *   - 全局忽略（node_modules / renderer-dist / 隐藏目录）
 *   - src 下所有 CJS .js（main + detectors + ai + funds 等，Node globals）
 *   - src/renderer（ESM + JSX + Preact hooks，TS parser）
 *   - tests（宽松，vitest globals）
 *
 * 策略：warn 为主，CI 不阻断（--max-warnings=9999）。
 * 让开发者看到问题但不卡构建；逐步清理历史 warning。
 */
import js from "@eslint/js";
import tseslintParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  // ── 全局忽略 ──
  {
    ignores: [
      "node_modules/",
      "renderer-dist/",
      ".worktrees/",
      ".cursor/",
      ".superpowers/",
      ".zcode/",
      ".omm/",
      ".workbuddy/",
      ".codegraph/",
      "deliverables/",
      "docs/",
    ],
  },

  // ── 基线：JS 推荐规则 ──
  js.configs.recommended,

  // ── src 下所有 CJS .js（main + detectors + ai + funds + stocks 等）──
  // 不含 src/renderer（ESM + JSX，单独处理）
  {
    files: [
      "src/main/**/*.js",
      "src/ai/**/*.js",
      "src/ai-sessions/**/*.js",
      "src/ai-usage/**/*.js",
      "src/config/**/*.js",
      "src/detectors/**/*.js",
      "src/funds/**/*.js",
      "src/metals/**/*.js",
      "src/platform/**/*.js",
      "src/release-notes/**/*.js",
      "src/stocks/**/*.js",
      "src/utils/**/*.js",
      "src/workers/**/*.js",
      "preload.ts",
      "scripts/**/*.js",
      "scripts/**/*.cjs",
      "playwright.config.js",
      "vitest.config.js",
      "build/**/*.cjs",
      "tests/main/**/*.cjs",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      parser: tseslintParser,
      globals: {
        ...globals.node,
        ...globals.browser, // 少数文件被 renderer import（pnlCsv.js 用 document），Electron 环境两者都有
      },
    },
    rules: {
      "no-console": "off",
      "global-require": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  // ── src/renderer（ESM + JSX + Preact）──
  // 用 @typescript-eslint/parser 解析 JSX（Espree 对 Preact automatic runtime 的 JSX 解析不稳）
  {
    files: ["src/renderer/**/*.js", "src/renderer/**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: tseslintParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        process: "readonly", // Electron renderer 通过 preload 注入 process
        require: "readonly", // 少量动态 require（条件加载可选模块）
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  // ── src 下少量 ESM .js 文件（src/stocks/diagnosis-scorer.js, src/utils/match-key.js）
  //    这些文件用 export function（ESM），但跟同目录的 CJS 文件混在一起。
  //    单独给 ESM + TS parser，覆盖 CJS block 的 sourceType: commonjs。
  {
    files: [
      "src/stocks/diagnosis-scorer.js",
      "src/utils/match-key.js",
      "scripts/gen-player-cn-map.mjs",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: tseslintParser,
      globals: {
        ...globals.node,
      },
    },
  },

  // ── tests（宽松：vitest globals + 允许 console + 不检查 unused）──
  {
    files: ["tests/**/*.js", "tests/**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: tseslintParser, // 测试也渲染 JSX（render(<Component/>)），需 JSX 支持
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "off",
      "no-empty": "off",
      "no-undef": "off",
    },
  },
];
