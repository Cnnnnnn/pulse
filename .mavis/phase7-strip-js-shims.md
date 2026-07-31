# Phase 7 — 砍 src/**/*.js shim

**状态**: 草案待 user 拍板
**前置**: Phase 6 收尾 (b8c860a) — tests/ 全 .ts/tsx
**预估**: 2-4h
**目标**: 130 个 .js shim 全部删除, src/ 下 0 .js (除 _setup 等 .cjs)

---

## TL;DR

Phase 5 commit `dde367b` 时为兼容性保留 130 个 5-行 .js shim（指向 dist-test/.cjs 或 .ts），现在已无意义 —— build chain 走 esbuild 已能 require .ts；test chain 走 vitest 已能 require .ts。删 shim 是纯收益：
- 130 文件 × 5 行 ≈ 650 行代码净减少
- 启动少 130 次 `existsSync` 调用
- AGENTS.md "不要做" 反向目标达成
- src/ `find -name "*.js" ! -name "*.cjs"` = 0 (跟 tests/ 对齐)

**核心决策**（必须 user 拍板）：

1. **是否同时删 build chain 的 shim 范式**？  
   现范式: vitest/native 走 `dist-test/<dir>/<name>.cjs` (有产物时) 或 `.ts` (无产物时, esbuild 编译时也会走 `.ts`)。  
   方案 A: 直接 require `.ts`，让 esbuild/vitest/native 自己处理 (主进程 esbuild 已经在 bundle 内联 .ts，vitest 走 esbuild loader)。  
   方案 B: 保留 "dist-test/.cjs 主，.ts 备" 双路径，因为某些 shim 是给 worker CJS 用的，worker bundle 不一定走 esbuild。  
   **推荐 A**：先全删 A，watch build/test；如果某个 shim 真有必要（worker CJS 冷启动走 native require）再单独加回来。

