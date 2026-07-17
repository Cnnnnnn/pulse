# Fund Format Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让基金概览和 Hero 复用现有格式化单一来源，删除完全重复的金额与百分比函数。

**Architecture:** 仅增加指向 `src/funds/format.js` 的现有模块导入，并删除两个组件内语义完全一致的函数。保留 `FundList`、`FundDetail` 的本地实现，因为它们会强制转换数字字符串且无效值文案不同。

**Tech Stack:** Preact、CommonJS/ESM interop、Vitest、esbuild。

## Global Constraints

- 不改变任何格式化输出。
- 不新增文件或依赖。
- 不修改风险映射。
- 不修改 `FundList.jsx` 或 `FundDetail.jsx`。

---

### Task 1: 复用基金格式化模块

**Files:**

- Modify: `src/renderer/funds/FundDashboard.jsx`
- Modify: `src/renderer/funds/FundHero.jsx`
- Test: `tests/renderer/fund-hero.test.jsx`
- Test: `tests/renderer/fund-card.test.jsx`
- Test: `tests/renderer/fund-pnl-history.test.jsx`

- [ ] **Step 1: 运行现有行为锁**

```bash
npx vitest run tests/renderer/fund-hero.test.jsx tests/renderer/fund-card.test.jsx tests/renderer/fund-pnl-history.test.jsx
```

Expected: 全部通过。

- [ ] **Step 2: 导入现有函数并删除重复实现**

两个组件均从 `../../funds/format.js` 导入：

```js
import { fmtCurrency, fmtPct } from "../../funds/format.js";
```

删除各自文件内的同名 `fmtCurrency`、`fmtPct` 函数，不改调用点。

- [ ] **Step 3: 运行行为锁与构建**

```bash
npx vitest run tests/renderer/fund-hero.test.jsx tests/renderer/fund-card.test.jsx tests/renderer/fund-pnl-history.test.jsx
npm run build:renderer
```

Expected: 测试与构建均通过。

- [ ] **Step 4: 检查差异**

```bash
git diff --check
git diff --stat
```

Expected: 仅两个组件新增 import 并删除重复函数，总代码行减少。
