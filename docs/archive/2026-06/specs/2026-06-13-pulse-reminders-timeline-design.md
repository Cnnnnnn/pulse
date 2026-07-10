# Pulse v2.11 · 提醒 & 时间线 (Reminders & Timeline) — 2026-06-13

## Problem

Pulse v2.10.0 已经是一个"什么都装"的多模块桌面套件：版本检查 / AI digest / 基金 / 世界杯 / IT 新闻。普通 macOS 用户装上后，最自然的两个需求 Pulse 还**没覆盖**：

1. **"明天下午 3 点提醒我开会"** — 一次性 / 重复性提醒，本地、零学习成本、纯系统通知。Pulse 已经有 macOS 通知能力（`notification-policy.js`），目前只服务于"app 有更新"场景，没暴露给用户用。
2. **"我上次看到哪了？"** — `last-opened.js`（v2.7）已经在记录"最近打开 app"，但只服务于排序/分类，**没暴露给用户**。用户切回 Pulse 时想看的是"最近 30 分钟我点过什么"。

## Goal

v2.11 加两个小模块，**纯本地 + 零网络依赖 + 复用现有架构**：

- ⏰ **提醒（Reminders）**：用户自建提醒，到时间系统通知 + 状态变 `fired`，待 ✓ 打卡
- 🕒 **时间线（Recent Activity）**：跨 4-5 个 tab（app 升级 / 提醒 / 比赛 / 基金 / 新闻）统一记录"最近我做了什么"，时间倒序展示，点条目 = 跳到对应 tab

## Non-Goals (Out of Scope)

1. ❌ 跟系统 Reminders.app 同步
2. ❌ 提醒**联动**已有模块（"到时间就调 funds 数据"—— v2.12+）
3. ❌ 重复规则的"工作日/周"以外选项（月度 / 自定义 cron / cron expression）
4. ❌ 提醒的优先级 / 颜色 / 标签 / 分类
5. ❌ 时间线的搜索 / 标签 / 导出
6. ❌ 时间线跨用户 / 跨设备同步
7. ❌ 提醒**创建时**用 LLM 智能生成（"我待会要开会" → 自动填时间 + 标题）—— v2.12+ 候选
8. ❌ 时间线 cap 在 Settings 面板里动态调（v2.11 走 config.json 静态配置）
9. ❌ 多用户 / 多 profile
10. ❌ 提醒从系统 .ics 导入

## Design Decisions (Brainstormed)

| Decision | Choice | Rationale |
|---|---|---|
| 提醒触发方式 | **setInterval(30s) sweep + 启动时 sweep 一次** | 够用；不用 cron；用户感知不到 30s 延迟 |
| 触发后状态 | **`fired`，待用户点 ✓ 才删除** | 避免通知被一划就忘，保留"我确实看到了"的状态 |
| 重复规则 | **`once` / `daily` / `weekdays` / `weekly`，4 选项** | `weekly` = 每周固定星期几 (e.g. 每周三 10:00)，需额外 `weekday: 0-6` 字段 |
| 通知通道 | **复用 `notification-policy.js` 的 macOS 通知** | 已存在；零新增 |
| 提醒持久化 | **state.json 顶层加 `reminders[]`** | 跟 `worldcupBets` / `funds` / `worldcupBets` 平级 |
| 时间线 key | **`state.json.recentActivity[]`，cap 走 `config.json.recentActivity.maxEntries`** | 默认 200, 范围 [50, 1000] 校验；超出从头覆盖 |
| 时间线条目去重 | **同 ref 5 分钟内连续 push 折叠成"X N 次"** | 避免反复点 1 个 app 升级 8 次刷屏 |
| 时间线 UI | **倒序 list + 点条目跳 tab** | 跟已有 modal 套路一致 |
| Header 入口 | **⏰ + 🕒 两个独立图标** | 各管各的；不强迫绑成"通知中心" |
| 快捷键 | **⌘⇧R 弹新建提醒** | 跟 ⌘F 拦截模式一致 |
| 提醒 modal 默认 | **Header ⏰ 点击弹 RemindersModal** | 普通用户最熟悉的入口 |
| 时间线 modal 默认 | **Header 🕒 点击弹 RecentActivityModal** | 跟 RemindersModal 平行 |

## Data Model

### `state.json.reminders` (持久化, 顶层 array)

