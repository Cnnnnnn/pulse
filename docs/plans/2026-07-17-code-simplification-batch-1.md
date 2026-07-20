# Code Simplification Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除分类模块的无消费者状态与重复循环，并清理主进程启动编排中的无效参数和历史注释，同时保持全部外部行为不变。

**Architecture:** 本批只做两个模块内的局部简化，不新增文件、依赖或共享抽象。公开 API、IPC、持久化格式和启动顺序保持不变；当前未提交的 Games 文件不触碰。

**Tech Stack:** Node.js CommonJS、Electron、Vitest、esbuild。

## Global Constraints

- 不改变外部行为。
- 不新增依赖或框架。
- 不修改当前 Games 工作区。
- 只删除仓库内无消费者的内部状态或参数。
- 每个任务独立运行聚焦测试。
- 未获得明确授权前不创建 Git commit。

---

### Task 1: 简化分类状态与计数循环

**Files:**

- Modify: `src/config/category.js:46-55, 87, 161, 210-241, 373-397, 420-443`
- Test: `tests/config/category.test.js`
- Test: `tests/config/category-llm.test.js`
- Test: `tests/main/bootstrap-category.test.js`

**Interfaces:**

- Consumes: `setData({ cats, map, source })` 注入的分类和映射。
- Produces: 保持现有 `getCategoryTabsWithCount(results)`、LLM cache API 和测试辅助 API；删除无消费者的 `_DEFAULT_MAPPING`、`_LLM_CLASSIFY_TS`。

- [ ] **Step 1: 运行分类行为锁**

Run:

```bash
npx vitest run tests/config/category.test.js tests/config/category-llm.test.js tests/main/bootstrap-category.test.js
```

Expected: 3 个测试文件全部通过。

- [ ] **Step 2: 删除无消费者状态**

删除 `DEFAULT_MAPPING`、`LLM_CLASSIFY_TS` 及其写入、清理和导出。同步把 `getCategory` 注释中的第一层来源改为 `setData 注入的静态 map`。仓库搜索已确认这些标识只在 `src/config/category.js` 内出现。

- [ ] **Step 3: 将 Map 与 Iterable 计数统一为单循环**

用一个 names iterable 保留现有优先级：对象存在 `.keys()` 时使用 keys，否则直接按 iterable 遍历。

```js
const names =
  results && typeof results.keys === "function" ? results.keys() : results;
if (names && typeof names[Symbol.iterator] === "function") {
  for (const name of names) {
    const cat = getCategory(typeof name === "string" ? name : "");
    counts.set(cat, (counts.get(cat) || 0) + 1);
    total += 1;
  }
}
```

- [ ] **Step 4: 重新运行分类行为锁**

Run:

```bash
npx vitest run tests/config/category.test.js tests/config/category-llm.test.js tests/main/bootstrap-category.test.js
```

Expected: 与 Step 1 相同，全部通过。

- [ ] **Step 5: 审阅差异**

Run:

```bash
git diff -- src/config/category.js
```

Expected: 只有死状态删除、注释纠正和重复循环合并；没有公开函数签名或返回结构变化。

---

### Task 2: 清理主进程启动编排噪音

**Files:**

- Modify: `src/main/index.js:124-178, 180-214, 240-270, 665-760, 762-905`
- Test: `tests/main/load-smoke.test.js`
- Test: `tests/main/schedulers-self-update.test.js`
- Test: `tests/main/bootstrap-category.test.js`

**Interfaces:**

- Consumes: `startSelfUpdateTimer({ getPowerIdleState, logSkip })`。
- Produces: `initSelfUpdateTimer({ getTrayMgr })` 返回值和 bootstrap 顺序保持不变。

- [ ] **Step 1: 运行启动行为锁**

Run:

```bash
npx vitest run tests/main/load-smoke.test.js tests/main/schedulers-self-update.test.js tests/main/bootstrap-category.test.js
```

Expected: 3 个测试文件全部通过。

- [ ] **Step 2: 删除无效上下文参数**

将：

```js
const ctx = { getTrayMgr: () => trayMgr, runtimeConfigRef };
```

改为：

```js
const ctx = { getTrayMgr: () => trayMgr };
```

`initSelfUpdateTimer` 从未读取 `runtimeConfigRef`。

- [ ] **Step 3: 删除未消费的自更新依赖**

从 `startSelfUpdateTimer` 调用参数中删除：

```js
getCurrentVersion: () => app.getVersion(),
```

`src/main/bootstrap/schedulers.js` 没有读取 `deps.getCurrentVersion`。

- [ ] **Step 4: 压缩历史式注释**

删除或改写 `Phase`、`Task`、版本号和“之前如何修复”的注释，只保留下列真实约束：

- `app.setName("pulse")` 必须早于 `app.whenReady()`，以兼容旧 safeStorage service name。
- category 历史 cache 必须同步注入，LLM 分类保持 fire-and-forget。
- metals IPC 必须在 renderer 可能 invoke 前同步注册。
- state recovery 必须早于其它 state 读取。
- self-update controller 必须早于 IPC 注册。
- bootstrap 完成后才能调用 `markBootstrapDone()`。

不移动语句、不改变 try/catch、timer 或生命周期注册。

- [ ] **Step 5: 重新运行启动行为锁和 renderer 构建**

Run:

```bash
npx vitest run tests/main/load-smoke.test.js tests/main/schedulers-self-update.test.js tests/main/bootstrap-category.test.js
npm run build:renderer
```

Expected: 测试全部通过，renderer bundle 构建成功。

- [ ] **Step 6: 审阅差异**

Run:

```bash
git diff -- src/main/index.js
```

Expected: 只有未使用参数和注释减少；执行语句顺序及数量不变。

---

### Task 3: 批次级回归验证

**Files:**

- Verify: `src/config/category.js`
- Verify: `src/main/index.js`

**Interfaces:**

- Consumes: Tasks 1–2 的局部简化。
- Produces: 可进入下一批清理的绿色行为基线。

- [ ] **Step 1: 运行完整测试**

Run:

```bash
npm test -- --run
```

Expected: 不少于当前基线的 425 个测试文件通过，既有 4 项 skipped 不增加。

- [ ] **Step 2: 运行 renderer 构建**

Run:

```bash
npm run build:renderer
```

Expected: exit code 0。

- [ ] **Step 3: 检查工作区边界**

Run:

```bash
git status --short
git diff --check
```

Expected: 本批只新增此计划并修改 `src/config/category.js`、`src/main/index.js`；Games 相关改动内容不变；没有空白错误。

- [ ] **Step 4: 暂停提交**

汇报测试结果和实际变更。只有用户明确要求创建 commit 时，才按仓库 Conventional Commits 规则提交。
