# 后台检测智能时间窗 (C4) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** auto-check 在 quiet hours 内跳过检测（不只压通知），quiet hours 结束后自动补跑一次，消除"夜里空跑 API + 发热"的浪费。

**Architecture:** 在 `startAutoCheckTimer` 内引入 `lastAutoCheckAt` 闭包状态 + 抽出 `decideAutoCheck`（纯决策函数）和 `checkOnce`（执行函数），照搬 `daily-summary-job.js` 的可测性模式（`{ stop, triggerNow }` + `__resetForTest`）。顺带把 config 取值从启动快照 `runtimeConfig` 改为实时 `runtimeConfigRef.current`，让 quiet hours 配置热生效。

**Tech Stack:** Node.js (Electron main process), CommonJS, vitest (node environment, `pool: forks`)

**Spec:** `docs/superpowers/specs/2026-06-23-check-throttle-quiet-hours-design.md`

---

## 文件结构

| 文件 | 责任 | 操作 |
| --- | --- | --- |
| `src/main/bootstrap/schedulers.js` | `startAutoCheckTimer` 改造：新增 `decideAutoCheck` + `checkOnce`，返回 `{ stop, triggerNow }` + `__resetForTest`；config 取值改 `runtimeConfigRef` | Modify |
| `src/main/index.js` | `startAutoCheckTimer` 传参从 `runtimeConfig` 改 `runtimeConfigRef`（1 处） | Modify |
| `tests/main/schedulers-auto-check.test.js` | `decideAutoCheck` 纯函数 7 case + `checkOnce`/`startAutoCheckTimer` 集成 case | Create |

---

## Task 1: 纯决策函数 `decideAutoCheck`（TDD）

**Files:**
- Modify: `src/main/bootstrap/schedulers.js`（文件顶部 require 区之后插入新函数）
- Test: `tests/main/schedulers-auto-check.test.js`

- [ ] **Step 1: 写失败测试 — `decideAutoCheck` 7 个 case**

创建 `tests/main/schedulers-auto-check.test.js`：

```js
/**
 * tests/main/schedulers-auto-check.test.js
 *
 * C4: 后台 auto-check 智能时间窗. decideAutoCheck 是纯决策函数,
 * checkOnce 是执行函数 (内部调 decideAutoCheck + runCheckQueued).
 * startAutoCheckTimer 暴露 { stop, triggerNow } 便于测试, 照搬
 * daily-summary-job 的可测性模式.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  decideAutoCheck,
  startAutoCheckTimer,
  __resetForTest,
} from '../../../src/main/bootstrap/schedulers.js';

describe('decideAutoCheck', () => {
  const INTERVAL = 6 * 60 * 60 * 1000; // 6h

  it('returns run when quiet hours not configured', () => {
    expect(
      decideAutoCheck({
        now: new Date('2026-06-23T03:00:00'),
        quietStart: null,
        quietEnd: null,
        lastAutoCheckAt: null,
        intervalMs: INTERVAL,
      }),
    ).toEqual({ action: 'run' });
  });

  it('returns skip/quiet_hours inside cross-midnight quiet window', () => {
    expect(
      decideAutoCheck({
        now: new Date('2026-06-23T03:00:00'),
        quietStart: '23:00',
        quietEnd: '08:00',
        lastAutoCheckAt: null,
        intervalMs: INTERVAL,
      }),
    ).toEqual({ action: 'skip', reason: 'quiet_hours' });
  });

  it('returns skip/quiet_hours inside same-day quiet window', () => {
    expect(
      decideAutoCheck({
        now: new Date('2026-06-23T12:00:00'),
        quietStart: '09:00',
        quietEnd: '17:00',
        lastAutoCheckAt: null,
        intervalMs: INTERVAL,
      }),
    ).toEqual({ action: 'skip', reason: 'quiet_hours' });
  });

  it('returns run when quiet hours ended and lastAutoCheckAt is null (catch-up)', () => {
    expect(
      decideAutoCheck({
        now: new Date('2026-06-23T09:00:00'),
        quietStart: '23:00',
        quietEnd: '08:00',
        lastAutoCheckAt: null,
        intervalMs: INTERVAL,
      }),
    ).toEqual({ action: 'run' });
  });

  it('returns skip/too_soon when within interval of last check', () => {
    const now = new Date('2026-06-23T10:00:00');
    const twoHoursAgo = now.getTime() - 2 * 60 * 60 * 1000;
    expect(
      decideAutoCheck({
        now,
        quietStart: null,
        quietEnd: null,
        lastAutoCheckAt: twoHoursAgo,
        intervalMs: INTERVAL,
      }),
    ).toEqual({ action: 'skip', reason: 'too_soon' });
  });

  it('returns run when beyond interval of last check', () => {
    const now = new Date('2026-06-23T10:00:00');
    const sevenHoursAgo = now.getTime() - 7 * 60 * 60 * 1000;
    expect(
      decideAutoCheck({
        now,
        quietStart: null,
        quietEnd: null,
        lastAutoCheckAt: sevenHoursAgo,
        intervalMs: INTERVAL,
      }),
    ).toEqual({ action: 'run' });
  });

  it('quiet_hours takes priority over too_soon', () => {
    const now = new Date('2026-06-23T03:00:00');
    const recent = now.getTime() - 60_000; // 1 分钟前
    expect(
      decideAutoCheck({
        now,
        quietStart: '23:00',
        quietEnd: '08:00',
        lastAutoCheckAt: recent,
        intervalMs: INTERVAL,
      }),
    ).toEqual({ action: 'skip', reason: 'quiet_hours' });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/main/schedulers-auto-check.test.js`
