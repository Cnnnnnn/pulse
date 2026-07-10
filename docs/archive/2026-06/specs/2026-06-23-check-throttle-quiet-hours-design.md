# Pulse v2.27 — 后台检测智能时间窗 (C4) 设计

| 日期       | 作者         | 状态   |
| ---------- | ------------ | ------ |
| 2026-06-23 | brainstorming | 设计中 |

## 1. 背景与动机

Pulse 的后台 auto-check 由 `startAutoCheckTimer` 用固定间隔（默认 6h，可配 `notifications.check_interval_hours`）触发，**完全不看时段**。凌晨 3 点照常打十几个外部 API + 起 4 个 worker thread + 写 state.json + 更新 tray/badge。

项目已有 `inQuietHours()`（`src/main/notification-policy.js`），但**只用于抑制系统通知**，不抑制检测本身。结果是：quiet hours（如 23:00–08:00）里检测照跑，只是不弹通知——网络、CPU、磁盘写入的浪费完全没省下来。

路线图 `docs/superpowers/specs/2026-06-19-product-roadmap-design.md` 将本项标记为 **C4「后台检测节流（智能时间窗）」，评分 价值2/成本1/风险0/总分7，🟢 Next**，并评注"几乎零成本、效果立竿见影"。

**目标**：auto-check 在 quiet hours 内跳过检测（不只压通知），quiet hours 结束后自动补跑一次，消除"夜里空跑 API + 发热"的浪费，同时不牺牲用户早上看到最新状态。

## 2. 范围

### In scope

- `startAutoCheckTimer` 的 tick 回调里，先判断当前是否在 quiet hours —— 是则跳过检测、只记日志。
- 引入 `lastAutoCheckAt`（运行时内存变量，不入 state.json），用于 quiet hours 结束后判断"是否该补跑"。
- quiet hours 结束后的第一个 tick，若 `lastAutoCheckAt === null`（从未跑过）或 `now - lastAutoCheckAt >= interval`，立刻补跑。
- 复用现有 `config.json.notifications.quiet_hours_start/end` 和 `check_interval_hours`，**不新增配置项**。
- 修正 `startAutoCheckTimer` 的 config 取值方式：从启动时快照 `runtimeConfig` 改为实时 `runtimeConfigRef.current`，让 quiet hours / check_interval 配置热生效（与项目其他模块对齐）。

### Out of scope (YAGNI)

- **不**新增"免检测时段"配置 —— 直接复用通知的 quiet hours。语义一致：静默 = 不打扰 = 不该跑检测。两套时段配置会让用户困惑。
- **不**做"启动去重"（`check_on_launch` 的重复检测优化）—— 独立优化，留给后续版本。
- **不**改手动检测 —— 用户点"检查更新"永远立即执行，不受 quiet hours 影响。
- **不**改 `check_on_launch` —— 启动检测照跑，作为"重启后立即拿到状态"的兜底。
- **不**把 `lastAutoCheckAt` 持久化 —— 内存变量足够；重启走 `check_on_launch` 兜底，无需跨重启保留。
- **不**改 `check-runner.js` —— 节流决策完全在 timer 层，check-runner 的通知抑制逻辑（已有）不动。

## 3. 核心调度逻辑

### 3.1 改造点

仅在 `src/main/bootstrap/schedulers.js` 的 `startAutoCheckTimer`，纯加法。`check-runner.js` 不动。

### 3.2 tick 决策流程

```
闭包持有 lastAutoCheckAt = null（启动时为 null）

每 interval tick:
  now = Date.now()
  cfg = runtimeConfigRef.current || {}
  qh  = cfg.notifications || {}

  决策 = decideAutoCheck({
    now, quietStart, quietEnd, lastAutoCheckAt, intervalMs
  })

  if 决策.action === "skip":
    log "auto-check skipped ({决策.reason})"
    return                       ← 跳过，不更新 lastAutoCheckAt

  log "auto-check triggered ({interval}h)"
  runCheckQueued(silent)
    .then(() => { lastAutoCheckAt = Date.now() })   ← 成功后才更新
    .catch(err => log warn)                          ← 失败不更新,下个 tick 重试
```

### 3.3 决策纯函数

把调度决策抽成纯函数 `decideAutoCheck`，便于直接单测，无需走真实 timer：

```js
function decideAutoCheck({ now, quietStart, quietEnd, lastAutoCheckAt, intervalMs }) {
  // 1. quiet hours 内跳过
  if (quietStart && quietEnd && inQuietHours(now, quietStart, quietEnd)) {
    return { action: "skip", reason: "quiet_hours" };
  }
  // 2. 距上次成功检测不足间隔则跳过
  if (lastAutoCheckAt !== null && now - lastAutoCheckAt < intervalMs) {
    return { action: "skip", reason: "too_soon" };
  }
  // 3. 其余情况触发检测
  return { action: "run" };
}
```

