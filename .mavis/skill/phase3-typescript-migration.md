---
name: phase3-typescript-migration
description: Phase 3 TypeScript 迁移 — Pulse main 进程 .ts 化 + 双 build 链管理
---

# Phase 3 TypeScript Migration — Pulse

> Pulse main 进程从手写 .js 迁移到 .ts 的标准化流程。**Phase 3 Batch 0–9 完成**：
> - 业务真相只在 `.ts`
> - 生产：`scripts/build-main.cjs` → `dist/main/index.js`
> - 测试：`build-main-ts.cjs` → `dist-test/**/*.cjs` + `requireMain()` / `requirePlatform()`
> - 例外 shim（给仍是 JS 的 `src/ai`/`workers`/…）：`http-client`/`state-store`/`token-budget`/`log`/`platform/index`
>
> 本 skill 教你怎么：
> 1. 加新 `.ts` module 时**不漏双导出**（`module.exports` + `export function` 同存）
> 2. **强制 rebuild** `dist-test`（mtime 缓存不刷新时）
> 3. 测试用 `requireMain("path/mod")`；`require.cache` stub 用 `mainArtifactPath(...)`
> 4. **手动跑生产 build** 验证
> 5. 非 main JS 若必须 require main，走上述例外 shim（`.js`），不要直接 require `.ts`（vitest 会当 ESM 炸）

## 何时触发

- 看到 `git status` 列出一堆 `M src/main/...js` （60+ 个文件全是 +7/-N 行）
- `npm test` 报 `Cannot use import statement outside a module` 或 `Unexpected token 'export'`
- `require('./module')` 拿不到 export 的函数（症状：`sortValue is not a function`，但 esbuild `__export` 显示有）
- 加新 fetcher / 新 IPC handler 时
- 同事问"为什么手写 .js 跟 .ts 内容不一样"

## 双 build 链（v2.79.4 状态）

```
src/main/X.ts  ─┐
                ├─→ esbuild ─→ dist-test/main/per-file/X.cjs (dev/test 链)
src/main/X.js  ─┘              ↓
   (5 行 shim)             business .js shim 走 .cjs
                └─→ build-main.cjs esbuild bundle → dist/main/index.js (prod 链)
                                      ↓
                               require 走 .js shim → .ts
```

- **dev/test 链**：`tests/_setup/build-main-ts.cjs` 跑，mtime cache 判定
- **prod 链**：`scripts/build-main.cjs` 跑，每次都 bundle 全部

## 关键踩坑

### 1. `module.exports` 覆盖 `export function`（必踩）

esbuild 编 .ts 时混合输出：
```js
// 头几行
var X_exports = {};
__export(X_exports, { myFunc: () => myFunc });
module.exports = __toCommonJS(X_exports);

// 末尾覆盖
module.exports = {
  myFunc,    // ← 必须在这里列！
  otherFunc,
};
```

**新加的 `export function` 必须同步到底部 `module.exports = {...}`**。`export { X }` 重复声明会报 "Multiple exports with the same name"。

**症状**：`const { myFunc } = require('./X.cjs')` 拿到 `undefined`，但 `__export` 输出显示有。

**修法**：直接追加到底部 `module.exports` 列表，**不**加 `export { X }` 重导出。

### 2. mtime 缓存不刷新（必踩）

`tests/_setup/build-main-ts.cjs` 用 mtime 对比决定 rebuild。**手动 `touch src/main/X.ts` 仍可能不 rebuild**（边缘 case）。

**强制 rebuild 唯一稳的办法**（sandbox 友好）：
```bash
# 1. mv 走 cjs 强制 build 触发
mv dist-test/main/per-file/X.cjs dist-test/main/per-file/X.cjs.tmp
# 2. 跑 vitest 触发 build
npx vitest run tests/path/to/X.test.js
# 3. 恢复 cjs（如果是 sanity check 用途）
mv dist-test/main/per-file/X.cjs.tmp dist-test/main/per-file/X.cjs
```