Expected: FAIL — `decideAutoCheck is not a function`（尚未导出）

- [ ] **Step 3: 实现 `decideAutoCheck` 并导出**

在 `src/main/bootstrap/schedulers.js` 的 `require` 区块之后（`const { setManagedInterval, clearManaged } = require("../timer-registry");` 这行之后）、第一个函数定义之前，插入：

```js
/**
 * C4: 纯决策函数 — 判断本次 auto-check tick 应该 run 还是 skip.
 * 不读外部状态, 所有输入通过参数传入, 便于直接单测.
 *
 * @param {object}  args
 * @param {Date}    args.now
 * @param {string|null} args.quietStart  "HH:MM" 或 null
 * @param {string|null} args.quietEnd    "HH:MM" 或 null
 * @param {number|null} args.lastAutoCheckAt  epoch ms, null = 从未成功跑过
 * @param {number}  args.intervalMs
 * @returns {{action: 'run'} | {action: 'skip', reason: 'quiet_hours' | 'too_soon'}}
 */
function decideAutoCheck({ now, quietStart, quietEnd, lastAutoCheckAt, intervalMs }) {
  if (quietStart && quietEnd && inQuietHours(now, quietStart, quietEnd)) {
    return { action: 'skip', reason: 'quiet_hours' };
  }
  if (lastAutoCheckAt !== null && now.getTime() - lastAutoCheckAt < intervalMs) {
    return { action: 'skip', reason: 'too_soon' };
  }
  return { action: 'run' };
}
```

在文件末尾的 `module.exports` 里追加 `decideAutoCheck`：

```js
module.exports = {
  decideAutoCheck,
  startFundScheduler,
  startRemindersScheduler,
  startWorldcupGoalWatcher,
  wireRecentActivityListener,
  startAutoCheckTimer,
  makeRefreshLastOpenedAfterCheck,
};
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/main/schedulers-auto-check.test.js`
Expected: PASS — 7 个 `decideAutoCheck` case 全过

- [ ] **Step 5: Commit**

```bash
git add tests/main/schedulers-auto-check.test.js src/main/bootstrap/schedulers.js
git commit -m "feat(schedulers): add decideAutoCheck pure function (Phase C4)"
```

---

## Task 2: `checkOnce` 执行函数 + `lastAutoCheckAt` 状态管理（TDD）

`checkOnce` 封装"决策 → 执行 → 更新 lastAutoCheckAt"的完整 tick 逻辑。`startAutoCheckTimer` 在 Task 3 接线。本任务先让 `checkOnce` 可独立测试。

**Files:**
- Modify: `src/main/bootstrap/schedulers.js`
- Test: `tests/main/schedulers-auto-check.test.js`（追加 describe block）

- [ ] **Step 1: 写失败测试 — `checkOnce` 4 个 case**

在 `tests/main/schedulers-auto-check.test.js` 顶部 import 追加 `checkOnce`：