```ts
interface Reminder {
  id: string                  // crypto.randomUUID(), 主键
  title: string               // ≤ 100 字符
  triggerAt: number           // unix ms, 首次触发时间
  repeat: 'once' | 'daily' | 'weekdays' | 'weekly'
  weekday?: number            // 0-6 (0=Sun), 仅 repeat='weekly' 时必填
  status: 'pending' | 'fired' | 'dismissed'
  // 'fired':   到时间, 已发通知, 待 ✓ 打卡
  // 'dismissed': 用户点 × 关闭, 不再触发
  // 'once' 触发后从 'fired' 切 'dismissed' 一次, 再删
  createdAt: number           // unix ms
  firedAt?: number            // 状态变 fired 的时间
  lastNotifiedAt?: number     // 上次发通知时间 (避免重复发)
}
```

**样例**：
```json
{
  "reminders": [
    {
      "id": "r-1f2a",
      "title": "下午 3 点开会",
      "triggerAt": 1781340600000,
      "repeat": "once",
      "status": "pending",
      "createdAt": 1781337000000
    },
    {
      "id": "r-1f2b",
      "title": "早睡 11 点",
      "triggerAt": 1781342400000,
      "repeat": "weekdays",
      "status": "pending",
      "createdAt": 1781337000000
    },
    {
      "id": "r-1f2c",
      "title": "周三团队周会",
      "triggerAt": 1781425200000,
      "repeat": "weekly",
      "weekday": 3,
      "status": "pending",
      "createdAt": 1781337000000
    }
  ]
}
```

### `state.json.recentActivity` (持久化, 顶层 array, 环形 cap 走 config)

```ts
interface RecentActivityEntry {
  ts: number                  // unix ms
  kind: 'app-upgrade' | 'app-check' | 'reminder-create' |
        'reminder-fire' | 'reminder-done' |
        'worldcup-match-view' | 'fund-view' | 'ithome-favorite' |
        'ithome-view' | 'settings-open'
  ref: string                 // 主键 (app name / reminder id / match id / fund code / news id)
  label: string               // 显示用 (e.g. "Pulse 2.10.0 → 2.11.0", "下午 3 点开会")
  meta?: Record<string, any>  // 备用, 不用太重
}
```

**样例**：
```json
{
  "recentActivity": [
    { "ts": 1781339500000, "kind": "app-upgrade", "ref": "Pulse", "label": "Pulse 2.10.0 → 2.11.0" },
    { "ts": 1781339400000, "kind": "reminder-create", "ref": "r-1f2a", "label": "下午 3 点开会" },
    { "ts": 1781339300000, "kind": "worldcup-match-view", "ref": "m-2026-06-13-001", "label": "🇲🇽 vs 🇿🇦" },
    { "ts": 1781339200000, "kind": "ithome-favorite", "ref": "n-12345", "label": "OpenAI 发布 GPT-5" }
  ]
}
```

### 内存派生 (不落盘)

**`firedPendingCount(reminders, now)`** → number
- 状态是 `fired` 的提醒数量, 给 Header ⏰ 红 badge 用

**`pendingAndFiredCount(reminders, now)`** → number
- 状态是 `pending` 或 `fired` 的总数, 给时间线 modal 顶部 "X 项待办" 显示用

**`nextDueReminder(reminders, now)`** → Reminder | null
- 下一个要触发的 pending 提醒, 给时间线 "下一个: 明早 9 点 (3h 12m)" 用

## Architecture

### 后端 (main process)

**新文件 1**：`src/main/reminders.js` (调度 + CRUD)

```js
// 复用 state-store 的 atomic write
// 跟 worldcup-bets-store.js 同一套模式

// API
list(statePath?)              → Reminder[]
create(input, statePath?)     → { ok, reminder }   // input: { title, triggerAt, repeat }
update(id, patch, statePath?) → { ok, reminder }   // patch: 部分字段
remove(id, statePath?)        → { ok }
markFired(id, statePath?)     → { ok, reminder }   // 内部用: scheduler 触发后调
markDone(id, statePath?)      → { ok, reminder }   // 用户 ✓ 打卡; once → 删; daily/weekdays → 算下次
markDismissed(id, statePath?) → { ok, reminder }   // 用户 × 关掉

// 调度
startScheduler({ onFire })    → 启动 30s 定时器; 调 markFired + 调 onFire(reminder)
stopScheduler()               → 关定时器 (测试用)
_sweepOnce(now)               → 返回需要触发的 reminder[] (纯函数, 单测用)

// 内部
_computeNextFireTime(reminder, now)  // once  → triggerAt (一次性, 触发后即终)
                                    // daily → 今天还没到 triggerAt 时辰则今天; 否则明天的 triggerAt
                                    // weekdays → 下个 weekday (Mon-Fri) 的 triggerAt 时辰
                                    // weekly → 下个 weekday === reminder.weekday 的 triggerAt 时辰
```