注意：上一步如果 build 失败（报 syntax error），可能 cjs 没生成——查 dist-test 目录确认。

### 3. 业务 .js shim 模板（5 行）

```js
// Phase 3 shim: vitest createRequire → dist-test .cjs; build-main/esbuild → .ts.
const _fs = require("fs");
const _path = require("path");
const _cjs = _path.join(__dirname, "../../../dist-test/main/per-file/<dir>/X.cjs");
module.exports = _fs.existsSync(_cjs) ? require(_cjs) : require("./X.ts");
```

**新加 .ts module 时必须配套 .js shim**（同目录）。否则 aggregator.cjs require `./X.ts` 时 Node 18 不解 .ts（ESM 错）。

### 4. 双导出范式 — `default` import 走错分支

esbuild 编出的 .cjs **带 `__esModule: true` 标记**：
```js
module.exports = __toCommonJS(X_exports);  // 内含 __esModule: true
```

如果调用方按 ESM 语义 `import myFunc from './X.cjs'`：
- cjs default 拿不到（被 `__esModule` 骗走 ESM 路径）
- named export 拿 getter 而非值（懒求值）

Pulse 的 `aggregator.cjs` / `ranking.cjs` 都有这个现象，**Pulse 调用方都用 CommonJS `require`** 所以**没踩**，但新加的 .ts 要小心。

## 加新 .ts module 标准化流程

### 步骤

1. **写 `.ts` 文件**：
   - 顶部 `export function X` / `export const X`
   - 末尾 `module.exports = { X, ...已有 }`（**必须**列新加的）
2. **写 `.js` shim**（5 行 Phase 3 模板）—— 同目录
3. **强制 rebuild dist-test**：`mv dist-test/main/per-file/<dir>/X.cjs dist-test/main/per-file/<dir>/X.cjs.tmp` 后跑 vitest
4. **写测试** `tests/main/<dir>/X.test.js` —— 纯函数 + normalize + 集成
5. **跑 typecheck**：`npx tsc -p tsconfig.app.json --noEmit`
6. **跑全部测试**：`npx vitest run tests/`

### 检查清单

- [ ] `export function X` 跟 `module.exports = { X, ... }` 都列了
- [ ] `.js` shim 5 行模板 + 正确路径（`../../../dist-test/main/per-file/<dir>/X.cjs`）
- [ ] `dist-test/main/per-file/<dir>/X.cjs` rebuild 成功（强制 rebuild 后跑一次 `npx vitest run`）
- [ ] 测试覆盖 normalize + fetch mock（不要打真实网络）
- [ ] typecheck 无错
- [ ] 全部测试 pass

## 验证脚本

跑完上面流程后**必跑**：

```bash
# 1. typecheck 4 个 config
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.tests.json --noEmit
npx tsc -p tsconfig.renderer.json --noEmit
npx tsc -p tsconfig.preload.json --noEmit

# 2. 跑 ai-leaderboard 全部测试（schema 契约最严格）
npx vitest run tests/ai-leaderboard/ tests/main/ai-leaderboard-*.test.js

# 3. 检查有没有 untracked 残留
git status
```

如果 `git status` 出现新的 `M src/main/X.js`（不是 shim 化的 7+ → 5 行模式），说明 .ts → .cjs 走 `external` 失败，**build 不走 native cjs**——查 build-main-ts.cjs 的 `externalize-src-deps` 逻辑。

## 关联

- `~/.minimax/agents/mavis/memory/MEMORY.md` 的 "## TypeScript / esbuild 踩坑" + "## Pulse 项目专属" 小节（高频踩坑完整版）
- `AGENTS.md` 项目级入口（cold-start AI agent 必读）
- `tests/_setup/build-main-ts.cjs` 实际缓存判定逻辑（看 needBuild 段）
- `scripts/build-main.cjs` 生产 bundle 逻辑
