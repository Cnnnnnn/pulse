# Phase 7: src/.ts ESM-ify + 删 shim (重启版)

## TL;DR

原 Phase 7 Batch 1 (`c064dcf`) 撤回 (commit `b8c860a` 状态). Phase 5 时 .ts
保留 CJS require()/module.exports 是为了兼容 shim 调用方, 现在删 shim
必须先 ESM-ify 150 个 .ts.

**2 阶段**:
- **7a**: 150 个 src/.ts 内部 `require()` → `import`, `module.exports = {…}` → `export`
- **7b**: 130 个 src/**/*.js shim 全删, vitest `resolve.extensions` 加 `.ts`

## 决策

- ✅ 7a + 7b 都做
- ✅ 保留 dist-test 产物 (build-main-ts 适配 .ts)
- ✅ vitest config 加 `resolve.extensions: ['.ts', '.tsx', '.js']`
- ❌ 不动 prod build (`scripts/build-main.cjs` esbuild 已支持 .ts)
- ❌ 不动 src/.ts → test 跨 src/ 的导入 (用现有 ESM `import`)

## 7a 实现步骤

**1 文件内模式** — 改两种结构:
```ts
// before (CJS):
const { Foo } = require("./foo");
const foo = require("./foo");
module.exports = { Bar };

// after (ESM):
import { Foo } from "./foo";  // 或 import foo from "./foo";
export { Bar };  // 或 export const Bar = …
```

**2 顺序**: 由 leaf 改起 (utils/detectors/base 之类) — 自下而上避免循环依赖.

**3 风险点**:
- `.ts` 顶部混用 `import` + `require()` 时, vitest 编译后的 ESM-style `import` 不能动态条件
  — 确认所有 import 都是 top-level 静态
- `module.exports = { X }` 跟 `export X` 双导出 — Phase 5 的 dual export 范式 (兼容 shim 调用)
  现在不需要, 简化成单 `export X`
- `require()` 动态参数 (template literal, variable) — 这种要保留 `require()` 或改成 ESM 动态
  import (require 动态参数会保留成 CJS)

**4 批量切分** (避免一次改 150 文件炸 git):
- **7a-1**: `src/utils/` 5 文件 (基础工具)
- **7a-2**: `src/detectors/` 30 文件 (detector 实现)
- **7a-3**: `src/metals/` 5 文件 + `src/funds/` 10 文件 + `src/stocks/` 10 文件
- **7a-4**: `src/ai/` 10 文件 + `src/ai-usage/` 12 文件 + `src/ai-sessions/` 5 文件
- **7a-5**: `src/workers/` 10 文件 + `src/release-notes/` 2 文件
- **7a-6**: `src/main/` 60 文件 (大目录, IPC handlers + games + worldcup + ithome + wechat-hot + ai-leaderboard + bootstrap)
- **7a-7**: `src/platform/` 2 文件 (例外, 但 .js shim 还在所以可最后改)

**5 测试驱动**: 每批跑 `npm test` + `npm run typecheck`. red 就回滚该批.

## 7b 实现步骤

**1**: `git rm src/**/*.js` — 130 文件
**2**: `vitest.config.js`:
```js
resolve: { extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'], alias: […] }
```
**3**: `tests/_setup/build-main-ts.cjs` 加 .tsx loader (已有 .ts)
**4**: `npm test` 全跑

## 关键验证

- `npm test` 全绿 (4873 tests + 0 fail)
- `npm run typecheck` 全绿
- `find src -name "*.js" ! -cjs` 返回 0 行
- `grep -r "require(['\"]\\./" src --include="*.ts"` 返回 0 行
- `grep -r "module\\.exports" src --include="*.ts"` 返回 0 行 (renderer 共享的 export-only 文件除外)

## 风险

- ESM-ify 触发循环依赖检测 (vitest 比 esbuild 严)
- TypeScript `verbatimModuleSyntax: true` 在 strict 模式可能要开
- ESM 互操作: `__esModule` 标签需要校验

## File List

- 150 src/.ts
- 130 src/.js (shim)
- vitest.config.js
- tests/_setup/build-main-ts.cjs
- AGENTS.md (不要做删 shim 那条改成 .ts 完成)