```js
import {
  decideAutoCheck,
  checkOnce,
  startAutoCheckTimer,
  __resetForTest,
} from '../../../src/main/bootstrap/schedulers.js';
```

在文件末尾（`decideAutoCheck` describe block 之后）追加：

```js
describe('checkOnce', () => {
  let ctx;
  let runCheckCalls;

  beforeEach(() => {
    runCheckCalls = [];
    ctx = {
      deps: {
        runtimeConfigRef: {
          current: {
            apps: [],
            notifications: {},
          },
        },
        pool: {},
        getWindow: () => null,
        trayMgr: null,
        stateStore: { saveAll: () => {} },
        runCheck: () => {
          runCheckCalls.push(Date.now());
          return Promise.resolve([]);
        },
      },
      state: { lastAutoCheckAt: null },
      intervalMs: 6 * 60 * 60 * 1000,
      now: () => new Date('2026-06-23T10:00:00'),
      log: { info: () => {}, warn: () => {} },
    };
  });

  it('runs check and updates lastAutoCheckAt on success', async () => {
    await checkOnce(ctx);
    expect(runCheckCalls).toHaveLength(1);
    expect(ctx.state.lastAutoCheckAt).toBeLessThanOrEqual(Date.now());
  });

  it('skips and does not update lastAutoCheckAt in quiet hours', async () => {
    ctx.deps.runtimeConfigRef.current.notifications = {
      quiet_hours_start: '23:00',
      quiet_hours_end: '08:00',
    };
    ctx.now = () => new Date('2026-06-23T03:00:00');
    await checkOnce(ctx);
    expect(runCheckCalls).toHaveLength(0);
    expect(ctx.state.lastAutoCheckAt).toBeNull();
  });

  it('does not update lastAutoCheckAt when runCheck rejects', async () => {
    ctx.deps.runCheck = () => Promise.reject(new Error('boom'));
    await checkOnce(ctx);
    expect(ctx.state.lastAutoCheckAt).toBeNull();
  });

  it('reads runtimeConfigRef.current fresh each tick (hot reload)', async () => {
    // 第一次 tick: 无 quiet hours, 正常跑
    await checkOnce(ctx);
    expect(runCheckCalls).toHaveLength(1);
    // 第二次 tick: 改配置加 quiet hours, 应跳过
    ctx.deps.runtimeConfigRef.current.notifications = {
      quiet_hours_start: '23:00',
      quiet_hours_end: '08:00',
    };
    ctx.now = () => new Date('2026-06-23T03:00:00');
    await checkOnce(ctx);
    expect(runCheckCalls).toHaveLength(1); // 仍是 1, 第二次被跳过
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/main/schedulers-auto-check.test.js`
Expected: FAIL — `checkOnce is not a function`

- [ ] **Step 3: 实现 `checkOnce` 并导出**

在 `src/main/bootstrap/schedulers.js` 的 `decideAutoCheck` 函数之后插入：

```js
/**
 * C4: 单次 tick 执行体. 决策 → 执行 → 更新 lastAutoCheckAt.
 * 抽出来便于单测; startAutoCheckTimer 的 timer 回调和 triggerNow 都调它.
 *
 * @param {object}  ctx
 * @param {object}  ctx.deps           startAutoCheckTimer 收到的 deps (含 runtimeConfigRef/pool/...)
 * @param {{lastAutoCheckAt: number|null}} ctx.state  可变状态对象 (闭包持有, 跨 tick 保持)
 * @param {number}  ctx.intervalMs
 * @param {function} [ctx.now]          注入当前时间, 测试用. 默认 () => new Date()
 * @param {function} [ctx.runCheck]     注入 runCheckQueued 的替代, 测试用.
 *                                       默认 require("../check-runner").runCheckQueued
 * @param {object}  [ctx.log]           注入 logger, 默认 mainLog
 */
async function checkOnce(ctx) {
  const { deps, state, intervalMs } = ctx;
  const nowFn = ctx.now || (() => new Date());
  const log = ctx.log || mainLog;
  const currentCfg = (deps.runtimeConfigRef && deps.runtimeConfigRef.current) || {};
  const qh = currentCfg.notifications || {};
  const now = nowFn();

  const decision = decideAutoCheck({
    now,
    quietStart: qh.quiet_hours_start,
    quietEnd: qh.quiet_hours_end,
    lastAutoCheckAt: state.lastAutoCheckAt,
    intervalMs,
  });

  if (decision.action === 'skip') {
    log.info(`auto-check skipped (${decision.reason})`);
    return decision;
  }

  log.info('auto-check triggered');
  const runCheck =
    ctx.runCheck ||
    ((runDeps, opts) => require('../check-runner').runCheckQueued(runDeps, opts));
  try {
    await runCheck(
      {
        getConfig: () => deps.runtimeConfigRef.current,
        pool: deps.pool,
        getWindow: deps.getWindow,
        onCheckComplete: (results) => {
          if (deps.trayMgr) {
            deps.trayMgr.setResults(results);
            deps.trayMgr.setBadge(results.filter((r) => r.has_update).length);
          }
          try {
            deps.stateStore.saveAll(results);
          } catch (err) {
            log.warn(`state save failed: ${err.message}`);
          }
        },
      },
      { silent: true },
    );
    state.lastAutoCheckAt = Date.now();
    return { action: 'run' };
  } catch (err) {
    log.warn(`auto-check failed: ${err && err.message}`);
    return { action: 'error', error: err && err.message };
  }
}
```

