# GitHub Storage Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收敛 GitHub 项目与设置的重复 localStorage 包装，同时保留不同的失败提示语义。

**Architecture:** 在现有 store 文件内使用接收 key 的 `readStorage` 和 `writeStorage`。`writeStorage` 通过 `reportFailure` 控制日志；项目持久化检查返回值并提示配额，设置持久化忽略返回值。

**Tech Stack:** Preact Signals、localStorage、Vitest。

## Global Constraints

- 项目数据写失败继续返回 false 并触发配额警告。
- 设置写失败继续静默走内存兜底。
- 不改变 storage key、JSON 结构或公开 API。
- 不新增文件或依赖。

---

### Task 1: 统一 GitHub store 存储包装

**Files:**

- Modify: `src/renderer/store/github-projects-store.js`
- Test: `tests/renderer/github-projects-store.test.js`
- Test: `tests/renderer/github-token-flow.test.js`
- Test: `tests/renderer/github-import-export.test.js`

- [ ] **Step 1: 运行 GitHub store 行为锁**

```bash
npx vitest run tests/renderer/github-projects-store.test.js tests/renderer/github-token-flow.test.js tests/renderer/github-import-export.test.js
```

Expected: 全部通过。

- [ ] **Step 2: 统一读写助手**

把 `readStore/readSettings` 合并为 `readStorage(key)`；把 `writeStore/writeSettings` 合并为 `writeStorage(key, raw, reportFailure = false)`。所有失败均写入 `_mem`，仅 `reportFailure=true` 时记录 warning。

- [ ] **Step 3: 保留调用方失败语义**

项目 `persist()` 传 `reportFailure=true` 并检查布尔返回值；`persistSettings()` 不检查返回值，因此继续静默。

- [ ] **Step 4: 运行行为锁**

```bash
npx vitest run tests/renderer/github-projects-store.test.js tests/renderer/github-token-flow.test.js tests/renderer/github-import-export.test.js
```

Expected: 正常持久化、token 恢复、配额警告 debounce 和批量导入全部通过。

- [ ] **Step 5: 检查差异**

```bash
git diff --check
git diff --stat
```

Expected: 只减少重复存储包装，公开导出不变。