**新文件 2**：`src/main/recent-activity.js` (环形 buffer + 折叠)

```js
// API
push(entry, statePath?, opts?)       → { ok, deduped: boolean }
//   5 分钟内同 kind+ref 的不新 push, 计数 +1 (折叠)
//   超出 maxEntries (从 config 读) 从头部裁

list(opts, statePath?)        → RecentActivityEntry[]  // 默认倒序
//   opts: { kind?, limit?, since?, ref? }

// 内部
_dedupAndPush(entries, entry) → entries  // 纯函数, 单测用
_trimToMax(entries, max)      → entries  // cap 走配置
_getMaxEntries(config)        → number   // 读 config.recentActivity.maxEntries, 缺省 200, 范围 [50, 1000]
```

### IPC 通道 (`src/main/ipc.js`)

```js
// reminders
ipcMain.handle("reminders:list",             ...)
ipcMain.handle("reminders:create",           (_evt, { title, triggerAt, repeat }) => ...)
ipcMain.handle("reminders:update",           (_evt, { id, patch }) => ...)
ipcMain.handle("reminders:remove",           (_evt, id) => ...)
ipcMain.handle("reminders:mark-done",        (_evt, id) => ...)
ipcMain.handle("reminders:mark-dismissed",   (_evt, id) => ...)

// recent activity
ipcMain.handle("recent:list",                (_evt, opts) => ...)
ipcMain.handle("recent:push",                (_evt, entry) => ...)  // renderer 调
```

### Preload (`preload.js`)

```js
remindersList:          () => ipcRenderer.invoke("reminders:list"),
remindersCreate:        (p) => ipcRenderer.invoke("reminders:create", p),
remindersUpdate:        (p) => ipcRenderer.invoke("reminders:update", p),
remindersRemove:        (id) => ipcRenderer.invoke("reminders:remove", id),
remindersMarkDone:      (id) => ipcRenderer.invoke("reminders:mark-done", id),
remindersMarkDismissed: (id) => ipcRenderer.invoke("reminders:mark-dismissed", id),
recentList:             (opts) => ipcRenderer.invoke("recent:list", opts),
recentPush:             (entry) => ipcRenderer.invoke("recent:push", entry),
```

### API 镜像 (`src/renderer/api.js`)

8 个 `pick(overrides, ...)` 一一对应, 跟 `worldcupLoadBets` 同模式。

### 通知集成 (`src/main/index.js`)

启动时 `startScheduler({ onFire })`：
- `onFire(reminder)` = 复用现有 macOS 通知通道, 标题 = reminder.title, body = "Pulse 提醒"
- 通知点击 → 弹主窗口 + 拉起 RemindersModal
- `index.js` shutdown 时 `stopScheduler()`

### Renderer 接入点 (`src/main/index.js` + 各 IPC handler)

- `app-upgrade` / `app-check`: 在 `check-runner.js` 完成回调里 push
- `reminder-create` / `reminder-fire` / `reminder-done`: 在 `reminders.js` 状态变更后内部 push
- `worldcup-match-view`: renderer 点 match card 调 IPC push
- `fund-view`: renderer 进 funds tab 时 push (debounce 5min, 避免切来切去刷屏)
- `ithome-view` / `ithome-favorite`: renderer 调 IPC push
- `settings-open`: 打开 AISettingsModal 时 push

### 前端 (renderer)

**新文件 1**：`src/renderer/reminders/remindersStore.js` — Preact signals

```js
// 跟 worldcup/betsStore.js 同一模式
reminders: signal(Reminder[])
remindersLoaded: signal(false)
firedCount: computed(() => ...)  // Header 角标
loadReminders()
createReminder(input)
updateReminder(id, patch)
removeReminder(id)
markDone(id)
markDismissed(id)
```

**新文件 2**：`src/renderer/recent/recentStore.js` — Preact signals

