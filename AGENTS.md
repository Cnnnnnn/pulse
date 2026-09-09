# AGENTS.md — Pulse 项目 AI Agent 入口

> 给进 Pulse 项目的 AI agent 用的"项目速览 + 关键约定 + 踩坑指针"。
> 不写架构详解（架构去看 docs/）—— 只写"agent 进来需要立刻知道什么"。

## 项目一句话

**Pulse** = macOS 菜单栏应用，AppUpdateChecker 工具，包含多模态、多数据源 Electron 能力。当前主进程、渲染进程和测试代码以 TypeScript/ESM 为主；仅少量 main 进程 CJS bridge 文件保留，具体以当前源码目录和构建脚本为准。

## 仓库布局

 - `src/main/` — 主进程；测试通过 `dist-test` 构建产物加载。仅 `http-client`、`state-store`、`token-budget`、`log` 保留 CJS bridge，其余模块按当前 TypeScript/ESM 实现处理。
  - `src/main/ai-leaderboard/` — AI 榜单核心（fetcher 6 个 + aggregator + ranking + scheduler + types + normalize + cache）
  - `src/main/ipc/` — IPC handler（注册到 `ipcMain`）
 - `src/main/funds/`, `src/main/ithome/`, `src/main/wechat-hot/` — 业务域目录，以当前源码树为准
 - `src/renderer/` — 渲染进程（Preact + esbuild；源码以 `.ts`/`.tsx` 为主）
  - `src/renderer/ai-leaderboard/` — 榜单 UI（4 个视角 tab：Arena / AA / LiveBench / HuggingFace）
 - `src/config/` / `src/utils/` / `src/detectors/` / `src/metals/` / `src/funds/` / `src/stocks/` / `src/ai/` / `src/ai-sessions/` / `src/ai-usage/` / `src/workers/` / `src/release-notes/` — 业务模块以 TypeScript/ESM 为准；测试按当前构建脚本加载 `dist-test` 产物。生产 worker 由 `scripts/build-main.cjs` 生成到 `dist/workers/`。
- `tests/` — vitest 单元测试（main 测走 `dist-test/main/per-file/*.cjs`，renderer 测走 happy-dom）
- `scripts/` — 构建脚本（`build-main.cjs` 产线：main + workers bundle / `build-main-ts.cjs` dev-test）
- `docs/` — 架构文档
- `deliverables/` — 交付报告（v2.7+ 阶段交付物）
- `RELEASE-NOTES.md` — 版本变更日志；以文件顶部最新条目为准，不在本入口文件中硬编码版本号

## 关键约定

1. **Commit 风格**：`type(scope): subject`（feat/fix/refactor/chore）。看 `git log --oneline -20`。
2. **双 build 链**：
   - **dev/test**：`tests/_setup/build-main-ts.cjs` 走 `esbuild` 把每个 .ts 编到 `dist-test/main/per-file/*.cjs`，native cjs require 工作
   - **prod**：`scripts/build-main.cjs` esbuild bundle `dist/main/index.js`，走 .ts
   - 仅 `src/main/http-client.js`、`state-store.js`、`token-budget.js`、`log.js` 保留为 CJS bridge；其余业务源码以 `.ts`/ESM 为准
3. **Fetcher 架构**（AI 榜单）：每个数据源一个 fetcher（`fetcher-X.ts`），有 `fetch()` + `normalize()` 导出，由 `aggregator.ts` 调度。详细步骤看 agent memory 的"Pulse 加新数据源 fetcher 黄金 4 步"。
4. **测试要求**：每个 fetcher 至少有独立测试，并在 `tests/ai-leaderboard/` 覆盖 `aggregator`、`ranking`、`normalize` 等集成行为；测试文件以当前 `.ts`/`.tsx` 结构为准。
5. **数据源 opt-in**：每个新 fetcher 在 `aggregator.ts` 默认 `sources: { ... }` **不开**，由 `aiLeaderboardStore.ts` 切 view 时拼 `sources.X = view === "X"`。`IPC sanitize` 默认也是按 view 决定拉哪些。
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

> **Phase 8 后状态**：vitest 历史基线为 469 文件 4885 pass + 4 skip + 5 个已知 flaky（预先存在的 date-related/home-grid 与 aggregator cacheBoard "all" vs "all-v11" 不匹配）；5 个 tsconfigs (`app`/`app.strict`/`preload`/`renderer`/`tests`) 全 0 errors；`find src -name "*.js"` = 4（Phase 3 五例外最后堡垒）。

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