在 `module.exports` 里追加 `checkOnce`：

```js
module.exports = {
  decideAutoCheck,
  checkOnce,
  startFundScheduler,
  startRemindersScheduler,
  startWorldcupGoalWatcher,
  wireRecentActivityListener,
  startAutoCheckTimer,
  makeRefreshLastOpenedAfterCheck,
};
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/main/schedulers-auto-check.test.js`
Expected: PASS — 7 个 decideAutoCheck + 4 个 checkOnce case 全过

- [ ] **Step 5: Commit**

```bash
git add tests/main/schedulers-auto-check.test.js src/main/bootstrap/schedulers.js
git commit -m "feat(schedulers): add checkOnce executor with lastAutoCheckAt state (Phase C4)"
```

---

## Task 3: 改造 `startAutoCheckTimer` — 返回 `{ stop, triggerNow }` + 接线 `checkOnce`

本任务把 `startAutoCheckTimer` 从"直接内联 tick 逻辑"改为"调 `checkOnce`"，并返回可测的 handle。同时把 config 取值从 `runtimeConfig` 改 `runtimeConfigRef`。

**Files:**
- Modify: `src/main/bootstrap/schedulers.js`（`startAutoCheckTimer` 函数体）
- Modify: `src/main/index.js:626-632`（传参）

- [ ] **Step 1: 写失败测试 — `startAutoCheckTimer` 集成 case**

在 `tests/main/schedulers-auto-check.test.js` 末尾追加：

```js
describe('startAutoCheckTimer', () => {
  beforeEach(() => {
    __resetForTest();
  });

  afterEach(() => {
    __resetForTest();
  });

  it('returns { stop, triggerNow } and triggerNow runs checkOnce', async () => {
    const runCheckCalls = [];
    const handle = startAutoCheckTimer({
      runtimeConfigRef: {
        current: { apps: [], notifications: { check_interval_hours: 6 } },
      },
      pool: {},
      getWindow: () => null,
      trayMgr: null,
      stateStore: { saveAll: () => {} },
      _testNow: () => new Date('2026-06-23T10:00:00'),
      _testRunCheck: () => {
        runCheckCalls.push(Date.now());
        return Promise.resolve([]);
      },
    });
    expect(typeof handle.stop).toBe('function');
    expect(typeof handle.triggerNow).toBe('function');
    await handle.triggerNow();
    expect(runCheckCalls).toHaveLength(1);
    handle.stop();
  });

  it('does not start when check_interval_hours = 0', () => {
    const handle = startAutoCheckTimer({
      runtimeConfigRef: {
        current: { apps: [], notifications: { check_interval_hours: 0 } },
      },
      pool: {},
      getWindow: () => null,
      trayMgr: null,
      stateStore: { saveAll: () => {} },
    });
    expect(handle).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/main/schedulers-auto-check.test.js`
Expected: FAIL — `startAutoCheckTimer` 当前返回 undefined，断言 `typeof handle.stop` 失败

- [ ] **Step 3: 重写 `startAutoCheckTimer` 函数体**

