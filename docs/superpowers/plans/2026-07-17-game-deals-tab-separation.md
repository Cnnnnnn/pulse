# 游戏优惠标签与喜+1隔离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除游戏平台栏的“全部”标签并默认选择 Steam，同时确保喜+1条目不会出现在折扣列表中。

**Architecture:** 渲染层只调整平台元数据和默认 signal，不改变平台切换流程。主进程聚合层在最终 `deals` 分支统一排除 `isFree`，保留内部 `platform=all` 与热门 Top10 的现有能力。

**Tech Stack:** JavaScript、Preact Signals、Vitest

## Global Constraints

- 不新增依赖或抽象。
- `platform=all` 后端能力继续保留。
- “热门 Top10”允许出现喜+1条目。
- 未经用户明确要求，不创建 Git commit。

---

### Task 1: 删除“全部”平台标签并默认选择 Steam

**Files:**
- Create: `tests/renderer/games-store.test.js`
- Modify: `src/renderer/games/gamesStore.js:12-38`
- Modify: `src/renderer/games/PlatformTabs.jsx:1-3`

**Interfaces:**
- Consumes: `PLATFORMS: Array<{key:string,label:string,emoji:string}>`
- Produces: `activePlatform.value === "steam"`；平台列表首项为 Steam 且不含 `all`

- [ ] **Step 1: 写入失败测试**

创建 `tests/renderer/games-store.test.js`：

```js
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/api.js", () => ({
  api: { getGameDeals: vi.fn() },
}));

import {
  PLATFORMS,
  activePlatform,
} from "../../src/renderer/games/gamesStore.js";

describe("gamesStore 平台默认值", () => {
  it("不提供全部平台标签并默认选择 Steam", () => {
    expect(PLATFORMS.map((platform) => platform.key)).toEqual([
      "steam",
      "epic",
      "xbox",
      "playstation",
      "switch",
    ]);
    expect(activePlatform.value).toBe("steam");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/renderer/games-store.test.js`

Expected: FAIL，实际平台 key 仍包含 `all`，且 `activePlatform.value` 为 `"all"`。

- [ ] **Step 3: 实现最小渲染层改动**

在 `src/renderer/games/gamesStore.js` 中删除：

```js
{ key: "all", label: "全部", emoji: "🎮" },
```

并修改默认值：

```js
export const activePlatform = signal("steam");
```

同步更新 `src/renderer/games/PlatformTabs.jsx` 文件头注释：

```js
/**
 * src/renderer/games/PlatformTabs.jsx — 平台分类切换 (Steam / Epic / …)。
 */
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/renderer/games-store.test.js`

Expected: PASS，1 个测试通过。

---

### Task 2: 在折扣聚合结果中统一排除喜+1

**Files:**
- Modify: `tests/main/games/aggregator.test.js:49-54,190-213`
- Modify: `src/main/games/aggregator.js:212-223`

**Interfaces:**
- Consumes: 规范化条目的 `isFree: boolean`
- Produces: `getGameDeals({ mode: "deals" })` 返回的所有条目均满足 `isFree === false`

- [ ] **Step 1: 为现有 Switch 假数据加入会泄漏到折扣模式的免费条目**

在 `tests/main/games/aggregator.test.js` 的 `switchAlgolia.hits` 中加入：

```js
{
  nsuid: "70010000003",
  objectID: "3",
  title: "Free Weekend Game",
  price: { finalPrice: 0, regPrice: 20, percentOff: 100 },
  productImageSquare: "https://img/free.jpg",
  url: "/games/free-weekend-game",
},
```

- [ ] **Step 2: 写入失败测试**

在 `describe("getGameDeals — mode=deals sort 三分支")` 内新增：

```js
it("排除 isFree 的喜+1条目", async () => {
  const res = await getGameDeals({
    platform: "switch",
    mode: "deals",
  });

  expect(res.items.some((item) => item.title === "Free Weekend Game")).toBe(false);
  expect(res.items.every((item) => item.isFree === false)).toBe(true);
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/main/games/aggregator.test.js -t "排除 isFree"`

Expected: FAIL，`Free Weekend Game` 仍存在于折扣结果。

- [ ] **Step 4: 在聚合层实现统一过滤**

将 `src/main/games/aggregator.js` 的折扣分支改为：

```js
} else {
  // deals / all：排除喜+1，再按折扣门槛过滤 + 排序
  items = items.filter((it) => !it.isFree);
  if (minSavings > 0) {
    items = items.filter((it) => it.savings >= minSavings);
  }
  items = sortDeals(items, sort);
}
```

- [ ] **Step 5: 运行聚合测试确认通过**

Run: `npx vitest run tests/main/games/aggregator.test.js`

Expected: PASS，包含新增隔离测试、现有喜+1测试和 Top10 测试。

- [ ] **Step 6: 运行完整验证**

Run: `npx vitest run tests/renderer/games-store.test.js tests/main/games/aggregator.test.js && npm run build:renderer`

Expected: 两个测试文件全部 PASS，renderer 构建成功且命令退出码为 0。
