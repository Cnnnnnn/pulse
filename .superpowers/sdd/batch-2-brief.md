# Batch 2: 顶层杂项模块迁 TypeScript

**范围（7 文件 / ~1366 行）：**
- `notification-policy.js` (81) — 7 处引用（check-runner/watchlist/digest 等）
- `last-opened.js` (160) — 2 处（schedulers/register-core）
- `release-notes.js` (93) — 1 处（index.ts）
- `reminders.js` (648) — 2 处（index.ts / register-reminders-recent）
- `chromium-http-client.js` (105) — 2 处（register-stock-detail/register-stocks）
- `app-icon.js` (211) — 1 处（platform/macos.ts）
- `app-icon-windows.js` (68) — 1 处（platform/windows.ts，懒加载）

**保留 .js shim 的位置：**
- `last-opened.js` 被 `schedulers.ts` / `register-core.ts` 无扩展名 require → 自动跟 .ts；但 shim 留着安全
- `release-notes.js` 被 `index.ts:526` 无扩展名 require → 自动跟 .ts
- `reminders.js` 被 `index.ts:77` 无扩展名 require + `register-reminders-recent.ts` 同 → 自动跟 .ts
- `chromium-http-client.js` 被两个 register-* 无扩展名 require → 自动跟 .ts
- `app-icon.js` 被 `platform/macos.ts:31` 无扩展名 require → 自动跟 .ts
- `app-icon-windows.js` 被 `platform/windows.ts:83` 无扩展名 require → 自动跟 .ts

**约束：** CJS + import type + require()；不动 build-main.cjs；bundle 契约串行；不新增测试。

## 步骤

- [ ] **Step 1:** 7 文件 → .ts
- [ ] **Step 2:** 验证

```bash
npm run typecheck
npm run build:main
node --check dist/main/index.js
npx vitest run tests/main/notification-policy.test.js tests/main/last-opened.test.js \
  tests/main/release-notes-loader.test.js tests/main/release-notes-state.test.js tests/main/register-core-release-notes.test.js \
  tests/main/reminders.test.js tests/main/chromium-http-client.test.js \
  tests/main/app-icon.test.js tests/main/app-icon-windows.test.js
npx vitest run tests/main/main-bundle-contract.test.js
npx vitest run tests/main/main-bundle-paths-contract.test.js
```

- [ ] **Step 3:** 提交 `refactor: migrate main-process top-level modules to TypeScript`

报告写 `.superpowers/sdd/batch-2-report.md`。