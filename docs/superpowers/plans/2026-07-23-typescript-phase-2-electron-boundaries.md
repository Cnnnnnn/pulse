# TypeScript 第二阶段：Electron 运行边界迁移计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把第一阶段外的 Electron 运行边界（主进程入口、窗口、托盘、IPC 注册、preload、preload 共享类型、Electron 启动相关 bootstrap）迁移为 TypeScript，使应用可以启动、主窗口/托盘/IPC/worker 生命周期行为与迁移前一致。

**Architecture:** 沿用第一阶段构建链，TypeScript 仅负责 `noEmit` 类型检查；现有 esbuild 继续负责打包。preload 已为 TypeScript；本阶段新增 `src/shared/electron/` 下的运行时 adapter（`app`、`session`、`http-client`、`state-store` 等的最小 surface），让主进程模块按 adapter 声明依赖，从而避免把 Electron 具体类型散落每个文件。主进程按 6 个依赖层级分批迁移，每个目录独立启用 `noImplicitAny`/`strictNullChecks`，不一次性开 `strict`。

**Tech Stack:** TypeScript 5.6、Electron 39、esbuild 0.28、Vitest 2、ESLint 9、CommonJS

## Global Constraints

- 迁移期间允许 JS/TS 共存；本阶段只迁移 `src/main/`、`preload` 已完成、`src/shared/electron/` 新增 adapter，不动业务子域（`src/ai`、`src/ai-sessions`、`src/ai-usage`、`src/stocks`、`src/funds`、`src/metals`）与 renderer。
- 每个迁移目录独立启用 `noImplicitAny: true`；按需要追加 `strictNullChecks: true`。不在此阶段开全项目 `strict`。
- 允许为类型边界写 adapter 接口（用户已确认偏好）。允许 explicit `any` 仅在 adapter 内封装第三方/动态形状，文件头加 `ponytail:` 注释说明 ceiling；不得在业务域或主进程编排层使用 `any`。
- 不引入运行时 TypeScript loader，不新增 `tsx`/`ts-node`；继续用现有 esbuild。
- 不改变 Electron 启动顺序、IPC channel、参数顺序、事件 payload、preload 暴露对象、发布产物路径、CSS/HTML 结构。
- 主进程依赖的 ESM 子目录（`src/ai`、`src/ai-sessions`、`src/ai-usage`）短期不迁移，但本阶段新增的 TS 文件 `require()` 它们时需保持现有动态 require 的兼容形式或允许 `import type`。
- 每个目录迁移必须保持现有 `tests/main/*.test.js` 通过；测试保留为 `.js`（迁移到 `.ts` 属于第五阶段）。
- 不提交 `dist/`、`renderer-dist/`、`.superpowers/`。`jsconfig.json` 仍保留至最终阶段再删。
- 第二阶段不引入新依赖。
- 修改 electron、preload、bootstrap 相关文件时不得触发第一阶段已完成的契约测试失败。

---

## 第二阶段文件结构

按依赖层级分批，共 6 批 + 1 个 adapter 起始批：

### Batch 0 — Adapter 起点（新增）
- Create: `src/shared/electron/app-env.d.ts` — 包装 `electron.app`/`process.platform` 启动入口的窄类型。
- Create: `src/shared/electron/log-adapter.d.ts` — 暴露 `mainLog`/`detectLog` 形状的接口。
- Create: `src/shared/electron/http-client-adapter.d.ts` — `HttpClient` 接口（按现有方法名）。
- Create: `src/shared/electron/state-store-adapter.d.ts` — `stateStore` 顶层方法接口。
- Create: `src/shared/electron/timer-registry-adapter.d.ts` — `auditTimers`/`clearAllManaged` 接口。
- Create: `src/shared/electron/pool-size-adapter.d.ts` — `computePoolSize` 接口。
- Create: `src/shared/electron/diagnostics-adapter.d.ts` — `markBootstrapDone` 接口。
- Create: `src/shared/electron/safe-require.d.ts` — 允许在 vitest 加载时缺失某些模块的类型化 `safeRequire`。

