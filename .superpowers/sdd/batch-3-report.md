# Batch 3 Report — digest + search 迁 TypeScript

**Status**: GREEN · **Commit**: `4f1c7cd` · **HEAD**: `4f1c7cd` on `refactor/typescript-phase-3`

## Migrated (6 files / 857 行)

| From | To |
|------|-----|
| `src/main/digest/aggregate.js` | `digest/aggregate.ts` |
| `src/main/digest/daily-summary-job.js` | `digest/daily-summary-job.ts` |
| `src/main/search/build-docs.js` | `search/build-docs.ts` |
| `src/main/search/highlight.js` | `search/highlight.ts` |
| `src/main/search/search-index.js` | `search/search-index.ts` |
| `src/main/search/tokenizer.js` | `search/tokenizer.ts` |

## Pattern

- CJS + import type + require() + module.exports
- 保留 .js shim
- `search-index.ts` 显式标注 require 的返回类型（`{ tokenize: (text) => string[] }: ...`）—— Phase 2 `pool-size.ts` 记录过此坑：`module.exports = ...` 让 tsc 推成 unknown
- digest/aggregate 的 `truncate` 把 unknown 显式收敛成 string，避免 tsc 不让用 unknown 调 .length/.slice

## Verification

- typecheck 0
- build:main 0（dist/main/index.js 1.1MB；`node --check` OK）
- vitest 29 PASS（digest/aggregate + search/search-index + 2 bundle contracts serial）
- esbuild 警告 ~22 处（export/require 双重声明，Phase 2 已记录）

## Concern

- esbuild warnings 22 持续增加；每新 .ts 加 `export` + `module.exports` 会重复报一次。Phase 3.5 strict 时可以批量去 `export`，只留 `module.exports`（CJS 模式）。
- `daily-summary-job` 引入 `src/ai/prompt-registry` + `src/ai/shared-llm`（仍是 .js），CJS 无扩展名 require 跨 ts/js 自动解析，未出问题。