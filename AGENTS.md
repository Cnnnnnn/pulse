# AGENTS.md — Pulse 项目 AI Agent 入口

> 给进 Pulse 项目的 AI agent 用的"项目速览 + 关键约定 + 踩坑指针"。
> 不写架构详解（架构去看 docs/）—— 只写"agent 进来需要立刻知道什么"。

## 项目一句话

**Pulse** = macOS 菜单栏应用，AppUpdateChecker 工具。监听 macOS / Windows app 更新 + AI 榜单（v2.79.4+）。**多模态多数据源 Electron app**，主进程 **Phase 3 Batch 0–9 完成**（业务纯 `.ts`；vitest 经 `dist-test` + `requireMain`；仅保留少数给 `src/ai`/`workers` 等非 main JS 用的 dual-path shim）。

## 仓库布局

- `src/main/` — 主进程（Phase 3 已 100% `.ts`。测试：`requireMain` → `dist-test`。例外 shim：`http-client`/`state-store`/`token-budget`/`log` + `platform/index`，供 `src/ai`/`workers` 等仍是 JS 的调用方）
  - `src/main/ai-leaderboard/` — AI 榜单核心（fetcher 6 个 + aggregator + ranking + scheduler + types + normalize + cache）
  - `src/main/ipc/` — IPC handler（注册到 `ipcMain`）
  - `src/main/games/`, `src/main/funds/`, `src/main/worldcup/`, `src/main/ithome/`, `src/main/wechat-hot/` — 各业务域
- `src/renderer/` — 渲染进程（Preact + esbuild bundle，**仍 .js + .jsx**，未 TS 化）
  - `src/renderer/ai-leaderboard/` — 榜单 UI（4 个视角 tab：Arena / AA / LiveBench / HuggingFace）
- `tests/` — vitest 单元测试（main 测走 `dist-test/main/per-file/*.cjs`，renderer 测走 happy-dom）
- `scripts/` — 构建脚本（`build-main.cjs` 产线 / `build-main-ts.cjs` dev-test）
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

## 关键命令速查

```bash
# 开发
npm run dev                 # 起 Electron dev mode（prestart 自动 build main+preload+renderer）
npm test                    # 跑 vitest（pretest 自动 build main+preload）

# 类型检查
npm run typecheck           # 4 个 tsconfig 全部跑

# 构建
npm run build:mac           # macOS 包（arm64 + x64）
npm run build:win           # Windows 包

# 其它
npm run lint                # eslint
npm run lint:css            # stylelint
```

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
- `tests/ai-leaderboard/main.test.js` — 数据层契约（asserts 决定 schema 边界）

## 不要做

- **不要** 再批量加回 dual-path `.js` shim — Batch 9 已清掉；仅 `http-client`/`state-store`/`token-budget`/`log`/`platform/index` 是给非 main JS 留的例外
- **不要** 在 `toAiModel` 默认 5 字段 sources 里加新字段（保护 11+ toEqual 断言）— 新源切片用新字段但 sources 默认 5 字段不变
- **不要** `git add -p` 跨"我+别人"mixed 文件 — 用 explicit path add
- **不要** restore + apply 来回 — 用 `cp /tmp/backup` 兜底
- **不要** 拍"等 X 公布"边界前必 web_search 验（按 agent memory 教训）

## .mavis/ 项目级 skill

- `.mavis/skill/phase3-typescript-migration.md` — Phase 3 TS 迁移的具体操作 + 踩坑