```js
recent: signal(RecentActivityEntry[])
recentLoaded: signal(false)
loadRecent()
pushRecent(entry)   // IPC 走 recent:push
```

**新组件**：
- `src/renderer/reminders/RemindersModal.jsx` — 列表 + 新建表单 + 状态切换
- `src/renderer/reminders/ReminderRow.jsx` — 单行（pending / fired / dismissed 三态）
- `src/renderer/reminders/ReminderForm.jsx` — 新建 / 编辑表单
- `src/renderer/recent/RecentActivityModal.jsx` — 倒序 list + 下拉过滤
- `src/renderer/recent/RecentRow.jsx` — 单行（kind icon + 时间相对 + label + 点跳 tab）

**改文件**：
- `src/renderer/App.jsx` / `AppShell.jsx` — Header 加 ⏰ + 🕒 两个图标入口
- `src/renderer/components/Header.jsx` (如有) — 加 2 个按钮
- `src/renderer/store.js` 或新增 `src/renderer/store-reminders.js` — 全局 signal 注册
- `src/renderer/hooks/useShortcuts.js` (如有) — 注册 ⌘⇧R
- `styles.css` — RemindersModal / RecentActivityModal / Header 角标样式

## UI 行为

### Header ⏰ 按钮
- 静止状态：⏰ icon，灰色
- 有 `fired` 提醒时：红 badge 显示数字
- 点击 → 弹 RemindersModal

### RemindersModal
- 顶部：标题 "提醒" + 关闭按钮 + "+ 新建" 按钮
- 列表分组：
  - **待办 (pending)**: 倒序按 triggerAt，显示「明早 9:00」「下周一 10:00」相对时间
  - **已触发 (fired)**: 倒序按 firedAt，显示"3 分钟前"相对时间 + [✓ 完成] [× 忽略] 按钮
  - **已忽略 (dismissed)**: 默认折叠, 展开可见
- 单行 hover: 显示 [编辑] [删除]
- "+ 新建" 按钮 → 弹行内表单 (跟 WorldcupBets 同模式)：
  - 标题 input (≤ 100 字符)
  - 触发时间 datetime-local picker
  - 重复 radio: 一次 / 每天 / 工作日
  - [保存] [取消]
  - 快捷键: Esc 取消, Cmd/Ctrl+Enter 保存
- **fired 状态的快捷键**: 待定 (考虑 ⌘⇧D 一键打卡最近的 fired)

### Header 🕒 按钮
- 静止状态：🕒 icon，灰色
- 点击 → 弹 RecentActivityModal
- **不加 badge** (timeline 不是待办, 没必要)

### RecentActivityModal
- 顶部：标题 "最近活动" + 关闭按钮 + 过滤下拉 (全部 / 升级 / 提醒 / 比赛 / 基金 / 新闻)
- 列表倒序, 200 条内
- 单行格式: `[icon] [label]    [相对时间: "3 分钟前" / "今早 9:23"]`
- 同一 ref 5 分钟内折叠显示: `[icon] [label]    3 次 · 最近 3 分钟前`
- 点行 → 关 modal + 切到对应 tab + 滚到对应 ref
- 空态: "还没有活动记录，去点点 Pulse 各功能试试 →"

## Files (Final Manifest)

**新增 ~12 个**：
- `src/main/reminders.js`
- `src/main/recent-activity.js`
- `src/main/__tests__/reminders.test.js`
- `src/main/__tests__/recent-activity.test.js`
- `src/renderer/reminders/remindersStore.js`
- `src/renderer/reminders/RemindersModal.jsx`
- `src/renderer/reminders/ReminderRow.jsx`
- `src/renderer/reminders/ReminderForm.jsx`
- `src/renderer/recent/recentStore.js`
- `src/renderer/recent/RecentActivityModal.jsx`
- `src/renderer/recent/RecentRow.jsx`
- `docs/superpowers/specs/2026-06-13-pulse-reminders-timeline-design.md` ← 本文件

**改 ~9 个**：
- `src/main/index.js`（启动 startScheduler + shutdown stopScheduler + 通知点击处理）
- `src/main/ipc.js`（加 8 个 handler）
- `src/main/check-runner.js`（app-upgrade / app-check push）
- `config.json`（加 `recentActivity: { maxEntries: 200 }`）
- `preload.js`（加 8 个 bridge）
- `src/renderer/api.js`（加 8 个 pick）
- `src/renderer/App.jsx`（加 2 个 modal mount）
- `src/renderer/components/AppShell.jsx` 或 `Header`（加 ⏰ + 🕒 入口）
- `styles.css`（modal + icon + badge 样式）