把 `src/main/bootstrap/schedulers.js` 里现有的整个 `startAutoCheckTimer` 函数（从 `function startAutoCheckTimer(deps) {` 到对应的结束 `}`）替换为：

```js
/**
 * Phase 16 / C4: 后台定时静默 check. C4 起: quiet hours 内跳过检测,
 * quiet hours 结束后补跑一次 (lastAutoCheckAt=null 语义). 顺带把 config
 * 取值从启动快照改为 runtimeConfigRef.current, 让 quiet hours 热生效.
 *
 * Public API (照搬 daily-summary-job 可测性模式):
 *   startAutoCheckTimer(deps) → { stop, triggerNow } | null
 *   __resetForTest()  // clear module-level timer handle between tests
 *
 * @param {object} deps
 * @param {object} deps.runtimeConfigRef   { current: config } 实时引用 (热重载)
 * @param {object} deps.pool
 * @param {function} deps.getWindow
 * @param {object} deps.trayMgr
 * @param {object} deps.stateStore
 * @param {function} [deps._testNow]       测试注入: 当前时间
 * @param {function} [deps._testRunCheck]  测试注入: runCheckQueued 替代
 */
function startAutoCheckTimer(deps) {
  const cfg = (deps.runtimeConfigRef && deps.runtimeConfigRef.current) || {};
  const checkIntervalHours =
    (cfg.notifications && cfg.notifications.check_interval_hours) || 6;
  if (checkIntervalHours <= 0) {
    mainLog.info('auto-check disabled (check_interval_hours = 0)');
    return null;
  }
  const AUTO_CHECK_INTERVAL_MS = checkIntervalHours * 60 * 60 * 1000;

  const ctxState = { lastAutoCheckAt: null };

  // C4: 把 deps 转成 checkOnce 需要的 ctx (单次构建, 跨 tick 复用闭包)
  const buildCtx = () => ({
    deps,
    state: ctxState,
    intervalMs: AUTO_CHECK_INTERVAL_MS,
    now: deps._testNow,
    runCheck: deps._testRunCheck,
  });

  if (_autoCheckHandle.interval) {
    clearManaged(_autoCheckHandle.interval);
  }
  _autoCheckHandle.interval = setManagedInterval(
    () => {
      checkOnce(buildCtx()).catch(() => {
        /* swallow — timer callback never throws */
      });
    },
    AUTO_CHECK_INTERVAL_MS,
    { label: 'auto-check', file: 'src/main/bootstrap/schedulers.js', line: 220 },
    // ↑ line 填 setManagedInterval 调用在源码里的真实行号 (timer-registry audit 用)
  );
  mainLog.info(`auto-check timer set: every ${checkIntervalHours}h`);
  app.once('before-quit', () => {
    try {
      if (_autoCheckHandle.interval) clearManaged(_autoCheckHandle.interval);
    } catch {
      /* noop */
    }
  });

  return {
    stop: () => {
      if (_autoCheckHandle.interval) {
        clearManaged(_autoCheckHandle.interval);
        _autoCheckHandle.interval = null;
      }
    },
    triggerNow: () => checkOnce(buildCtx()),
  };
}
```

- [ ] **Step 4: 添加模块级 `_autoCheckHandle` + `__resetForTest`**

在 `src/main/bootstrap/schedulers.js` 的 require 区块之后、`decideAutoCheck` 之前，插入模块级状态：

```js
// C4: 模块级 timer handle (跟 daily-summary-job 的 _handle 同构), 便于 __resetForTest 清理.
const _autoCheckHandle = { interval: null };

function __resetForTest() {
  if (_autoCheckHandle.interval) {
    clearManaged(_autoCheckHandle.interval);
    _autoCheckHandle.interval = null;
  }
}
```

在 `module.exports` 追加 `__resetForTest`：

```js
module.exports = {
  decideAutoCheck,
  checkOnce,
  __resetForTest,
  startFundScheduler,
  startRemindersScheduler,
  startWorldcupGoalWatcher,
  wireRecentActivityListener,
  startAutoCheckTimer,
  makeRefreshLastOpenedAfterCheck,
};
```

- [ ] **Step 5: 改 `index.js` 传参**

打开 `src/main/index.js`，找到（约 626 行）：

```js
  startAutoCheckTimer({
    runtimeConfig,
    pool,
    getWindow,
    trayMgr,
    stateStore,
  });
```