2. **保留哪些例外**？  
   AGENTS.md 已点名的 5 个 Phase 3 例外（`http-client/state-store/token-budget/log/platform/index`）是给**非 main JS 调用方**留的（早期 Phase 3 描述）。  
   选项:  
   - A. 全砍，包括这 5 个 — 唯一例外是 tests/_setup/*.cjs (CJS helper)  
   - B. 砍 125 个普通 shim，保留 5 个例外 + tests/_setup/*.cjs  
   - **推荐 A**：5 个例外是 Phase 3 留下的，当时没 tsify 的工具文件，现在 .ts 都在了，一起砍。

3. **批处理粒度**？  
   选项:  
   - **A. 一次性 git rm 全部 130 + sed 替换所有 require/import 路径**（快，但 diff 大，难 review）  
   - B. 按目录分批（detectors / funds / stocks / ai / ai-sessions / ai-usage / workers / release-notes / metals / utils），每批独立 commit（推荐，跟 Phase 5/6 一致风格）  
   - C. 按风险分批：先低风险（纯 shim 替换，叶子模块）→ 中风险（被 main bundle 引用的）→ 高风险（worker bundle）

---

## 实施步骤（推荐 B 批处理 + A 砍范围）

### Batch 1 — 叶子 helper (低风险, ~40 文件)
- `src/utils/{app-paths,version-utils,stale-detect}.js`
- `src/detectors/{utils,errors,base,redirect-base,url-template,circuit-breaker,circuit-breaker-storage,app-bundle-changelog}.js` (15 个)
- `src/funds/{format,fund-category,concentration,trading-hours,pnlCsv,fundCalc,fund-nav-merge}.js`
- `src/stocks/{stock-constants,stock-filter,strategies,diagnosis-scorer}.js`
- `src/ai/{ai-errors,default-models,sanitize-llm-output,readme-parse,prompt-registry,shared-llm}.js`
- `src/ai-usage/{format-glm,normalize-glm,normalize-usage-summary,history-series,anomaly-detect}.js`
- `src/metals/{metal-calc,metal-config}.js`

**做法**:
```bash
# 每个 .js: git rm; 主进程/worker 已经走 dist-test 或 esbuild, 移除 .js 后 require('./foo') 自动 fallback 到 .ts
git rm src/utils/app-paths.js
# 主进程/worker 的 require('./app-paths') 立即 fallback 到 .ts (vitest 走 esbuild loader, prod esbuild 也在 bundle 内联)
```

### Batch 2 — 中风险 (被 main bundle 直接 import, ~50 文件)
- `src/detectors/*-detector.js` (24 个 fetch 类)
- `src/funds/{fund-fetcher,fund-fetcher-sina,fund-history,fund-nav-history,fund-search,nav-source-health}.js`
- `src/stocks/{stock-fetcher,stock-search,sina-fetcher,market-overview,stock-detail-cache,stock-detail-angles,stock-detail-fetcher}.js`
- `src/stocks/detail-fetchers/*.js` (15 个)
- `src/metals/{metal-fetcher,metal-scheduler,metal-eastmoney-fetcher,metal-sina-hf-fetcher,metal-kline-fetcher}.js`

**做法**: 同 Batch 1，但要 `npm run build:mac` 一次验 prod bundle 仍能 include 这些模块。

### Batch 3 — 复杂 (被 worker bundle + release-notes, ~15 文件)
- `src/workers/{pool,task-handlers,ipc,installed-version,version-source,win-registry,detector-chain,detector-chain-incremental,result-builder,detect-worker}.js`
- `src/release-notes/loader.js`

**做法**: prod worker 是 esbuild 自包含 bundle (`scripts/build-main.cjs`), 走 `.ts` 也行；要验 `npm run build:mac` 后 dist/workers/detect-worker.js 仍能 bundle。

### Batch 4 — 主进程 5 例外 + ai-sessions (最后扫尾, ~25 文件)
- `src/main/{http-client,state-store,token-budget,log}.js` (Phase 3 留的例外)
- `src/platform/index.js` (Phase 3 留的)
- `src/ai/{upgrade-advice,changelog-summary,stock-detail-advisor,stock-screener-advisor}.js`
- `src/ai-sessions/{index,engine,codex,cursor,minimax-code,provider-cloud,date-utils,jsonl-reader,prompts,session-log,detector,sqlite-helper,text-utils,summarizer,storage,wiring}.js`

**做法**: 主进程 esbuild bundle 包含所有 .ts/.js，删 .js 后不会出错，但要验 `npm run build:mac` 仍正常。

---

## 关键校验点

每个 batch 后跑：

```bash
npm test                # 4869+ 仍 pass
npm run typecheck       # 5/5 tsconfig pass
npm run build:mac       # macOS bundle 仍能 include (Batch 2/3/4)
npm run build:win       # Windows bundle 仍能 include (Batch 4)
```

**特别注意**：
- `src/workers/*.js` 走的 prod bundle 是 `scripts/build-main.cjs` 的 esbuild 二次 bundle → 必须确认能 require `.ts` (esbuild 是支持的，但要走 resolveExtensions)
- `src/release-notes/loader.js` 是 **Phase 5/6 里被作为测试目标反复打过架** 的文件，要额外测
- `src/ai-sessions/*.js` 数量多 (15+)，是被 main bundle 引用的最大集合

---

## 不删的 .js (硬例外)

| 文件 | 原因 |
|---|---|
| `tests/_setup/*.cjs` | CJS helper，bridge 到 esbuild 产物 |
| `scripts/*.cjs` | Node CLI 脚本 (visual-serve.cjs 等)，不被 vitest 收集 |
| 任何 vitest `.bench.js` 已 Phase 6 改 .ts | — |

---

## 风险

| 风险 | 缓解 |
|---|---|
| esbuild bundle 找不到 .ts (resolveExtensions 缺 `.ts`) | Batch 1 先小范围测，发现 build 错立刻补 esbuild config |
| vitest worker pool 的 child_process 走 native require .js | 验证 `pool.ts` 的 require 路径 — 大概率已用 `dist-test` 或 esbuild bundled |
| `src/release-notes/loader.js` 是 hot path (release notes 启动时用) | 单独跑 Batch 3 + 验证渲染 |
| 130 个文件一次 diff 难 review | **分 4 batch**，每个独立 commit |
| 5 个 Phase 3 例外（http-client 等）已 N 多地方 `require(...)` | 全文搜索引用点，逐一 sed 改路径或删 |

---

## 验收

1. `find src -name "*.js" ! -name "*.cjs"` → **0**
2. `npm test` 4869+ pass (含 Batch 1/2/3/4)
3. `npm run typecheck` 5/5 pass
4. `npm run build:mac` 产 `.app` 含所有原模块 (diff `dist/main/index.js` SHA 不变 OR diff 可控)
5. `npm run build:win` 产 `.exe` (CI 才跑，本地 skip)
6. AGENTS.md "不要做" 段删 "再批量加回 dual-path .js shim" 那条（因为已经 0 shim 了）
7. `dist-test/` 目录大小减小（少了 130 个 .cjs 产物）

---

## 文件清单

| Batch | 文件数 | 改/删 |
|---|---|---|
| 1 (低风险 helper) | ~40 | 全 `git rm` |
| 2 (中风险 detector/fetcher) | ~50 | 全 `git rm` |
| 3 (workers + release-notes) | ~15 | 全 `git rm` |
| 4 (Phase 3 5 例外 + ai-sessions) | ~25 | 全 `git rm` |
| `AGENTS.md` | 1 | 改 1 段 ("不要做" 移除 shim 那条) |
| `scripts/build-main.cjs` (可改可不改) | 1 | 验 resolveExtensions 含 `.ts` |

合计 **~131 文件删** + 1 doc 改, 净 -650 行

---

## TODO (待 user 拍板)

- [ ] 决策 1: 砍范围 — A 全砍包括 5 Phase 3 例外 / B 保留 5 例外 **推荐 A**
- [ ] 决策 2: 批处理 — A 一次 / B 按目录分 4 batch / **C 按风险分** **推荐 B**
- [ ] 决策 3: 是否同时改 `scripts/build-main.cjs` 加 `resolveExtensions: ['.ts', '.js']` — **推荐改** (预防万一)