# AGENTS.md — Pulse 项目 AI Agent 入口

> 给进 Pulse 项目的 AI agent 用的"项目速览 + 关键约定 + 踩坑指针"。
> 不写架构详解（架构去看 docs/）—— 只写"agent 进来需要立刻知道什么"。

## 项目一句话

**Pulse** = macOS 菜单栏应用，AppUpdateChecker 工具。监听 macOS / Windows app 更新 + AI 榜单（v2.79.4+）。**多模态多数据源 Electron app**，主进程 Phase 3 + 3.5 完成；**Phase 4 renderer 已完成**（`src/renderer` `.js`/`.jsx` 清零）；**Phase 5 完成** — `config`/`utils`/`detectors`/`metals`/`funds`/`stocks`/`ai`/`ai-sessions`/`ai-usage`/`workers`/`release-notes` 已 `.ts`；**Phase 6 完成** — `tests/**/*.test.{js,jsx}` 已全 `.ts`/`.tsx`（350 + 128 = 478 files），连同 `helpers/mock-http`、`fixtures/timer-audit/*`、`perf/{startup,brew-lock}-bench`、`visual/{visual,games}.spec` 6 个非 vitest 文件也已 `.ts`；`_setup/*.cjs` 保留为 CJS helper bridge；**Phase 7 完成** — 150 个 `src/**/*.ts` 内部 `require()/module.exports` 改 ESM `import/export` (7a 全批 + 5 例外 dual-export)，随后 **126 个 `src/**/*.js` shim 全删** (7b)，vitest `resolve.extensions` 加 `.ts`，仅 Phase 3 五例外 (`http-client`/`state-store`/`token-budget`/`log`/`platform/index`) 保留为 CJS shim 供 main/src/.ts `require("./foo.js")` 直引。`find src -name "*.js" | grep -v "^src/main/.*$\|^src/platform/index\.js$"` = 0。

## 仓库布局

 - `src/main/` — 主进程（Phase 3 已 100% `.ts`。测试：`requireMain` → `dist-test`。**Phase 7 收尾**：仅 `http-client`/`state-store`/`token-budget`/`log` 4 个例外 shim 保留 (CJS `module.exports` only，main/release-notes.ts `require("./foo.js")` 直接吃);`platform/index.js` 也已删,改成 ESM dual-export (named + default export + module.exports)。其余 Phase 5 的 126 个 shim (utils/detectors/metals/funds/stocks/ai/ai-sessions/ai-usage/workers/release-notes) 全删—— caller 走 `import` ESM 或 `requireAi("foo")`/`requireWorkers("foo")` 等 helper 加载 dist-test .cjs 产物）
  - `src/main/ai-leaderboard/` — AI 榜单核心（fetcher 6 个 + aggregator + ranking + scheduler + types + normalize + cache）
  - `src/main/ipc/` — IPC handler（注册到 `ipcMain`）
  - `src/main/games/`, `src/main/funds/`, `src/main/worldcup/`, `src/main/ithome/`, `src/main/wechat-hot/` — 各业务域
 - `src/renderer/` — 渲染进程（Preact + esbuild；**Phase 4 已完成**：全部 `.ts`/`.tsx`）
  - `src/renderer/ai-leaderboard/` — 榜单 UI（4 个视角 tab：Arena / AA / LiveBench / HuggingFace）
 - `src/config/` / `src/utils/` / `src/detectors/` / `src/metals/` / `src/funds/` / `src/stocks/` / `src/ai/` / `src/ai-sessions/` / `src/ai-usage/` / `src/workers/` / `src/release-notes/` — **Phase 7**：真相在 `.ts`，已 ESM-ify (named `export` + 必要的 `import { ... }`/`import * as`)，`.js` shim 已删。tests 走 `requireUtils("foo")` 等 helper 加载 dist-test .cjs 产物；main/worker 内部用 `require("./foo.js")` (esbuild plugin backfill .js → .ts)。metal-config/metal-calc 与 fundCalc/fund-history/fund-nav-merge/format/fund-category/concentration/pnlCsv 与 diagnosis-scorer/strategies/stock-constants/stock-filter 与 default-models/ai-errors 与 anomaly-detect/history-series/format-glm 为 renderer 共享（纯 named `export`）。**prod worker** 走 `scripts/build-main.cjs` 打出的自包含 `dist/workers/detect-worker.js`（不进 main bundle；asar 用 `dist/workers/**`，不再打包 `src/workers/**`）