### Batch 1 — 平台抽象（新增 + 已有）
- Modify: `src/platform/index.js` → `src/platform/index.ts`。
- Modify: `src/platform/macos.js` → `src/platform/macos.ts`。
- Modify: `src/platform/windows.js` → `src/platform/windows.ts`。
- Update: `src/main/window.js` 中的 `require("../platform")` 改为 import。
- Update: `tsconfig.app.json` 增加 `src/platform/**` 的 sub-config 或路径解析。

### Batch 2 — 启动期辅助模块（state-store / log / http-client / timer / pool-size / diagnostics）
- Modify: `src/main/state-store.js` → `.ts`（66K，最大块，先按子文件拆分或保留单文件，必须跑测试）。
- Modify: `src/main/log.js` → `src/main/log.ts`。
- Modify: `src/main/http-client.js` → `.ts`。
- Modify: `src/main/timer-registry.js` → `.ts`。
- Modify: `src/main/pool-size.js` → `.ts`。
- Modify: `src/main/diagnostics.js` → `.ts`。

### Batch 3 — 窗口 + 托盘
- Modify: `src/main/window.js` → `src/main/window.ts`。
- Modify: `src/main/tray.js` → `src/main/tray.ts`。

### Batch 4 — IPC 注册层
- Modify: `src/main/ipc/index.js` → `.ts`。
- Modify: 28 个 `src/main/ipc/register-*.js` 全部迁移为 `.ts`，按依赖顺序分两小组（核心/扩展）。
- Modify: `src/main/ipc/context.js` → `.ts`（被多数 register 引用）。

### Batch 5 — bootstrap 编排
- Modify: 9 个 `src/main/bootstrap/*.js` 迁移为 `.ts`。

### Batch 6 — 主进程入口
- Modify: `src/main/index.js` → `src/main/index.ts`。
- Update: `package.json` 的 `main` 字段（如果从 `src/main/index.js` 改成 `src/main/index.ts`）；保留 esbuild 输出和 electron-builder 行为不变。
- Update: 主入口用 esbuild 单独构建到 `dist/main/index.js`（如需）。

---

### Task 0: 引入 Electron 运行边界 adapter 起点

**Files:**
- Create: `src/shared/electron/*.d.ts`（共 7 个）
- Modify: `tsconfig.app.json`
- Test: `tests/typescript/electron-adapters.test.js`

**Interfaces:**
- Produces: 仅 `.d.ts`，不导出运行时代码；提供 `import type` 入口给后续 .ts 主进程模块。
- 边界: 文件内只声明接口，附带 `ponytail: adapter ceilings documented per method` 注释。

- [ ] **Step 1: 写入失败契约测试**

新建 `tests/typescript/electron-adapters.test.js`，断言：每个 adapter 文件存在、每个文件 export `interface` 而非 runtime impl；以及 `src/main/*.js` 当前依赖的导出方法名集合与 adapter 名称一致。

测试应先失败（adapter 文件不存在）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/typescript/electron-adapters.test.js`

Expected: FAIL。

- [ ] **Step 3: 创建 adapter `.d.ts`**

每个 adapter 文件结构：

```ts
// src/shared/electron/http-client-adapter.d.ts
import type { HttpClient } from "electron";

/**
 * ponytail: 适配 src/main/http-client.js 当前 public surface。
 * 业务侧只通过类型化的方法调用；HTTP 细节在 adapter 内部封装。
 */
export interface HttpClientAdapter {
  fetch(input: string, init?: { headers?: Record<string, string>; method?: string; body?: string }): Promise<{ status: number; text(): Promise<string>; json(): Promise<unknown> }>;
  // ... 与现状逐项对齐
}

