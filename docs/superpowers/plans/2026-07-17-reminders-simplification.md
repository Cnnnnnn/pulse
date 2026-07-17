# Reminders Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除提醒输入校验和日期构造中的重复代码，同时保持错误码、调度算法和 DST 行为。

**Architecture:** 在 `reminders.js` 内增加私有字段校验助手，create 与 patch 继续控制字段是否必填。`_computeNextFireTime` 复用单个当前日期基准，但保留逐日推进与 safety 防线。

**Tech Stack:** Node.js CommonJS、Vitest。

## Global Constraints

- 不改变任何公开 API 或错误码。
- 不改变 daily、weekdays、weekly 的逐日推进算法。
- 不新增文件或依赖。

---

### Task 1: 收敛提醒校验与日期基准

**Files:**

- Modify: `src/main/reminders.js`
- Test: `tests/main/reminders.test.js`
- Test: `tests/renderer/reminders-store.test.js`

- [ ] **Step 1: 运行提醒行为锁**

```bash
npx vitest run tests/main/reminders.test.js tests/renderer/reminders-store.test.js
```

Expected: 全部通过。

- [ ] **Step 2: 增加私有校验助手**

实现 `_validationError`、`_validateTitle`、`_validateTriggerAt`、`_validateRepeat`、`_validateWeekday`。create 校验全部必填字段；patch 仅校验实际提供的字段。

- [ ] **Step 3: 复用单个当前日期**

在 `_computeNextFireTime` 中创建一次 `const current = new Date(now)`，daily、weekdays、weekly 均从它的年月日构造候选时间。

- [ ] **Step 4: 运行行为锁**

```bash
npx vitest run tests/main/reminders.test.js tests/renderer/reminders-store.test.js
```

Expected: 全部通过，错误码和下次触发时间断言不变。

- [ ] **Step 5: 检查差异**

```bash
git diff --check
git diff --stat
```

Expected: 校验分支减少，日期算法结构不变。
