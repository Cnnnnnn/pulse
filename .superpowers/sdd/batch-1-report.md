# Batch 1 Report — 顶层枢纽迁 TypeScript

**Status**: GREEN · **Commit**: `f4e0ae8` · **HEAD**: `f4e0ae8` on `refactor/typescript-phase-3`

## Migrated (7 files / ~1429 行)

| From | To |
|------|-----|
| `src/main/tray-menu-prefs.js` | `tray-menu-prefs.ts` |
| `src/main/check-runner.js` | `check-runner.ts` |
| `src/main/watchlist.js` | `watchlist.ts` |
| `src/main/run-check-deps.js` | `run-check-deps.ts` |
| `src/main/metal-ipc.js` | `metal-ipc.ts` |
| `src/main/error-guard.js` | `error-guard.ts` |
| `src/main/config-portability.js` | `config-portability.ts` |

## Pattern

- CJS: `import type` / `export type` + `require()` + `module.exports`
- 已迁模块用显式 `.ts` require；CJS 无扩展名 require 自动跟到 `.ts`
- 保留 `.js` shim（`metal-ipc.js` 被 `index.ts:76` 显式 `require("./metal-ipc.js")`）
- 不新增 adapter / 测试；不动 `build-main.cjs`
- esbuild warnings 是 export/require 双重声明（功能等价）

## Verification

- typecheck 0
- build:main 0（`dist/main/index.js` 1.1MB；`node --check` OK）
- 定向 vitest 12 文件 / 117 PASS
- bundle contracts 8/8 串行

## Concern

- `metal-ipc` 是 entry `index.ts:76` 显式 `require("./metal-ipc.js")`，未来 Batch 9 兜底时把 index.ts 切到 `metal-ipc.ts`，删除 .js shim。
- esbuild 双重声明警告 ~6 处，不影响运行；Phase 3.5 strict 阶段可能要消。