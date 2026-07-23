# Batch 1: 顶层枢纽模块迁 TypeScript

**范围（8 文件 / ~1363 行）：**
- `tray-menu-prefs.js` (48) — 7 处被引用
- `check-runner.js` (261) — 4 处
- `watchlist.js` (383) — 5 处
- `run-check-deps.js` (71) — 4 处
- `metal-ipc.js` (349) — 3 处（含 index.ts 显式 `metal-ipc.js`）
- `error-guard.js` (156) — 1 处
- `config-portability.js` (95) — 1 处

**已迁依赖（用显式 .ts）：** `state-store.ts` `tray.ts` `bootstrap/schedulers.ts` `bootstrap/send-to-renderer.ts` `ipc/register-*.ts` `index.ts`

**关键约束：**
- CJS + import type + require()；Node CJS 自动解析无扩展名 → .ts
- **不要删除 `.js` shim**，除非所有引用都已切到显式 `.ts` —— 详见 Batch 0 经验
- `metal-ipc` 被 `index.ts:76` 显式 `require("./metal-ipc.js")`；Batch 1 迁完后保留 `.js` 不动，把 index.ts 改 `.ts` 引用（Phase 3 不在批 1 范围，留给 Batch 9 兜底）
- `tray-menu-prefs` 已是显式 `tray-menu-prefs.js`（state-store.ts 也有同样问题）；同样留 `.js` shim
- 不要改 build-main.cjs；bundle 契约串行
- 不新增测试；不写 shape test（每个都有现成测试覆盖）
- `watchlist.js` 已被 `metal-ipc.js` 用 `require("./watchlist")`（CJS 无扩展名，自动跟 .ts）；无需改路径

## 步骤

- [ ] **Step 1:** 8 文件 → .ts（保留 .js shim，因部分调用方用显式 .js）
- [ ] **Step 2:** 验证

```bash
npm run typecheck
npm run build:main
node --check dist/main/index.js
npx vitest run tests/main/check-runner.test.js tests/main/check-runner-queued.test.js \
  tests/main/run-check-deps.test.js tests/main/watchlist.test.js \
  tests/main/register-core-watchlist.test.js tests/main/metal-ipc.test.js tests/main/metal-ipc-history.test.js \
  tests/main/error-guard.test.js tests/main/config-portability.test.js tests/main/register-config-portability.test.js \
  tests/main/tray-menu-prefs.test.js tests/main/tray-build-menu-prefs.test.js
npx vitest run tests/main/main-bundle-contract.test.js
npx vitest run tests/main/main-bundle-paths-contract.test.js
```

- [ ] **Step 3:** 提交 `refactor: migrate main-process top-level hubs to TypeScript`

报告写 `.superpowers/sdd/batch-1-report.md`。