export type ElectronHttpClientCtor = new (opts?: unknown) => HttpClientAdapter;
```

其他 adapter 同样按现状的 public 方法签名（grep `module.exports` / 函数定义），不修改行为，仅提供类型。`safe-require.d.ts` 提供 `safeRequire<T>(name: string): T | null` 形态，允许在 vitest 环境下找不到模块时返回 null。

- [ ] **Step 4: 调整 tsconfig.app.json include**

把 `src/shared/electron/**/*.d.ts` 加入 `include`，并让 `tsconfig.preload.json` 不再承担它。

- [ ] **Step 5: 运行契约测试与 typecheck**

Run: `npx vitest run tests/typescript/electron-adapters.test.js`
Expected: PASS。

Run: `npm run typecheck`
Expected: exit 0；adapters 引入对 runtime 行为无影响。

- [ ] **Step 6: 提交**

```bash
git add src/shared/electron tests/typescript/electron-adapters.test.js tsconfig.app.json tsconfig.preload.json
git commit -m "feat: add Electron runtime boundary adapter types"
```

---

### Task 1: 迁移 `src/platform/` 为 TypeScript

**Files:**
- Rename: `src/platform/index.js` → `.ts`
- Rename: `src/platform/macos.js` → `.ts`
- Rename: `src/platform/windows.js` → `.ts`
- Modify: `src/main/window.js` 的 `require("../platform")` import 路径
- Modify: `tsconfig.app.json`
- Test: `tests/platform/*.test.js`

**Interfaces:**
- Consumes: `ElectronAppAdapter`（仅在 window.ts 中需要时引入）。
- Produces: 与现状一致的 `getWindowOptions`/`getTitleBarStyle` 等导出，行为不变。

- [ ] **Step 1: 写失败测试**

在 `tests/platform/windows-app-icon.test.js`（已存在）之外，新增聚焦断言：`require("../platform")` 在 commonjs 下仍返回相同形状；可通过 `node --print 'Object.keys(require("../platform"))'` 字符串断言。或更可靠：在测试中实际 `require` 编译后路径，对比 `Object.keys`。

预期先 RED（src/platform 是 .js，断言 .ts 失败）。

- [ ] **Step 2: 重命名为 .ts 并补类型**

迁移时每个函数保留原实现；类型仅约束入参/出参；`process.platform` 用 `NodeJS.Platform`；`BrowserWindowConstructorOptions` 从 `electron` import。`allowJs: true` 时 tsconfig.app.json 已可解析 `.js`，新 `.ts` 与旧 `.js` 共存。

- [ ] **Step 3: 更新 window.js 引用并验证 import 路径**

`src/main/window.js:24` 仍可 `require("../platform")`；改成 `.ts` 不需要路径改动（require 解析自动 follow `.js` 与 `.ts`）。跑 `npm run typecheck` 验证 .ts 文件可被 .js 文件通过 `require` 引用。

- [ ] **Step 4: 运行测试**

Run: `npm test -- --run tests/platform --exclude tests/main/github-auth.test.js`

Expected: PASS。

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 5: 提交**

```bash
git add src/platform tsconfig.app.json
git commit -m "refactor: migrate platform abstraction to TypeScript"
```

---

### Task 2: 迁移启动期辅助模块（log / http-client / timer-registry / pool-size / diagnostics）

**Files:**
- Rename: `src/main/log.js` → `src/main/log.ts`
- Rename: `src/main/http-client.js` → `.ts`
- Rename: `src/main/timer-registry.js` → `.ts`
- Rename: `src/main/pool-size.js` → `.ts`
- Rename: `src/main/diagnostics.js` → `.ts`
- Modify: `tsconfig.app.json` 增加 sub-strict 块（仅这些文件 `strictNullChecks: true`）。
- Test: 现有 `tests/main/*.test.js`（log/timer/pool-size/diagnostics）。

**Interfaces:**
- Consumes: adapter interfaces（log / http-client / timer / pool / diagnostics）。
- Produces: 与现状行为一致；类型显式声明在 `.ts` 文件。

- [ ] **Step 1: 写失败测试**

新增聚焦测试 `tests/main/log-format.test.js`、`tests/main/timer-registry-shape.test.js`、`tests/main/pool-size-default.test.js`、`tests/main/diagnostics-mark.test.js`，断言它们导出的函数名/形状在迁移前后一致（用 `Object.keys` 或 grep 源码）。先 RED。

- [ ] **Step 2: 迁移 log.ts 与 http-client.ts（最小独立依赖）**

保留函数体，仅添加入参/出参类型。`http-client.ts` 中 fetch 响应类型用 `Response`-like shape（adapter 内部定义），不引入 `@types/node-fetch`。

- [ ] **Step 3: 迁移 timer-registry.ts / pool-size.ts / diagnostics.ts**

`timer-registry` 接受 `NodeJS.Timeout` 类型 ID；`pool-size` 入参接受 `os.cpus()` 返回值类型；`diagnostics` 标记 `markBootstrapDone(stage: string)`。

- [ ] **Step 4: 启用 strictNullChecks 子块**

修改 `tsconfig.app.json` 加入 `compilerOptions` overrides（如不可行，复制出 `tsconfig.main-strict.json` 仅检查本批文件）。typecheck 应通过；如个别 nullable 处理不优雅，记录到本任务 concerns，由后续 task 收紧。

- [ ] **Step 5: 运行测试**

Run: `npm test -- --run tests/main --exclude tests/main/github-auth.test.js`
Expected: PASS。

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 6: 提交**

```bash
git add src/main/log.ts src/main/http-client.ts src/main/timer-registry.ts src/main/pool-size.ts src/main/diagnostics.ts tsconfig.app.json tests/main
git commit -m "refactor: migrate startup helpers to TypeScript"
```

---

### Task 3: 迁移 state-store

**Files:**
- Rename: `src/main/state-store.js` → `src/main/state-store.ts`
- Modify: `tsconfig.app.json`
- Test: `tests/main/state-store-*.test.js`（多个）。

**Interfaces:**
- Consumes: `state-store-adapter`。
- Produces: 与现有 getter/setter 形状一致；可拆为多文件（按域拆分 read-only / cache / config），但本阶段优先单文件拆分（避免行为漂移）。

- [ ] **Step 1: 写失败测试**

断言 `require("../main/state-store")` 在迁移前后导出相同 keys 集合；新增 `tests/main/state-store-shape.test.js`。先 RED。

- [ ] **Step 2: 拆分并迁移**

`state-store.js` 现有 66KB、单文件；按以下边界拆分：

- `state-store/loaders.ts`：配置文件 IO（loadConfig、saveConfig 等）。
- `state-store/cache.ts`：内存缓存与失效。
- `state-store/index.ts`：聚合导出，仍 `module.exports = { ... }`。

行为不能变；`loadConfig`/`saveConfig` 调用必须 1:1 等价。每个子文件 `.ts` 加 `ponytail:` 注释说明天花板与已知简化。

- [ ] **Step 3: 运行**

Run: `npm test -- --run tests/main --exclude tests/main/github-auth.test.js`
Expected: PASS。

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 4: 提交**

```bash
git add src/main/state-store src/main/state-store.ts tsconfig.app.json tests/main/state-store-shape.test.js
git commit -m "refactor: split and migrate state-store to TypeScript"
```

注：删除旧 `state-store.js`，保留 `state-store.ts` 与新子目录，或仅 `state-store.ts` 单文件。优先保持单文件入口以减少 require 路径变化。

---

### Task 4: 迁移 window 与 tray

**Files:**
- Rename: `src/main/window.js` → `.ts`
- Rename: `src/main/tray.js` → `.ts`
- Modify: `tsconfig.app.json`
- Test: `tests/main/window.test.js`、新增 `tests/main/tray-shape.test.js`。

**Interfaces:**
- Consumes: `src/platform/*` 已迁移完成、`electron-app-adapter`。
- Produces: `createWindowManager({...}).getWindow()` 等 API 不变；冷启动最大化行为（first commit）保留。

- [ ] **Step 1: 写失败测试**

`tests/main/tray-shape.test.js` 断言 `createTrayManager` 接受 `{ app, getWindow, sendToRenderer, ... }` 并暴露 `getMenu()` 等接口；window 已有静态断言测试，新增 .ts 重命名后的 import path 不变断言。先 RED。

- [ ] **Step 2: 迁移 window.ts**

`createWindowManager(opts)` 中 `opts` 加显式 interface；`mainWindow.maximize/show/focus` 顺序不变；`webPreferences.preload` 路径仍是 `dist/preload.js`。

- [ ] **Step 3: 迁移 tray.ts**

`createTrayManager` 同样加显式 interface；`Menu.buildFromTemplate` 接受 `Electron.MenuItemConstructorOptions[]`。

- [ ] **Step 4: 运行**

Run: `npm test -- --run tests/main --exclude tests/main/github-auth.test.js`
Expected: PASS。

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 5: 提交**

```bash
git add src/main/window.ts src/main/tray.ts tests/main/tsconfig.app.json
git commit -m "refactor: migrate window and tray to TypeScript"
```

---

### Task 5: 迁移 IPC context + 核心 register

**Files:**
- Rename: `src/main/ipc/context.js` → `.ts`
- Rename 核心 registers（按依赖排序）: `register-core.js`、`register-search.js`、`register-open-url.js`、`register-tray-config.js`、`register-theme.js`、`register-self-update.js`、`register-config-portability.js`、`register-reminders-recent.js`、`register-versions-overview.js`、`register-token-budget.js`、`register-ai-prompts.js`、`register-upgrade-advice.js`、`register-changelog-summary.js`、`register-funds.js`、`register-metals.js`（如有）、`register-ai-feedback.js`。
- Modify: `tsconfig.app.json`
- Test: `tests/main/ipc-*.test.js`、新增形状测试。

**Interfaces:**
- Consumes: `electron.IpcMainInvokeEvent` 已内置；`safe-require` 适配业务子域未迁移模块。
- Produces: `ipcMain.handle(channel, async (event, payload) => …)` 通道字符串与签名不变。

- [ ] **Step 1: 写失败测试**

新增 `tests/main/ipc-handle-shape.test.js`：静态扫描 `src/main/ipc/register-*.js` 中所有 `ipcMain.handle("channel"` 第一参字符串集合；要求与现有 preload.ts IPC 通道集合一致（Task 2 已写类似等价测试），先 RED。

- [ ] **Step 2: 迁移 context.ts**

`wrapHandler` / `safeHandle` 等保持行为；类型签名显式声明。

- [ ] **Step 3: 按依赖顺序迁移 register 文件**

每文件内 `ipcMain.handle` 第二参数 `(event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>`；payload 在 register 内用类型守卫收敛到业务形状。允许 `ponytail:` 注释记录 ceiling。

- [ ] **Step 4: 运行**

Run: `npm test -- --run tests/main --exclude tests/main/github-auth.test.js`
Expected: PASS。

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 5: 提交**

```bash
git add src/main/ipc tsconfig.app.json tests/main
git commit -m "refactor: migrate core IPC handlers to TypeScript"
```

---

### Task 6: 迁移扩展 IPC register

**Files:**
- Rename: 剩余 14 个 `register-*.js` → `.ts`（ai / ai-usage / games / github / ithome / ithome-share / leaderboard / stocks / stock-detail / stock-export / worldcup / wechat-hot / share-card / digest）。

**Interfaces:** 与 Task 5 同。

- [ ] **Step 1: 写失败测试**

扩展 `ipc-handle-shape.test.js` 覆盖全部 register 文件的 IPC channel 集合（与 preload.ts 比较）。先 RED。

- [ ] **Step 2: 逐文件迁移**

每文件保留原 `ipcMain.handle/on` 行为；类型按上下文收敛。涉及业务子域（ai / stocks / worldcup）的入口只声明参数为 `unknown`，由 register 内做类型守卫；不修改子域。

- [ ] **Step 3: 运行**

Run: `npm test -- --run tests/main --exclude tests/main/github-auth.test.js`
Expected: PASS。

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 4: 提交**

```bash
git add src/main/ipc tests/main
git commit -m "refactor: migrate extended IPC handlers to TypeScript"
```

---

### Task 7: 迁移 IPC 聚合入口

**Files:**
- Rename: `src/main/ipc/index.js` → `src/main/ipc/index.ts`

- [ ] **Step 1: 写失败测试**

新增 `tests/main/ipc-index-exports.test.js`：断言 `require("../../main/ipc")` 暴露的函数名集合在迁移前后一致。先 RED。

- [ ] **Step 2: 迁移**

`registerIpcHandlers` 加显式签名；逐个 import 其他 register 模块。

- [ ] **Step 3: 运行**

Run: `npm test -- --run tests/main --exclude tests/main/github-auth.test.js`
Expected: PASS。

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 4: 提交**

```bash
git add src/main/ipc/index.ts tests/main/ipc-index-exports.test.js
git commit -m "refactor: migrate IPC index to TypeScript"
```

---

### Task 8: 迁移 bootstrap 编排层

**Files:**
- Rename: `src/main/bootstrap/*.js` → `.ts`（9 个：ai-tasks / ai-usage / category / config / error-init / schedulers / send-to-renderer / state-init / tray-init）。

- [ ] **Step 1: 写失败测试**

新增 `tests/main/bootstrap-shape.test.js`：grep `module.exports` 关键字面量集合，断言迁移后 9 个 bootstrap 模块的导出键不变。先 RED。

- [ ] **Step 2: 迁移**

每个文件按依赖图迁移：`config` → `category` → `state-init` → `error-init` → `send-to-renderer` → `tray-init` → `ai-usage` → `ai-tasks` → `schedulers`。允许引用 `electron-app-adapter` 与 `safe-require`。

- [ ] **Step 3: 运行**

Run: `npm test -- --run tests/main --exclude tests/main/github-auth.test.js`
Expected: PASS。

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 4: 提交**

```bash
git add src/main/bootstrap tests/main/bootstrap-shape.test.js
git commit -m "refactor: migrate bootstrap orchestration to TypeScript"
```

---

### Task 9: 迁移主入口 `src/main/index.ts` 与构建

**Files:**
- Rename: `src/main/index.js` → `src/main/index.ts`
- Modify: `package.json` 的 `main` 字段（保持可解析）
- Modify: `tsconfig.app.json`
- Test: 全套 vitest + 契约测试。

**Interfaces:**
- Consumes: 全部已迁移模块。
- Produces: 与现状完全一致的启动行为。

- [ ] **Step 1: 写失败测试**

新增 `tests/main/main-entry-requires.test.js`：动态 require `src/main/index.js`（旧）会因无 Electron 环境抛错，但 require 文件本身不应抛语法错；之后改为 require `src/main/index.ts` 路径（tsconfig 允许 require `.ts` 仅在 module 兼容时）。先 RED（迁 `.ts` 后 require 路径自动 follow）。

- [ ] **Step 2: 迁移 `src/main/index.ts`**

完全保留原 require 顺序、`app.setName`、`appendSwitch`、`whenReady()` 编排；按文件加显式类型。

- [ ] **Step 3: 验证 electron-builder 引用**

检查 `package.json` 的 `main` 字段仍指向 `src/main/index.js`（electron 不直接加载 `.ts`）。保持原值；electron-builder 通过 `prestart`/`build:preload` 已能编译 preload；主入口 `.js` → `.ts` 同样需要构建输出到 `dist/main/index.js`，或保留 electron-builder 加载源码 `.js`（如果仍存在）。本任务选择最小修改：

- 主入口保留 `src/main/index.ts`，不删除 `src/main/index.js`（避免 electron-builder `main` 字段中断）；
- 在 `package.json` 的 `prestart/build/dev` 中新增 esbuild `build:main`，把 `src/main/index.ts` 输出到 `src/main/index.js`，等价于"tsc 转 js 后覆盖原文件"。

详细做法：

```json
"build:main": "esbuild src/main/index.ts --bundle --platform=node --format=cjs --external:electron --outfile=src/main/index.js --target=es2020"
```

但 `--outfile=src/main/index.js` 会覆盖原文件并被 git 跟踪为改动。为避免污染：

- 改为 esbuild 输出到 `dist/main/index.js`；
- 在 `package.json` 把 `main` 字段从 `src/main/index.js` 改为 `dist/main/index.js`；
- electron-builder `files` 加入 `dist/main/**`。

或者更简单：保持主入口为 `.js`（即不迁移 `index.js`），只迁移 bootstrap / window / tray / ipc 子模块，由它们 import adapter 与 .js 文件。这是**修订备选方案**：本步骤允许根据实际情况二选一。

**简化选择**：本任务只迁移 `src/main/index.js` → `src/main/index.ts`，但同时：
- 在 `package.json` 的 `prestart/build/dev/build:main` 中用 esbuild 把 `index.ts` 输出到 `src/main/index.js`（覆盖原文件，但每次构建都从 .ts 重新生成，git diff 仅显示迁移差异）；
- 这样保持 `main: "src/main/index.js"` 不变，electron-builder 不变；
- `src/main/index.ts` 是唯一源码真相。

实现者需在 dispatch prompt 中选定该简化方案，并验证 `npm run build && electron-builder --mac --arm64 --x64 --publish never --dry-run`（或现有最轻量发布命令）能找到 `src/main/index.js`。

- [ ] **Step 4: 运行全量测试**

Run: `npm test -- --run --exclude tests/main/github-auth.test.js`
Expected: PASS（与第一阶段末态等价：463 files / 4792 passed / 4 skipped）。

Run: `npm run typecheck`
Expected: exit 0。

Run: `npm run build:preload && npm run build:main && npm run build:renderer`
Expected: 全部 exit 0，产物路径与第一阶段一致。

Run: `node --check dist/preload.js && node --check src/main/index.js`
Expected: exit 0。

Run: `git diff --check ea7b88a..HEAD`（baseline 仍为 plan commit）
Expected: exit 0。

- [ ] **Step 5: 提交**

```bash
git add src/main/index.ts src/main/index.js package.json tests/main/main-entry-requires.test.js
git commit -m "refactor: migrate main entry to TypeScript"
```

---

## 第二阶段总体验证

每个任务结束后运行：

- 定向 Vitest（仅测试本任务模块）
- `npm run typecheck`
- 完整 Vitest（排除 `github-auth.test.js`）

第二阶段全部完成后，最终门禁：

- `tsc -p tsconfig.preload.json && tsc -p tsconfig.app.json && tsc -p tsconfig.renderer.json && tsc -p tsconfig.tests.json` exit 0
- `npm test -- --run --exclude tests/main/github-auth.test.js` 全部 PASS
- `npm run build:preload && npm run build:main && npm run build:renderer` exit 0
- `git diff --check ea7b88a..HEAD` exit 0
- electron-builder 仍然能识别 `main` 与 preload 路径；产物名不变
- jsconfig 仍保留
- 第一阶段契约测试（preload contract、window type、bundle stub、行为化测试）全部仍 PASS

## 计划自检

- **范围控制**：本计划只迁移主进程边界，未涉及 renderer、业务子域、workers、scripts、tests 实现层，符合"Electron 运行边界"。
- **依赖顺序**：adapter → platform → 启动辅助 → state-store → window/tray → IPC core → IPC extended → IPC index → bootstrap → main entry。每批可在上一批基础上增量 typecheck。
- **类型严格度**：仅在 `tsconfig.app.json` 加 strictNullChecks 块；不在本阶段开全 strict。
- **运行时兼容**：所有现有 `tests/main/*.test.js` 仍 PASS；electron 入口路径、preload 路径、发布产物不变；`prestart`/`prebuild:mac*/build:main` 串联确保干净 checkout 可启动。
- **不引入 any/ts-ignore/新依赖**：adapters 内部允许 explicit any，但 ceiling 必须注释；其它代码统一 unknown + 类型守卫。
- **jsconfig 保留**：符合用户决定。
- **未涉及 workers**：第二阶段不迁 `src/workers/`；它们仍以 `.js` 形式被主进程 require；由第三阶段处理。
- **未迁移 ESM 业务子域**：本阶段 TS 主入口仍 `require("./ai-usage")` 等，由 Node CommonJS 解析；ESM 子目录保留 .js。