**版本号**：v2.10.0 → **v2.11.0**（minor，新增用户可见模块），changelog 走 `RELEASE-NOTES.md`。

## Testing

### 单测 (vitest)

**`tests/main/reminders.test.js`** 覆盖：
1. `create` / `update` / `remove` / `markDone` / `markDismissed` CRUD
2. 输入校验: title 空 / > 100 字符 / triggerAt 非 number / repeat 非法 / weekly 缺 weekday
3. `markDone` once → 删, daily/weekdays/weekly → 算下次 triggerAt
4. `_computeNextFireTime`: daily 跨日, weekdays 跳过周末, weekly 跳到下个匹配 weekday, once 不变
5. `_sweepOnce(now)`: 0 / 1 / N 个待触发; fired 后不重复触发
6. Atomic write: 模拟崩溃 → state.json 完整

**`tests/main/recent-activity.test.js`** 覆盖：
1. `push` 正常 / 5min 内同 kind+ref 折叠 / 超出 maxEntries 裁
2. `list` 倒序 / limit / kind 过滤 / since 过滤
3. `_getMaxEntries`: 缺省 200, 范围 [50, 1000] 钳制
4. 崩溃恢复

### 手测 (build 前 user 必走)

1. ⌘⇧R → 新建"明早 9 点开会" / 重复=工作日 → 状态 pending
2. 改系统时间到 09:00 → 30s 内系统通知弹出 + 状态变 fired + Header 红 badge 1
3. 点 ✓ 完成 → 状态 dismissed (once) / 重新 pending 下个工作日 (weekdays)
4. 点 × 忽略 → 状态 dismissed, 不再触发
5. 重启 app → 提醒仍在 state.json
6. 升级 1 个 app → 时间线出现 1 条
7. 5 分钟内连点同一 app 升级 5 次 → 时间线只 1 条, 显示 "5 次"
8. 切 3 个 tab → 时间线出现 3 条
9. ⌘⇧R 弹新建 / Esc 关 / Cmd+Enter 保存
10. Header ⏰ / 🕒 入口在 Dark Mode 下样式不掉

## Future / Backlog (v2.11.1 候选: 时间线采集点)

**v2.11 推空壳**: 主进程 + IPC + renderer modal + Header 入口全部跑通, 但 renderer 端**采集点 0 处** — 用户点 / 进任何 tab 都不会推 entry, modal 一直空.

**v2.11.1 计划补** 5 个 push 点 (renderer 主动 push, 跟 A 方案一致):
- [ ] `app-upgrade` + `app-check`: 在 store.js 订阅 onCheckFinished / onAutoCheckFinished, 遍历 results, 给有 update 的 app 推一条
- [ ] `reminder-create` / `reminder-fire` / `reminder-done` / `reminder-dismissed`: 在 remindersStore 的 action 末尾 push (createReminder / markReminderDone / markReminderDismissed)
- [ ] `worldcup-match-view`: WorldcupView 的 match card onClick 加 push
- [ ] `ithome-view` / `ithome-favorite`: ithome store 加 push (debounce 5min for view)
- [ ] `fund-view`: activeNav 切到 funds 时 push (debounce 5min)

**预计 v2.11.1 工作量**: 5 个点 × 5-10 行 + 1 个 store helper (debounce 5min), 不超过 1 小时.

---

## Future / Backlog (不做)

- 跟系统 Reminders.app 同步
- 提醒**联动**其他模块（"到时间就调 funds 数据"）
- 重复规则的"工作日/周"以外选项（月度 / 自定义 cron）
- 提醒的优先级 / 颜色 / 标签 / 分类
- 时间线的搜索 / 标签 / 导出
- 时间线跨用户 / 跨设备同步
- 提醒**创建时**用 LLM 智能生成（"我待会要开会" → 自动填）
- 提醒的"前置提前 N 分钟"功能（"会议前 10 分钟提醒我"）
- 时间线按"周 / 月"分组
- 提醒的"已读 / 未读"状态（避免 v2.12 之前先到 fired 再补 N 个的视觉混乱）