替换为：

```js
  startAutoCheckTimer({
    runtimeConfigRef,
    pool,
    getWindow,
    trayMgr,
    stateStore,
  });
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run tests/main/schedulers-auto-check.test.js`
Expected: PASS — 全部 13 个 case（7 decideAutoCheck + 4 checkOnce + 2 startAutoCheckTimer）

- [ ] **Step 7: Commit**

```bash
git add tests/main/schedulers-auto-check.test.js src/main/bootstrap/schedulers.js src/main/index.js
git commit -m "feat(schedulers): wire startAutoCheckTimer to checkOnce + runtimeConfigRef (Phase C4)"
```

---

## Task 4: 全量回归 + 清理

确认改造没有破坏其他模块。

**Files:**
- 无新增/修改，仅验证

- [ ] **Step 1: 跑全量测试**

Run: `npx vitest run`
Expected: 全套通过。基线（C4 改动前）已知的 pre-existing 失败为 `reminders weekday`（日期敏感）+ 偶发 `worldcup-tray-cache getUpcoming`——**这两个允许保留，但除此之外不应有任何新增失败**。

判断方法：若拿不准某失败是否 pre-existing，先 `git stash`（回到改动前）跑一次记下失败的用例名，再 `git stash pop` 跑一次对比——多出来的失败就是 C4 引入的回归，必须修。

重点关注：任何与 `schedulers` / `check-runner` / `index.js bootstrap` 相关的测试。

- [ ] **Step 2: 确认 renderer bundle 能构建**

Run: `npm run build:renderer`
Expected: 成功输出 `renderer-dist/renderer.bundle.js`，无错误。`schedulers.js` 是 main 进程文件，不应影响 renderer bundle，但确认一下。

- [ ] **Step 3: 手工 e2e 冒烟（可选但推荐）**

按 spec §5.4：
1. `npm run dev`
2. 编辑 `config.json` 加 `"notifications": { "quiet_hours_start": "<当前时间>", "quiet_hours_end": "<当前时间+10分钟>", "check_interval_hours": 6 }`
3. 把 `check_interval_hours` 临时改小（如 1）加速观察，或直接等下一个 tick
4. 观察 log 出现 `auto-check skipped (quiet_hours)`，且无网络请求
5. 等 10 分钟窗口过后，观察 log 出现 `auto-check triggered`
6. 点 Header "检查更新" → 确认手动检测立即执行（不受 quiet hours 影响）
7. 恢复 `config.json` 原值

- [ ] **Step 4: 更新 RELEASE-NOTES.md**

在 `RELEASE-NOTES.md` 顶部 `## Unreleased` 段（若无则在 `# Pulse v2.2.0` 标题后、第一个版本段之前）插入：

```markdown
## Unreleased (🔌 后台检测智能时间窗 — Phase C4)

### 新增
- **🔌 后台检测节流 (Phase C4)**: quiet hours 内 auto-check 直接跳过检测（不只压通知），结束后自动补跑一次
  - 复用现有 `notifications.quiet_hours_start/end` 配置, 不新增配置项
  - quiet hours 内跳过: 不打外部 API、不起 worker、不写 state, 真正省电省网
  - quiet hours 结束后的首个 tick 自动补跑（`lastAutoCheckAt` 语义）
  - 检测失败时 `lastAutoCheckAt` 不更新, 下个 tick 重试

### 变更
- **`src/main/bootstrap/schedulers.js`**: `startAutoCheckTimer` 重写 — 新增 `decideAutoCheck` 纯决策函数 + `checkOnce` 执行函数; 返回 `{ stop, triggerNow }` + `__resetForTest` (照搬 daily-summary-job 可测性模式)
- **`src/main/bootstrap/schedulers.js`**: config 取值从启动快照 `runtimeConfig` 改为实时 `runtimeConfigRef.current`, quiet hours 配置改了立即生效无需重启 (与项目其他模块对齐)
- **`src/main/index.js`**: `startAutoCheckTimer` 传参 `runtimeConfig` → `runtimeConfigRef` (1 处)

### 不变
- 手动检测 (用户点"检查更新") 不受 quiet hours 影响, 永远立即执行
- `check_on_launch` (启动检测) 照跑
- 未配 quiet hours 的用户行为完全等同现状 (零回归)
- `check-runner.js` / 通知抑制逻辑 / cooldown 全部不动

### 文件
- 修改: `src/main/bootstrap/schedulers.js` (+~120 行: decideAutoCheck + checkOnce + startAutoCheckTimer 重写)
- 修改: `src/main/index.js` (1 行传参)
- 新增: `tests/main/schedulers-auto-check.test.js` (~13 case)

### 测试
- 新增 13 个 C4 相关单测 (decideAutoCheck 7 + checkOnce 4 + startAutoCheckTimer 2)
- 全套回归: 基线 pre-existing 失败外无新增失败

### 手动 e2e(留给用户验证)
- 见 spec §5.4: 设 quiet hours 窗口 → 观察跳过 → 窗口结束观察补跑 → 确认手动检测不受影响

---
```