### 3.4 两个关键设计决策

**决策 A：`lastAutoCheckAt = null` 的语义 = "从未跑过，应该跑"**

- 启动后第一次 tick：`lastAutoCheckAt` 是 null → 不走 "too_soon" 分支 → 直接跑。
- 这覆盖了"quiet hours 结束后立即跑"的场景：比如夜里启动，几个 tick 都被 quiet hours 跳过（`lastAutoCheckAt` 保持 null），一旦 quiet hours 结束的下一个 tick，`null` 让它直接触发，**无需专门判断"是否跨过了 quiet hours 边界"**。

**决策 B：只有成功触发后才更新 `lastAutoCheckAt`**

- 在 `runCheckQueued(...).then()` 里更新 —— 只在检测**成功完成**后标记。
- 失败时（`.catch`）不更新，下个 tick 会重试 —— 避免"静默失败后 6h 不再尝试"。
- 代价：检测超时那一次的下个 tick 会重跑（多一次检测），但这种情况罕见，且重试本身是期望行为。

### 3.5 quiet hours 配置缺失的情况

如果用户**没配** `quiet_hours_start/end`（当前 config.json 默认就是空的，`inQuietHours` 返回 false）→ 行为**完全等同现状**，每 6h 照跑。**零回归风险，老用户无感。**

## 4. 集成点与文件改动

### 4.1 改动文件

| 文件 | 改动 | 说明 |
| --- | --- | --- |
| `src/main/bootstrap/schedulers.js` | 改 `startAutoCheckTimer` | tick 回调加 quiet-hours 判断 + `lastAutoCheckAt` 闭包变量 + 新增 `decideAutoCheck` 纯函数 + `runtimeConfig` → `runtimeConfigRef.current` |
| `src/main/index.js` | 改 1 行传参 | `startAutoCheckTimer({ runtimeConfig, ... })` → `startAutoCheckTimer({ runtimeConfigRef, ... })`（line 626-632） |
| `tests/main/schedulers-auto-check.test.js` | **新建** | 覆盖 `decideAutoCheck` 纯函数 + `startAutoCheckTimer` tick 决策 |

### 4.2 `startAutoCheckTimer` 改造后的签名

```js
function startAutoCheckTimer(deps) {
  const { runtimeConfigRef, pool, getWindow, trayMgr, stateStore } = deps;
  // 每次 tick 读实时配置
  const cfg = (runtimeConfigRef && runtimeConfigRef.current) || {};
  const checkIntervalHours =
    (cfg.notifications && cfg.notifications.check_interval_hours) || 6;
  if (checkIntervalHours <= 0) {
    mainLog.info("auto-check disabled (check_interval_hours = 0)");
    return;
  }
  const AUTO_CHECK_INTERVAL_MS = checkIntervalHours * 60 * 60 * 1000;
  let lastAutoCheckAt = null;  // 闭包内状态,不入 state.json

  const autoCheckTimer = setManagedInterval(() => {
    const now = new Date();
    const currentCfg = (runtimeConfigRef && runtimeConfigRef.current) || {};
    const qh = (currentCfg.notifications) || {};
    const decision = decideAutoCheck({
      now,
      quietStart: qh.quiet_hours_start,
      quietEnd: qh.quiet_hours_end,
      lastAutoCheckAt,
      intervalMs: AUTO_CHECK_INTERVAL_MS,
    });
    if (decision.action === "skip") {
      mainLog.info(`auto-check skipped (${decision.reason})`);
      return;
    }
    mainLog.info(`auto-check triggered (${checkIntervalHours}h)`);
    runCheckQueued(
      {
        getConfig: () => runtimeConfigRef.current,
        pool,
        getWindow,
        onCheckComplete: (results) => { ... },  // 不变
      },
      { silent: true },
    )
      .then(() => { lastAutoCheckAt = Date.now(); })
      .catch((err) => { mainLog.warn(`auto-check failed: ${err && err.message}`); });
  }, AUTO_CHECK_INTERVAL_MS, { label: "auto-check", file: "src/main/bootstrap/schedulers.js", line: <实际行号> });
  ...
}
```

注意 `checkIntervalHours` 在启动时读一次决定 timer 周期（改它仍需重启，因为 `setManagedInterval` 的周期固定），但 **quiet hours 是每次 tick 实时读**（改 quiet hours 立即生效，无需重启）。这是合理的不对称：检测间隔改动是低频操作，quiet hours 微调更常见。

