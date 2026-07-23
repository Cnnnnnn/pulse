# Batch 3: digest + search 子域

**范围（6 文件 / 857 行）：**
- `src/main/digest/aggregate.js` (182) — 1 处引用（register-core.ts）
- `src/main/digest/daily-summary-job.js` (236) — 1 处（index.ts）
- `src/main/search/build-docs.js` (154) — 0 直接 require，被 search-index 内部调用
- `src/main/search/highlight.js` (60) — 同上
- `src/main/search/search-index.js` (149) — 1 处（index.ts）
- `src/main/search/tokenizer.js` (76) — 同 build-docs

**约束：** CJS + import type + require()；保留 .js shim；不动 build-main.cjs；bundle 契约串行；不新增测试。

## 步骤

- [ ] **Step 1:** 6 文件 → .ts
- [ ] **Step 2:** 验证

```bash
npm run typecheck
npm run build:main
node --check dist/main/index.js
npx vitest run tests/main/digest/aggregate.test.js tests/main/search/search-index.test.js
# build-docs/highlight/tokenizer 是 search-index 间接调用；测 search-index 就够了
npx vitest run tests/main/main-bundle-contract.test.js
npx vitest run tests/main/main-bundle-paths-contract.test.js
```

- [ ] **Step 3:** 提交 `refactor: migrate digest and search to TypeScript`

报告写 `.superpowers/sdd/batch-3-report.md`。