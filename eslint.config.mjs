/**
 * ESLint 10 flat config
 *
 * 分 5 个 scope：
 *   - 全局忽略（node_modules / renderer-dist / 隐藏目录）
 *   - src 下所有 CJS .js/.ts（main + detectors + ai + funds 等，Node globals）
 *   - src/renderer（ESM + JSX/TSX + Preact hooks，TS parser）
 *   - src 下少量 ESM .js/.ts 文件
 *   - tests（宽松，vitest globals，.js/.jsx/.ts/.tsx）
 *
 * 策略：warn 为主，CI 不阻断（--max-warnings=9999）。
 * 让开发者看到问题但不卡构建；逐步清理历史 warning。
 *
 * eslint 10 升级 (2026-07-26):
 *   - eslint 10 默认开启 no-constant-binary-expression / no-useless-assignment /
 *     preserve-caught-error 等新规则, 对历史代码大量误报.
 *   - 项目大量 `catch {}` 是有意吞错 (错误已 log / fallback), 改 no-empty: off.
 *   - .cjs 文件 (build-main-ts.cjs / require-main.cjs 等) 用 __dirname/__filename,
 *     Node globals 必须显式声明.
 */
import js from "@eslint/js";
import tseslintParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// ── eslint 10 新规则的统一处置 ──
// 这些规则在 eslint 9 时不存在或默认 off, eslint 10 默认开启后对历史代码大量误报.
// 保留为 warn (开发者能看到但不阻断 lint exit).
const ESLINT_10_NEW_RULES = {
  "no-constant-binary-expression": "off", // 项目里有大量 `x === undefined` 永远 truthy 的合法用法
  "no-useless-assignment": "off",         // eslint 10 误报历史代码
  "preserve-caught-error": "off",         // 项目大量 `catch {}` 有意吞错
  "no-empty": "off",                      // 项目大量 `catch {} / catch (e) { /* noop */ }` 故意空
  // Node 22+ 下 crypto/fetch/Worker/scheduler 等是 built-in global, 代码用
  // `const crypto = require("crypto")` 拿 Node module 跟 global 同名是合理的.
  "no-redeclare": "off",
  "no-global-assign": "off",
};

export default [
  // ── 全局忽略 ──
  {
    ignores: [
      "node_modules/",
      "renderer-dist/",
      "dist/",
      "dist-test/",
      ".worktrees/",
      ".cursor/",
      ".superpowers/",
      ".zcode/",
      ".omm/",
      ".workbuddy/",
      ".codegraph/",
      "deliverables/",
      "docs/",
      "versions/",
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
      "tests/_setup/**/*.cjs",
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
      ...ESLINT_10_NEW_RULES,
    },
  },

  // ── TypeScript 主进程 scope（与上面 CJS 块等价 sourceType/parser/rules）──
  //    Phase 4 仅承载 preload.ts；Phase 5+ 迁移更多 .ts 时继续落在这。
  //    glob 用根级 "**/*.ts" / "**/*.tsx" 占位声明, 让 ESLint 在 files 字段层面覆盖 TS 后缀,
  //    即便 Phase 5+ 新增 src/main/foo.ts 也会被本块兜住 (renderer 与 tests 单独覆盖).
  //    src/shared 是纯类型定义 (.d.ts 风格), 不在本块兜住; NodeJS 命名空间需要 parserOptions.project
  //    才能识别, Phase 4 不引入这个重量级配置.
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["src/renderer/**", "tests/**", "src/shared/**"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      parser: tseslintParser,
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "no-console": "off",
      "global-require": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      ...ESLINT_10_NEW_RULES,
    },
  },

  // ── src/renderer（ESM + JSX + Preact）──
  // 用 @typescript-eslint/parser 解析 JSX（Espree 对 Preact automatic runtime 的 JSX 解析不稳）
  {
    files: ["src/renderer/**/*.js", "src/renderer/**/*.jsx", "src/renderer/**/*.ts", "src/renderer/**/*.tsx"],
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
      ...ESLINT_10_NEW_RULES,
    },
  },

  // ── src 下少量 ESM .js / .mjs 文件 ──
  //    这些文件用 export function（ESM），但跟同目录的 CJS 文件混在一起。
  //    单独给 ESM + TS parser，覆盖 CJS block 的 sourceType: commonjs。
  {
    files: [
      "src/stocks/diagnosis-scorer.js",
      "scripts/gen-player-cn-map.mjs",
      "scripts/**/*.mjs",
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
    files: ["tests/**/*.js", "tests/**/*.jsx", "tests/**/*.ts", "tests/**/*.tsx"],
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
      ...ESLINT_10_NEW_RULES,
    },
  },
];