- `tests/` — vitest 单元测试（main 测走 `dist-test/main/per-file/*.cjs`，renderer 测走 happy-dom）
- `scripts/` — 构建脚本（`build-main.cjs` 产线：main + workers bundle / `build-main-ts.cjs` dev-test）
- `docs/` — 架构文档
- `deliverables/` — 交付报告（v2.7+ 阶段交付物）
- `RELEASE-NOTES.md` — 版本变更日志（顶部 v2.50，最新 v2.9.8 + 本地 v2.79.x）

## 关键约定

1. **Commit 风格**：`type(scope): subject`（feat/fix/refactor/chore）。看 `git log --oneline -20`。
2. **双 build 链**：
   - **dev/test**：`tests/_setup/build-main-ts.cjs` 走 `esbuild` 把每个 .ts 编到 `dist-test/main/per-file/*.cjs`，native cjs require 工作
   - **prod**：`scripts/build-main.cjs` esbuild bundle `dist/main/index.js`，走 .ts
   - 业务 .js 是 5 行 shim 指向 .ts
3. **Fetcher 架构**（AI 榜单）：每个数据源一个 fetcher（`fetcher-X.ts`），有 `fetch()` + `normalize()` 导出，由 `aggregator.ts` 调度。详细步骤看 agent memory 的"Pulse 加新数据源 fetcher 黄金 4 步"。
4. **测试要求**：每个 fetcher 至少 1 个独立 `fetcher-X.test.js` + `aggregator`/`ranking`/`normalize` 集成测试在 `tests/ai-leaderboard/`。`tests/ai-leaderboard/renderer.test.js` 测 store 行为（41 个 case）。
5. **数据源 opt-in**：每个新 fetcher 在 `aggregator.ts` 默认 `sources: { ... }` **不开**，由 `aiLeaderboardStore.js` 切 view 时拼 `sources.X = view === "X"`。`IPC sanitize` 默认也是按 view 决定拉哪些。
6. **.env** 是 dev-only 凭据，`.env.example` 是模板（已 gitignore .env）。HF 接入**没**用 key，匿名限频 ~1000/h。

## 踩坑指针（agent memory 已沉淀）

> **别重复记**——下面这些 entry 在 `~/.minimax/agents/mavis/memory/MEMORY.md` 里，进 Pulse 项目会**自动加载**。AGENTS.md 只列标题，详细看 MEMORY.md。

- **Pulse 加新数据源 fetcher 黄金 4 步**（主进程 4 步 + Renderer 4 处 + view switch 黄金 3 处）— 加 HF 实战模板
- **Pulse `tests/_setup/build-main-ts.cjs` 缓存判定坑** — mtime 对比失效时 `mv` cjs 强制 rebuild
- **Pulse `module.exports` vs `__export` 共存导致 sortValue 类型丢失** — 加新 export 后必须同步到底部 `module.exports = {...}`
- **esbuild 编译 .ts 双重导出坑**（跨项目通用）— `export function` + `module.exports` 双导出范式
- **esbuild `__export` 包装的 `__esModule: true` 互操作** — 调用方按 ESM 语义会踩坑
- **Pulse Phase 7 src/.js shim 删除关键决策** — vitest `require("../../src/foo")` 走 Node CJS 解析，不走 vite resolve.extensions；必须改成 `requireFoo("bar")` 走 dist-test .cjs 产物，或者改测试 import。**src/.ts 内部 `require("../bar")` (no .js) 删 shim 后 Node CJS 不能 resolve .ts**，要么加 `.js` 后缀 (esbuild plugin backfill) 要么改 ESM `import`
- **Pulse `vi.mock` hook ESM import 但 hook 不到 CJS `require.cache` 注入** — Phase 7 删 shim 后 detector-chain.ts 走 ESM `import * as`，require.cache 注入对 ESM namespace 不生效；改用 `vi.mock("../path/to/storage")` mock `loadBreakers`/`upsertBreaker` 绕过真实 state.json 持久污染
- **Pulse `const X = createRequire(import.meta.url)` TDZ** — ESM 模块顶层 `const require = createRequire(import.meta.url)` + `const { ... } = require(...)` 在 require-main import 之前会报 "Cannot access 'require' before initialization"；改用 `const _require = createRequire(...)` 别名 + `_require("../_setup/require-main.cjs")`，且 require-main import 必须放在所有 `import` 语句之后（ESM hoist 错位）
- **Pulse `extractFn(name)` 测试读 .ts source eval Function ctor** — Phase 7 ESM-ify 后 .ts source 含 `: any` TS syntax，`new Function('${src}; return X')()` 报 "Unexpected token ':'"；改读 `dist-test/.cjs` 编译产物

## 关键命令速查

```bash
# 开发
npm run dev                 # 起 Electron dev mode（prestart 自动 build main+preload+renderer）
npm test                    # 跑 vitest（pretest 自动 build main+preload）

# 类型检查
npm run typecheck           # preload + app + app.strict + renderer + tests

# 构建
npm run build:mac           # macOS 包（arm64 + x64）
npm run build:win           # Windows 包

# 其它
npm run lint                # eslint
npm run lint:css            # stylelint
```