## 5. 测试

### 5.1 纯函数测试（`decideAutoCheck`，秒级）

| # | 场景 | 输入要点 | 预期输出 |
| --- | --- | --- | --- |
| 1 | 未配 quiet hours | `quietStart/end = null` | `{ action: "run" }` |
| 2 | 当前在 quiet hours 内（跨午夜窗口） | `quietStart=23:00, quietEnd=08:00, now=03:00` | `{ action: "skip", reason: "quiet_hours" }` |
| 3 | 当前在 quiet hours 内（同日窗口） | `quietStart=09:00, quietEnd=17:00, now=12:00` | `{ action: "skip", reason: "quiet_hours" }` |
| 4 | quiet hours 结束后首次 tick | `lastAutoCheckAt=null`, 不在 quiet hours | `{ action: "run" }`（补跑） |
| 5 | 距上次检测不足间隔 | `lastAutoCheckAt` = 2h 前, `intervalMs=6h` | `{ action: "skip", reason: "too_soon" }` |
| 6 | 距上次检测超过间隔 | `lastAutoCheckAt` = 7h 前, `intervalMs=6h` | `{ action: "run" }` |
| 7 | quiet hours 优先级高于 too_soon | 在 quiet hours 且距上次不足间隔 | `{ action: "skip", reason: "quiet_hours" }`（quiet hours 判断在前） |

### 5.2 集成测试（`startAutoCheckTimer` tick 决策，1-2 个）

通过 mock `setManagedInterval`（返回 fake handle，回调可手动触发）+ mock `runCheckQueued`，验证：

- `decideAutoCheck` 返回 `run` 时 → `runCheckQueued` 被调用 + 成功后 `lastAutoCheckAt` 更新
- `decideAutoCheck` 返回 `skip` 时 → `runCheckQueued` **不**被调用
- `runCheckQueued` reject → `lastAutoCheckAt` **不**更新（用 spy 在 reject 后再触发一次 tick 验证仍会 run）

### 5.3 不需要测试的（已有覆盖）

- `inQuietHours` 本身 → `tests/main/notification-policy.test.js`
- `setManagedInterval` 内部 → `tests/main/timer-registry.test.js`
- `runCheckQueued` 内部 → `check-runner` 已有测试

### 5.4 手工 e2e（留给用户验证）

1. 启动 `npm run dev`
2. 把 `quiet_hours_start` 设成"当前时间"、`quiet_hours_end` 设成"当前时间 + 10 分钟"，存 config.json
3. 等下一次 auto-check tick（或临时把 `check_interval_hours` 调小加速）→ 看 log "auto-check skipped (quiet_hours)" + 确认无网络请求（Activity Monitor 看 Pulse 进程网络）
4. 等 10 分钟窗口结束后的下一个 tick → 看 log "auto-check triggered" + badge 更新
5. 点 Header "检查更新" → 确认手动检测立即执行，不受 quiet hours 影响

## 6. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
| --- | --- | --- | --- |
| quiet hours 配置缺失时行为变化 | 低 | 低 | §3.5：`inQuietHours` 返 false → 完全等同现状，零回归 |
| quiet hours 太长导致检测长期不跑 | 中 | 中 | 自然兜底：`check_on_launch` 在每次启动跑；用户每天至少重启一次。且 quiet hours 结束后第一个 tick 会补跑 |
| `lastAutoCheckAt` 不持久化，重启后丢失 | 低 | 低 | 设计如此：重启走 `check_on_launch` 兜底，无需跨重启保留 |
| `runtimeConfig` → `runtimeConfigRef` 传参改动引入回归 | 低 | 低 | `getConfig: () => runtimeConfigRef.current` 在 tick 内与 IPC handler（index.js:472）完全一致；启动时 `runtimeConfigRef.current` 已在 index.js:211 赋值，不会是 null |

## 7. 验收标准

- [ ] 新增 `decideAutoCheck` 纯函数，7+ case 单测全过
- [ ] `startAutoCheckTimer` 改造后，2 个集成测试 case 全过
- [ ] 全套现有测试无回归（`npm test` 基线不下降）
- [ ] 手工 e2e 5 步验证通过（§5.4）
- [ ] quiet hours 配置热生效：运行时改 config.json，下一个 tick 立即反映

## 8. 与路线图的对账

本设计对应 `docs/superpowers/specs/2026-06-19-product-roadmap-design.md` §3.1 的 **C4**。完成后应在该路线图 §10 实施状态附录把 C4 从"⚫ 未立项"翻转为"🟢 已合入"，并在 §3.1 概览表的"动工"列更新。