- [ ] **Step 5: 更新路线图对账**

打开 `docs/superpowers/specs/2026-06-19-product-roadmap-design.md`，在 §3.1 概览表找到 C4 行：

```
| C4 | 后台检测节流(智能时间窗)                                | 2    | 1    | 0    | 7    | 🟢 Next  | ⚫ 未立项 |
```

把"动工"列从 `⚫ 未立项` 改为 `🟢 已合入`：

```
| C4 | 后台检测节流(智能时间窗)                                | 2    | 1    | 0    | 7    | 🟢 Next  | 🟢 已合入 |
```

在 §10.2 找到 C4 对账行，把状态从 `❌ 未开始` 改为 `✅ 已落地`，并补充落地证据：

```
| C4 | 后台检测节流(智能时间窗) | 7 | ✅ 已落地 | `src/main/bootstrap/schedulers.js` `decideAutoCheck` + `checkOnce` + `startAutoCheckTimer` 重写(quiet hours 跳过检测 + lastAutoCheckAt 补跑);config 取值改 `runtimeConfigRef.current` 热生效;`tests/main/schedulers-auto-check.test.js` (13 case: decideAutoCheck 7 + checkOnce 4 + startAutoCheckTimer 2) |
```

在 §10.1 总览表对应格子同步更新（Pillar 1 "❌ Next 未开始" 从 2 降到 1，"✅ 已落地" 从 2 升到 3）。

- [ ] **Step 6: Commit 收尾**

```bash
git add RELEASE-NOTES.md docs/superpowers/specs/2026-06-19-product-roadmap-design.md
git commit -m "docs(roadmap): flip C4 to 已合入 + release notes (Phase C4)"
```

---

## 自检结果

**Spec coverage:**
- §2 In scope "quiet hours 内跳过检测" → Task 1 `decideAutoCheck` + Task 2 `checkOnce`
- §2 "lastAutoCheckAt" → Task 2 ctx.state + Task 3 `_autoCheckHandle`
- §2 "quiet hours 结束后补跑" → Task 1 case 4 (lastAutoCheckAt=null → run)
- §2 "runtimeConfigRef 热生效" → Task 3 `buildCtx` + Task 2 case 4 (hot reload)
- §3.3 `decideAutoCheck` 纯函数 → Task 1
- §3.4 决策 A (null=run) → Task 1 case 4
- §3.4 决策 B (成功才更新) → Task 2 case 3 (reject 不更新)
- §4.1 改动文件 → Task 2/3/4 全覆盖
- §5.1 纯函数 7 case → Task 1 Step 1
- §5.2 集成测试 → Task 2 (checkOnce 4 case) + Task 3 (startAutoCheckTimer 2 case)
- §5.4 手工 e2e → Task 4 Step 3
- §7 验收标准 → Task 4 全覆盖
- §8 路线图对账 → Task 4 Step 5

**Placeholder scan:** 无 TBD/TODO/占位。Task 3 Step 3 里 `setManagedInterval` 的 `line` 参数标注了"填真实行号"（代码插入位置不同行号会变），执行者按实际位置填。

**Type consistency:** `decideAutoCheck` 返回 `{action:'run'} | {action:'skip',reason}` — Task 1/2 测试与实现一致；`checkOnce` 返回 decision 对象或 `{action:'error'}` — Task 2 实现与测试一致；`startAutoCheckTimer` 返回 `{stop,triggerNow}|null` — Task 3 测试与实现一致。`ctx.state.lastAutoCheckAt` 在 Task 2/3 贯穿。