> **Phase 7 后状态**：vitest 跑 469 文件 4832 pass + 4 skip + 4-6 已知 flaky（games-p1c date-related + home-grid）；4 个 tsconfigs (`app`/`preload`/`renderer`/`tests`) 0 errors；`tsconfig.app.strict.json` 86 errors 主要是 ai-sessions strict 历史遗留（不属于 Phase 7 引入）；`find src -name "*.js"` = 4（Phase 3 五例外最后堡垒）。

## 数据源（v2.79.4）

| 源 | fetcher | 主源性质 | 维度 |
|---|---|---|---|
| Arena | `fetcher-arena.ts` | 社区盲测 ELO | text/vision/code/text-to-image/text-to-video |
| AA | `fetcher-aa.ts` | 客观评测 (Free tier 限流) | intelligence/coding/agentic/speed/price |
| OpenRouter | `fetcher-openrouter.ts` | 目录骨架 | context/价格兜底 |
| LiveBench | `fetcher-livebench.ts` | 抗污染评测 | overall/coding/language/IF/cost |
| Models.dev | `fetcher-models-dev.ts` | 元数据补全 | context/window/价格/模态 |
| HuggingFace | `fetcher-huggingface.ts` | 社区信号 | downloads/likes/lastModified/pipeline/library |

## 视角 tab

1. **Arena** (🏆) — ELO 排名，board 切换
2. **AA** (📊) — 客观分 / 价格 / 速度
3. **LiveBench** (🛡️) — 抗污染评测
4. **HuggingFace** (🤗) — 社区下载 / 点赞（v2.79.5+ 新增）

## 改前先看

- `docs/architecture.md`（如有）— 整体架构
- `RELEASE-NOTES.md` 顶部 — 最新变更
- `tests/ai-leaderboard/main.test.ts` — 数据层契约（asserts 决定 schema 边界；Phase 6 已迁 .ts）

## 不要做

- **不要** 再批量加回 dual-path `.js` shim — **Phase 7 已删 126 个 shim**，仅 `http-client`/`state-store`/`token-budget`/`log` (4 个) 保留为 Phase 3 5 例外最后堡垒；新增 src/ 模块直接 `.ts` 走 ESM `import`/`export`，不用 shim 兜底
- **不要** 在 `toAiModel` 默认 5 字段 sources 里加新字段（保护 11+ toEqual 断言）— 新源切片用新字段但 sources 默认 5 字段不变
- **不要** `git add -p` 跨"我+别人"mixed 文件 — 用 explicit path add
- **不要** restore + apply 来回 — 用 `cp /tmp/backup` 兜底
- **不要** 拍"等 X 公布"边界前必 web_search 验（按 agent memory 教训）
- **不要** 把 `tests/**/*.ts`/`tests/**/*.tsx` 加回 `tsconfig.tests.json` 的 include — Phase 6 已 exclude，Bundler resolution 会触发 169 个假阳性 (dist-test/.cjs 产物类型窄化)，vitest 不依赖 tsconfig.include 仍跑 469 文件 4869 测试
- **不要** `sed -i '1i ...' $(find ...)` 在 zsh 下会爆 — 用 while read + per-file 处理
- **不要** 在 src/.ts 内部 `require("./foo")` 不加 `.js` 后缀 — 删 shim 后 Node CJS 不能 resolve `.ts`；统一用 `require("./foo.js")` (esbuild plugin backfill 到 .ts)。prod build 走 esbuild 编译期处理，vitest 测试同样依赖 build-main-ts.cjs plugin
- **不要** 把 `vi.mock` 跟 `require.cache[path] = {...}` 注入混用 — Phase 7 ESM-ify 后 module exports 是 frozen ESM namespace，require.cache stub 注入不生效；要 mock ESM module 用 `vi.mock("../../src/path/to/file.ts", () => ({ ... }))`
- **不要** 在 ESM test 顶部用 `const require = createRequire(import.meta.url)` 然后紧接 `require("../_setup/require-main.cjs")` — ESM hoist + TDZ 会让 `require` 报 "before initialization"；用 `const _require = createRequire(...)` 别名 + `_require(...)` 调用

## .mavis/ 项目级 skill

- `.mavis/skill/phase3-typescript-migration.md` — Phase 3 TS 迁移的具体操作 + 踩坑
- `.mavis/phase7-esm-ify.md` — Phase 7 src/.ts ESM-ify + 删 shim 重启版的详细计划（7a + 7b 两阶段、风险、回退）
