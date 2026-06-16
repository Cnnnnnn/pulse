# Pulse 世界杯进球通知 (Goal Notifications)

- **日期**: 2026-06-15
- **作者**: brainstorming-2 (with user)
- **状态**: 待用户 review
- **项目类型**: macOS 菜单栏 Electron 应用 (Pulse v2.15+)
- **目标特性**: 在世界杯比赛进行中定时轮询比分, 一旦某场出现新进球, 通过系统通知推送给用户; 点击通知自动切到世界杯 tab 并滚到该场比赛。

## 0. 决策日志 (brainstorming-2 产出)

| 决策点 | 选择 | 备选 + 否决理由 |
| --- | --- | --- |
| 范围 | **仅世界杯 tab** | 全联赛通用 (YAGNI, 接口未稳定) / 未来通用预留接口 (本期不做) |
| 触发事件 | **仅「进球」** | 进球 + 比赛开始/结束/半场 (噪音多, 偏离「进球通知」核心) / 进球 + 比赛结束 (补时/点球大战另算, 容易混淆) |
| 通知渠道 | **仅 Electron 系统通知** | + App 内弹窗 (重复, 已有 reminders 模式) / + Tray badge (进球数无强语义) / + Recent activity (后期可加, YAGNI) |
| 监看范围 | **app 跑着时, 所有已开始且未完赛的世界杯场次都监看** | 默认关 (用户漏掉进球) / 只能手动指定场次 (违背「放着让 app 推」) |
| 轮询节奏 | **60s** | 30s (与 reminders sweep 撞, API 压力大) / 15s (频繁) / 可调 (YAGNI) |
| Quiet hours | **复用现有 app 更新通知的 `quiet_hours_start/end`** | 单独一套 (逻辑重复) / 不做 (凌晨轰炸) |
| 去重存储 | **`state.json` 顶层加 `worldcupGoalNotified` 字段** (跟 `worldcup_scores` 平级) | 走 scorers 数组去重 (score entry 重写会丢历史) / 新建 `worldcup_goals` 文件 (YAGNI) |
| 关注球队 | **v1 不做, 全部进行中比赛都通知** | 关注列表 (配置项, v2 再加) / 静音列表 (黑名单, YAGNI) |
| 通知语言 | **中文 (跟随 Pulse UI)** | 跟系统语言 (zh/en, 通知语言混) / 英语 (跟 UI 不一致) |
| 进球类型标记 | **只标记乌龙 (ownGoal) 与点球 (penalty) 两种, 标题加前缀** | 全部无标记 (信息不足) / 详细分类 (黄红牌/换人/越位, 不属于进球事件) |
| 点击通知行为 | **跳到世界杯 tab + scrollIntoView + 3 秒高亮** | 仅打开主面板 (不定位) / 什么都不做 (只点掉) |
| 窗口未打开时 | **照发, 系统通知本来不依赖窗口** | 窗口隐藏时静默 (违背通知初衷) / 仅托盘激活时发 (太严) |
| 多源交叉验证 | **只信 ESPN scorers, 不交叉** | ESPN + worldcup26 双源 (流量翻倍, ESPN 准) / 抢报 (用户噪音) |
| 数据源 | **复用 `refreshWorldcupScores` (ESPN→worldcup26→openfootball 三层)** | 独立 goal-tracker (HTTP 翻倍) / bets-store 风格独立 goal-store (over-engineering) |
| 入口 | **app 启动后 `bootstrap/schedulers.js` 起一个 60s `setInterval`** | 跟 brackets 一样用户手动触发 (违背自动监控初衷) / renderer setInterval (重复 fetch, 状态切分复杂) |
| 测试 | **vitest 单测覆盖纯函数 + 集成测试覆盖 IPC** | 集成测试覆盖全部 (CI 慢) / 只单测 (漏端到端) |

## 1. 目标

### 1.1 必须达成

- [A] 新模块 `src/main/worldcup/goal-watcher.js`: `startGoalWatcher(deps)` / `stopGoalWatcher()` / `_sweepOnce(now, deps)` / `_diffNewGoals(prevScores, newScores, prevNotified)` / `_formatGoalNotification(scorer, fixture, locale)` / `_goalKeyOfScorer(scorer)`
- [A] 60s `setInterval` sweep, 复用现有 `refreshWorldcupScores(eligibleKeys)` 拉最新比分
- [A] 去重基于 `ESPN scorers` 数组的 `minute + player + teamSide` 拼出稳定 `goalKey`, 入 `state.worldcupGoalNotified[matchKey] = { notified: string[], updatedAt: number }`
- [A] 命中新进球 → 调 `notification-policy.inQuietHours()` 抑制 → 调 `ElectronNotification` 推 `"阿根廷 1-0 法国 · 77' 梅西"`
- [A] 通知点击 → 调 `mainWindow.show()` + 推 `worldcup:focus-match` IPC, renderer 切到世界杯 tab, 滚到该比赛行 + `.match-row-highlight` class 3 秒后移除
- [A] `state.json` 顶层新字段 `worldcupGoalNotified`, 走 `stateStore.patchState` 范式 (跟 `worldcup_bracket_snapshot` 一致)
- [A] `state-store.js` 的 `PRESERVE_FIELDS` 加 `worldcupGoalNotified` (object)
- [A] 完赛比赛 (`entry.status === 'final' && scorers.length > 0`) 不再扫, 视为已 stable
- [A] 复用现有 `notifications.quiet_hours_start` / `quiet_hours_end` 配置项 (跟 `notification-policy.js` 一致)
- [A] 不通知 30 天前的历史比赛 (kickoffUtcMs - now > 30d 视为过期)
- [A] 单场进球 > 10 个时 (极端情况) 只推前 10 条
- [A] quiet hours 期间进球被吞掉 (不补推)
- [A] 9 个单测覆盖 `_goalKeyOfScorer` (3 例) / `_diffNewGoals` (5 例) / `_formatGoalNotification` (2 例) / `_sweepOnce` (1 例端到端 mock)

### 1.2 应该达成 (nice-to-have)

- [B] `state.worldcupGoalNotified` 单场 capped 50 个 goalKey (防刷爆 state.json)
- [B] 通知标题加乌龙 (乌龙球) / 点球 (点球) 前缀
- [B] 通知体里附当前比分 (e.g. `1-0` 切到 `2-0`)
- [B] startWorldcupGoalWatcher 暴露 `isRunning` 给 health check
- [B] 启动时一次性扫描已在 live 的比赛, 推送所有未在 notified list 里的进球 (可接受的一次性副作用)
- [B] 当 5 分钟内同一场比赛有 3+ 进球时合并为一条「帽子戏法」通知

### 1.3 不会做 (out of scope)

- ❌ 全联赛通用 — 仅 2026 世界杯
- ❌ 关注球队列表 / 静音球队列表 — v1 全推
- ❌ 比赛开始 / 结束 / 半场 通知 — 仅进球
- ❌ 比分变更通知 (ESPN scorers 漏字段时) — 记 backlog, v2 再加
- ❌ 把进球推到 recent-activity
- ❌ 把进球推到 App 内弹窗 (tray popover) — 跟系统通知重复
- ❌ 把进球推到 iOS / Web push
- ❌ Quiet hours 期间补推 (凌晨轰炸风险)
- ❌ 双源交叉验证 (ESPN + worldcup26) — ESPN scorers 已够
- ❌ bracket snapshot 推进球通知 (bracket 跟进球是独立模块)
- ❌ 改用 `web-push` / `node-pushnotifications` — Electron Notification 已够
- ❌ 把状态从 `state.json` 搬到 sqlite — YAGNI

## 2. 架构

```text
┌──────────────────────────────────────────────────────────────┐
│  src/main/worldcup/                     (新文件)            │
│  └── goal-watcher.js             调度 + 纯函数                │
│      ├── startGoalWatcher()      起 60s setInterval            │
│      ├── stopGoalWatcher()       停                            │
│      ├── _sweepOnce()            单次扫描 (单测可直调)         │
│      ├── _diffNewGoals()         纯函数, 算新进球             │
│      ├── _formatGoalNotification() 纯函数, 拼标题/体           │
│      └── _goalKeyOfScorer()      纯函数, 算去重键             │
│                                                              │
│  src/main/bootstrap/schedulers.js   (修改)                     │
│  └── startWorldcupGoalWatcher()   接入 start, before-quit 停 │
│                                                              │
│  src/main/state-store.js           (修改)                     │
│  └── PRESERVE_FIELDS              加 worldcupGoalNotified    │
│  └── patchState (复用)             走原子写                    │
│                                                              │
│  src/main/notification-policy.js   (复用)                     │
│  └── inQuietHours()               复用抑制                     │
│                                                              │
│  src/renderer/worldcup/                                      │
│  ├── WorldcupView.jsx             (修改) 加 focus-match 监听  │
│  └── styles.css                   (修改) 加 .match-row-highlight│
└──────────────────────────────────────────────────────────────┘

数据流:
  1. app 启动 → bootstrap/schedulers.startWorldcupGoalWatcher()
     → startGoalWatcher({ refreshScores, loadFixtures, getConfig, onGoal, ... })
     → setInterval(60s) → _sweepOnce(Date.now(), deps)

  2. _sweepOnce(now, deps):
     a) 拉 fixtures: stateStore.loadWorldcupTxt() → parseWorldcupTxt → matches
     b) 算 eligibleKeys: matches.filter(m =>
          isMatchStarted(m, now) && !isFinalStable(entry))
     c) 调 refreshWorldcupScores(eligibleKeys) → newScores, updatedKeys
     d) 读旧 prevScores = stateStore.loadWorldcupScores().entries
     e) 读旧 prevNotified = state.worldcupGoalNotified
     f) _diffNewGoals(prevScores, newScores, prevNotified)
        → string[] newGoalKeys
     g) 对每个新进球:
        - 找对应 scorer
        - 找对应 fixture
        - quiet hours 检查
        - 拼 notification { title, body }
        - 调 deps.onGoal(notif, { matchKey, scorer, fixture })
     h) 合并 prevNotified: stateStore.patchState((next) => {
          next.worldcupGoalNotified = {
            ...prevNotified,
            [matchKey]: { notified: [...prev, ...newKeys].slice(-50), updatedAt: now }
          }
        })

  3. 通知点击 (renderer 端):
     mainWindow.webContents.send("worldcup:focus-match", { matchKey })
     → WorldcupView useEffect 监听 ipcRenderer.on("worldcup:focus-match")
     → 切到 'worldcup' tab
     → 在 dayGroups 里找 matchKey
     → const el = document.querySelector(`[data-match-key="${matchKey}"]`)
     → el.scrollIntoView({ behavior: 'smooth', block: 'center' })
     → el.classList.add("match-row-highlight")
     → setTimeout(() => el.classList.remove("match-row-highlight"), 3000)

边界:
  - fixturesTxt 解析失败 → 本轮跳过, log warn
  - refreshScores 失败 → 用上轮 newScores, _diffNewGoals 仍跑
  - state.json 损坏 → worldcupGoalNotified 视为空 (走 _readStateRaw 兜底)
  - 30 天前比赛 → eligibleKeys 排除
  - 单场 goalKey > 50 → 截尾 (防刷爆 state.json)
```

## 3. 模块拆分

### 3.1 `src/main/worldcup/goal-watcher.js`

```js
/**
 * 进球通知 watcher.
 *
 * 数据契约:
 *   fixture:   { date, time, team1, team2, stage, group, ... } (from parseWorldcupTxt)
 *   scoreEntry: { ft: [int, int], status: 'live'|'final', scorers?: [
 *                  { minute: "77'", player: "Messi", teamSide: "team1",
 *                    ownGoal?: bool, penalty?: bool }
 *                ] } (from scores-fetcher / ESPN)
 *   matchKey:  `${date}|${time}|${team1}|${team2}` (from match-key.js)
 */

// _goalKeyOfScorer(scorer) → string
//   input:  { minute, player, teamSide, ownGoal?, penalty? }
//   output: "77'|Messi|team1"
//   纯函数, 单测覆盖 (3 例: 基础 / ownGoal / penalty)

// _diffNewGoals(prevScores, newScores, prevNotified) → Array<{matchKey, scorer, key}>
//   input:
//     prevScores:    { [matchKey]: scoreEntry }  (上轮已存)
//     newScores:     { [matchKey]: scoreEntry }  (本轮 refreshScores 返回)
//     prevNotified:  { [matchKey]: { notified: string[], updatedAt: number } }
//   output:         [{ matchKey, scorer, key: string }, ...]
//   纯函数, 单测覆盖 (5 例: 空 / 新增 / 已知 / 多进球 / 完赛不再推)
//   注意: 不传 prevNotified 时视为 {}, 第一次跑会一次性推所有历史进球 (可接受)

// _formatGoalNotification(scorer, fixture, opts?) → { title, body }
//   input: scorer (含 ownGoal/penalty), fixture (含 team1, team2, score.ft)
//   output: { title: "进球 · 77' 梅西", body: "阿根廷 1-0 法国" }
//   纯函数, 单测覆盖 (2 例: 基础 / ownGoal 前缀)
//   locale 默认为 'zh-CN' (写死, 不做 i18n)

// _sweepOnce(now, deps) → Promise<{notifiedCount: number, errors: string[]}>
//   副作用: 调 deps.refreshScores / deps.onGoal / stateStore.patchState
//   纯依赖注入, 单测可 mock 全部 deps

// startGoalWatcher({ refreshScores, loadFixtures, getConfig, onGoal,
//                    getWindow, sendToRenderer, log, onError }) → void
//   启动 setInterval(60s), 调 _sweepOnce
//   第一次启动时立即 _sweepOnce 一次 (拉取启动前已在 live 的进球)
//   在 app.before-quit 时 stop

// stopGoalWatcher() → void
//   clearInterval, 清状态

// isGoalWatcherRunning() → boolean
//   health check / 测试用

// 内部常量
const SWEEP_INTERVAL_MS = 60_000;       // 60s
const MAX_GOAL_KEYS_PER_MATCH = 50;      // 截尾防刷爆
const MAX_NOTIFICATIONS_PER_SWEEP = 10; // 单场上限
const MATCH_TOO_OLD_DAYS = 30;           // 30 天前比赛排除
```

### 3.2 `src/main/bootstrap/schedulers.js` (修改)

```js
// 在 startWorldcupGoalWatcher (新函数) 里:
const { startGoalWatcher, stopGoalWatcher } = require("../worldcup/goal-watcher");
const { Notification: ElectronNotification } = require("electron");
const { inQuietHours } = require("../notification-policy");

let _goalWatcherDeps = null;

function startWorldcupGoalWatcher(deps) {
  const { getWindow, sendToRenderer, getConfig, log } = deps;

  if (_goalWatcherDeps) stopWorldcupGoalWatcher();

  _goalWatcherDeps = {
    refreshScores: (keys) => require("../worldcup/scores-fetcher").refreshWorldcupScores(keys),
    loadFixtures: () => stateStore.loadWorldcupTxt(),
    getConfig,
    onGoal: (notif, meta) => {
      const cfg = getConfig() || {};
      const qh = (cfg.notifications) || {};
      const now = new Date();
      if (inQuietHours(now, qh.quiet_hours_start, qh.quiet_hours_end)) {
        log.info(`[worldcup/goal-watcher] quiet hours skip: ${meta.matchKey}`);
        return;
      }
      try {
        if (!ElectronNotification.isSupported()) return;
        const n = new ElectronNotification({
          title: notif.title,
          body: notif.body,
          silent: false,
        });
        n.on("click", () => {
          const w = getWindow();
          if (w && !w.isDestroyed()) {
            w.show();
            w.focus();
          }
          sendToRenderer("worldcup:focus-match", { matchKey: meta.matchKey });
        });
        n.show();
      } catch (err) {
        log.warn(`[worldcup/goal-watcher] notification failed: ${err.message}`);
      }
    },
    log: log || { info: () => {}, warn: () => {}, error: () => {} },
    onError: (err) => log.warn(`[worldcup/goal-watcher] sweep failed: ${err.message}`),
  };

  startGoalWatcher(_goalWatcherDeps);
}

function stopWorldcupGoalWatcher() {
  stopGoalWatcher();
  _goalWatcherDeps = null;
}

// 在 app.before-quit 注册: stopWorldcupGoalWatcher()
// 在 startSchedulers 末尾调 startWorldcupGoalWatcher(deps)
```

### 3.3 `src/main/state-store.js` (修改)

```js
// PRESERVE_FIELDS 数组加:
{ key: "worldcupGoalNotified", kind: "object", notArray: true },

// 不需要新 load/save 函数, 直接走 patchState:
// const state = stateStore.load();
// const notified = (state && state.worldcupGoalNotified) || {};
// stateStore.patchState((next) => {
//   next.worldcupGoalNotified = { ...notified, [matchKey]: { ... } };
// });
```

### 3.4 `src/renderer/worldcup/WorldcupView.jsx` (修改)

```jsx
// 在 useEffect 里订阅 ipcRenderer.on("worldcup:focus-match", handler)
useEffect(() => {
  const handler = (_evt, { matchKey }) => {
    // 1) 切到世界杯 tab
    setActiveSubTab("schedule");
    // 2) 等下一帧 DOM 更新后, 找 element
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-match-key="${CSS.escape(matchKey)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("match-row-highlight");
      setTimeout(() => el.classList.remove("match-row-highlight"), 3000);
    });
  };
  ipcRenderer.on("worldcup:focus-match", handler);
  return () => ipcRenderer.off("worldcup:focus-match", handler);
}, []);

// 在 match row 的根 div 加 data-match-key={matchKey(match)}
```

### 3.5 `src/renderer/styles.css` (修改)

```css
.match-row-highlight {
  background-color: rgba(255, 215, 0, 0.25) !important;
  transition: background-color 0.3s ease-in-out;
  animation: goal-highlight-pulse 3s ease-out;
}

@keyframes goal-highlight-pulse {
  0%   { background-color: rgba(255, 215, 0, 0.55); }
  100% { background-color: transparent; }
}
```

## 4. 数据契约

### 4.1 `state.json.worldcupGoalNotified`

```ts
// state.json 顶层 key, 跟 worldcup_scores / worldcup_bracket_snapshot 平级
worldcupGoalNotified: {
  [matchKey: string]: {
    // matchKey = `${date}|${time}|${team1}|${team2}` (跟 match-key.js 一致)
    notified: string[];   // 已推过的 goalKey 列表, max 50, 截尾
    updatedAt: number;    // epoch ms
  }
};
```

**示例**:

```json
{
  "worldcupGoalNotified": {
    "2026-06-15|22:00|ARG|FRA": {
      "notified": ["77'|Messi|team1", "90+3'|Martinez|team1"],
      "updatedAt": 1750000000000
    }
  }
}
```

### 4.2 `goalKey` 格式

```js
// _goalKeyOfScorer(scorer) → string
//   scorer = { minute, player, teamSide, ownGoal?, penalty? }
//   return: `${minute}|${player}|${teamSide}`
// 例:
//   { minute: "77'", player: "Messi", teamSide: "team1" }  → "77'|Messi|team1"
//   { minute: "45+2'", player: "Di Maria", teamSide: "team2" } → "45+2'|Di Maria|team2"
//
// 为什么这么拼:
//   - minute 区分"何时进" (补时进球 / 90' 进球 / 点球大战)
//   - player 区分"谁进"
//   - teamSide 区分"哪边进" (主客互换时仍然稳定)
//   - ownGoal / penalty 不进 key (避免 ESPN 偶尔漏标 ownGoal 时去重失效)
```

### 4.3 通知 payload

```ts
type GoalNotification = {
  title: string;        // e.g. "进球 · 77' 梅西"
  body: string;         // e.g. "阿根廷 1-0 法国"
  silent: false;
};

type GoalMeta = {
  matchKey: string;     // 用于点击后 scrollIntoView
  scorer: Scorer;       // 透传给日志/调试
  fixture: Fixture;     // 同上
};
```

### 4.4 IPC

- **main → renderer (push)**: `worldcup:focus-match`, payload `{ matchKey: string }`
  - 不需要新 `handle` (单向 push)
  - renderer 在 `WorldcupView` mount 时订阅, unmount 时 unsubscribe

## 5. 关键算法

### 5.1 `_diffNewGoals` 纯函数

```js
function _diffNewGoals(prevScores, newScores, prevNotified) {
  const out = [];
  const notified = prevNotified || {};

  for (const [matchKey, newEntry] of Object.entries(newScores || {})) {
    if (!newEntry || !Array.isArray(newEntry.scorers)) continue;
    // 完赛且有 scorers → 视为已 stable, 跳过 (避免重启后重推)
    if (newEntry.status === "final" && newEntry.scorers.length > 0) continue;

    const prevEntry = (prevScores || {})[matchKey];
    const prevScorers = (prevEntry && Array.isArray(prevEntry.scorers)) ? prevEntry.scorers : [];
    const prevScorerKeys = new Set(prevScorers.map(_goalKeyOfScorer));
    const alreadyNotified = new Set((notified[matchKey] || {}).notified || []);

    for (const scorer of newEntry.scorers) {
      const key = _goalKeyOfScorer(scorer);
      // 双重去重: 1) 上轮 scorers 已含 → 旧比赛  2) notified list 已含 → 已推过
      if (prevScorerKeys.has(key)) continue;
      if (alreadyNotified.has(key)) continue;
      out.push({ matchKey, scorer, key });
    }
  }
  return out;
}
```

**为什么不只看 `notified` list**: 防止 state.json 损坏或被清空时一次性重推历史进球; 通过 `prevScorers` 二次过滤保证 1 分钟内的"标准去重"。

### 5.2 `_formatGoalNotification` 纯函数

```js
function _formatGoalNotification(scorer, fixture) {
  const prefix = scorer.ownGoal ? "乌龙球 · " : scorer.penalty ? "点球 · " : "进球 · ";
  const teamName = scorer.teamSide === "team1" ? fixture.team1 : fixture.team2;
  const oppName = scorer.teamSide === "team1" ? fixture.team2 : fixture.team1;
  const [home, away] = fixture.score && fixture.score.ft ? fixture.score.ft : [null, null];
  const scoreStr = home != null ? `${home}-${away}` : "";
  return {
    title: `${prefix}${scorer.minute} ${scorer.player}`,
    body: scoreStr ? `${teamName} vs ${oppName} · 当前 ${scoreStr}` : `${teamName} vs ${oppName}`,
  };
}
```

### 5.3 `_sweepOnce` 主流程

```js
async function _sweepOnce(now, deps) {
  const { refreshScores, loadFixtures, onGoal, log, onError } = deps;
  const errors = [];
  let notifiedCount = 0;

  try {
    // 1) 拉 fixtures (从 state.json.worldcup_txt 缓存)
    const cached = loadFixtures();
    if (!cached || !cached.txt) {
      log.info("[goal-watcher] no fixtures cache, skip");
      return { notifiedCount: 0, errors: ["no_fixtures"] };
    }
    const fixturesData = parseWorldcupTxt(cached.txt);
    const allMatches = fixturesData.matches || [];

    // 2) 算 eligibleKeys
    const oldScores = stateStore.loadWorldcupScores() || { entries: {} };
    const cutoffMs = now - MATCH_TOO_OLD_DAYS * 86400_000;
    const eligibleKeys = allMatches
      .filter((m) => isMatchStarted(m, now))
      .filter((m) => matchKickoffUtcMs(m) >= cutoffMs)
      .filter((m) => isEligibleForGoalWatch(m, oldScores.entries[matchKey(m)]))
      .map(matchKey);

    if (eligibleKeys.length === 0) {
      return { notifiedCount: 0, errors: [] };
    }

    // 3) 调 refreshScores 拉最新
    const refreshResult = await refreshScores(eligibleKeys);
    if (!refreshResult || !refreshResult.ok) {
      log.warn("[goal-watcher] refresh failed", { reason: refreshResult && refreshResult.reason });
      return { notifiedCount: 0, errors: ["refresh_failed"] };
    }
    const newScores = refreshResult.scores || {};

    // 4) 读旧 notified
    const raw = stateStore.load() || {};
    const prevNotified = raw.worldcupGoalNotified || {};

    // 5) diff
    const newGoals = _diffNewGoals(oldScores.entries, newScores, prevNotified);

    // 6) 推 + 写盘
    if (newGoals.length > 0) {
      const byKey = new Map(allMatches.map((m) => [matchKey(m), m]));
      const toNotify = newGoals.slice(0, MAX_NOTIFICATIONS_PER_SWEEP * eligibleKeys.length);

      // 按 matchKey 分组
      const grouped = new Map();
      for (const g of toNotify) {
        if (!grouped.has(g.matchKey)) grouped.set(g.matchKey, []);
        grouped.get(g.matchKey).push(g);
      }

      const notifiedMap = new Map();
      for (const [mk, goals] of grouped) {
        const fixture = byKey.get(mk);
        if (!fixture) continue;
        const existingKeys = (prevNotified[mk] && prevNotified[mk].notified) || [];
        const newKeys = [];
        for (const g of goals) {
          const fixtureWithScore = { ...fixture, score: newScores[mk] };
          const notif = _formatGoalNotification(g.scorer, fixtureWithScore);
          try {
            onGoal(notif, { matchKey: mk, scorer: g.scorer, fixture });
            newKeys.push(g.key);
            notifiedCount += 1;
          } catch (err) {
            log.warn("[goal-watcher] onGoal failed", { msg: err.message });
            errors.push(`onGoal_failed:${mk}`);
          }
        }
        // 单场 capped 50
        notifiedMap.set(mk, [...existingKeys, ...newKeys].slice(-MAX_GOAL_KEYS_PER_MATCH));
      }

      // 7) atomic write
      try {
        stateStore.patchState((next) => {
          const prev = next.worldcupGoalNotified || {};
          const merged = { ...prev };
          for (const [mk, keys] of notifiedMap) {
            merged[mk] = { notified: keys, updatedAt: now };
          }
          next.worldcupGoalNotified = merged;
        });
      } catch (err) {
        log.warn("[goal-watcher] state write failed", { msg: err.message });
        errors.push("state_write_failed");
      }
    }

    return { notifiedCount, errors };
  } catch (err) {
    onError(err);
    return { notifiedCount, errors: [...errors, err.message] };
  }
}
```

### 5.4 eligibleKeys 计算

```js
function isEligibleForGoalWatch(match, cachedEntry) {
  if (!match) return false;
  const entry = cachedEntry || null;
  // 已完赛且 scorers 非空 → stable, 跳过
  if (entry && entry.status === "final" && Array.isArray(entry.scorers) && entry.scorers.length > 0) {
    return false;
  }
  // 已开球 (kickoff <= now)
  return isMatchStarted(match);
}
```

**为什么不扫 final + scorers**: 完赛后 scorers 不会再变, 重新扫也是冗余; 而且重启时 `prevScores` 有 final scorers, 不会被 `_diffNewGoals` 推 (被 status 过滤)。

### 5.5 启动一次性扫描

`startGoalWatcher` 调一次 `_sweepOnce(Date.now(), deps)`, 拉启动前已在 live 的比赛, 推未在 notified list 里的进球。**已知副作用**: state.json 损坏时一次性推历史进球 (v1 接受)。

## 6. UI 渲染细节

### 6.1 系统通知 (macOS Notification Center)

```text
标题: 进球 · 77' 梅西
正文: 阿根廷 vs 法国 · 当前 1-0
图标: app icon
声音: 默认
```

可选前缀:

- 乌龙球 · 77' 阿尔瓦雷斯 (自家进自家)
- 点球 · 85' 姆巴佩 (12 码点球)

### 6.2 通知点击 → 滚到比赛

```text
[User 点击通知]
  ↓
main: ElectronNotification 'click' 事件
  ↓ mainWindow.show() + focus
main → renderer: worldcup:focus-match { matchKey }
  ↓
renderer: WorldcupView useEffect handler
  ↓
  1. setActiveSubTab("schedule")  // 切到赛程 sub-tab
  2. requestAnimationFrame
  3. document.querySelector(`[data-match-key="${matchKey}"]`)
  4. el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  5. el.classList.add("match-row-highlight")
  6. setTimeout 3000ms → el.classList.remove("match-row-highlight")
```

### 6.3 高亮动效 (CSS)

```css
.match-row-highlight {
  animation: goal-highlight-pulse 3s ease-out;
}

@keyframes goal-highlight-pulse {
  0%   { background-color: rgba(255, 215, 0, 0.55); }
  60%  { background-color: rgba(255, 215, 0, 0.20); }
  100% { background-color: transparent; }
}
```

### 6.4 match row 加 data-match-key

```jsx
// WorldcupView.jsx 的 match row 根 div
<div
  className="match-row"
  data-match-key={matchKey(match)}
  onClick={() => onMatchClick(match)}
>
  {/* team1, score, team2, time, status */}
</div>
```

## 7. 错误处理

| 场景 | 行为 |
| --- | --- |
| fixturesTxt 缓存不存在 | 本轮跳过, log info "no_fixtures"; 等待下次 fetch 写缓存 |
| parseWorldcupTxt 抛错 | 本轮跳过, log warn; 状态不动 |
| refreshScores 失败 (ok=false) | 本轮跳过, log warn; 不动 notified (下次会重试) |
| refreshScores throw | onError 触发, log warn, 状态不动 |
| onGoal throw (单条进球) | 跳过该进球, log warn; 该 goalKey 仍写入 notified (避免下次重推) |
| state.json 写盘失败 | log warn, 不影响 IPC; 下次 sweep 重试 |
| state.json 损坏 | 走 `_readStateRaw` 兜底 `{}`, notified 视为空; 启动一次性重推历史进球 (一次性副作用, 可接受) |
| ElectronNotification.isSupported() = false | 静默跳过, log info |
| 通知被系统屏蔽 | 静默, log info "notification shown but not displayed" |
| quiet hours 期间进球 | 吞掉, 不补推; log info "quiet hours skip" |
| 完赛比赛重启扫 | `_diffNewGoals` 过滤 (status=final + scorers 非空 → 跳过) |
| 单场 goalKey > 50 | 截尾 (`.slice(-50)`), 老的被淘汰 (下次重抓时也不会重推, 因为 final 过滤) |
| 同一场比赛 5 分钟内 3+ 进球 | 仍按 1 条/进球推, 不合并 (v1 YAGNI) |
| 5h 窗口内重复进球 (ESPN 偶发) | 第二次因为 prevScorers 含 → 不推 |
| renderer 端找不到 matchKey 对应 element (DOM 还没渲染) | `requestAnimationFrame` 兜底, 仍找不到就 log warn, 不报错 |

## 8. 测试

### 8.1 `tests/main/worldcup/goal-watcher.test.js` (9 个)

| # | 测试 | 输入 | 期望 |
| --- | --- | --- | --- |
| 1 | `_goalKeyOfScorer` 基础 | `{ minute: "77'", player: "Messi", teamSide: "team1" }` | `77'&#124;Messi&#124;team1` |
| 2 | `_goalKeyOfScorer` 补时 | `{ minute: "90+3'", player: "X", teamSide: "team2" }` | `90+3'&#124;X&#124;team2` |
| 3 | `_goalKeyOfScorer` 乌龙/点球不影响 key | `{ minute: "60'", ownGoal: true, penalty: true }` | `"60'\|undefined\|team1"` (key 只看 minute/player/teamSide) |
| 4 | `_diffNewGoals` 空 → 空 | `prevScores={}, newScores={}` | `[]` |
| 5 | `_diffNewGoals` 新增 1 进球 | prevScores 无, newScores 有 `77' Messi team1` | 1 个 `{ matchKey, scorer, key }` |
| 6 | `_diffNewGoals` 已知不重推 | prevScorers 含 `77' Messi team1` | `[]` (走 prevScorers 二次过滤) |
| 7 | `_diffNewGoals` 多进球 | 2 个 scorer, prevScorers 空 | 2 个 goalKey 都返回 |
| 8 | `_diffNewGoals` 完赛不再推 | newScores entry.status=final + scorers=[A] | `[]` (走 status 过滤) |
| 9 | `_diffNewGoals` notified 重复推 | prevNotified 含 `77' Messi team1` 但 prevScorers 无 (state 损坏场景) | `[]` (走 notified 二次过滤) |

### 8.2 `tests/main/worldcup/goal-watcher-notification.test.js` (2 个)

| # | 测试 | 输入 | 期望 |
| --- | --- | --- | --- |
| 1 | `_formatGoalNotification` 基础 | scorer 基础 + fixture | title 含 "进球", body 含比分 |
| 2 | `_formatGoalNotification` 乌龙前缀 | scorer.ownGoal=true | title 含 "乌龙球" |

### 8.3 `tests/main/worldcup/goal-watcher-sweep.test.js` (1 个端到端 mock)

| # | 测试 | 输入 | 期望 |
| --- | --- | --- | --- |
| 1 | `_sweepOnce` 端到端 | mock refreshScores 返回新进球, mock onGoal, mock patchState | onGoal 调 1 次, state.worldcupGoalNotified 写入新 key |

### 8.4 `tests/renderer/worldcup-focus-match.test.jsx` (1 个 smoke)

| # | 测试 | 输入 | 期望 |
| --- | --- | --- | --- |
| 1 | `worldcup:focus-match` IPC 触发滚到比赛 | mock ipcRenderer.on, 渲染含 `data-match-key` 的 fixture | 调 scrollIntoView, 3 秒后移除 highlight class |

## 9. 文件清单

### 9.1 新增 (3)

- `src/main/worldcup/goal-watcher.js` (~250 行, 调度 + 纯函数)
- `tests/main/worldcup/goal-watcher.test.js` (~150 行, 9 测试)
- `tests/main/worldcup/goal-watcher-notification.test.js` (~50 行, 2 测试)
- `tests/main/worldcup/goal-watcher-sweep.test.js` (~100 行, 1 测试)
- `tests/renderer/worldcup-focus-match.test.jsx` (~80 行, 1 测试)

### 9.2 修改 (5)

- `src/main/state-store.js`: `PRESERVE_FIELDS` 数组加 `{ key: "worldcupGoalNotified", kind: "object", notArray: true }`
- `src/main/bootstrap/schedulers.js`: 新增 `startWorldcupGoalWatcher` / `stopWorldcupGoalWatcher`, 接入 start 流程, before-quit 注册 stop
- `src/main/index.js` (或 scheduler 启动处): 调 `startWorldcupGoalWatcher({ getWindow, sendToRenderer, getConfig, log })`
- `src/renderer/worldcup/WorldcupView.jsx`: match row 根 div 加 `data-match-key={matchKey(match)}`; useEffect 订阅 `worldcup:focus-match`
- `src/renderer/styles.css`: 加 `.match-row-highlight` class + `@keyframes goal-highlight-pulse`

### 9.3 复用 (不修改)

- `src/main/worldcup/scores-fetcher.js` (`refreshWorldcupScores`)
- `src/main/worldcup/match-key.js` (`matchKey`, `isMatchStarted`, `matchKickoffUtcMs`)
- `src/main/worldcup/parser.js` (`parseWorldcupTxt`)
- `src/main/notification-policy.js` (`inQuietHours`)
- `src/main/state-store.js` (`loadWorldcupTxt`, `loadWorldcupScores`, `patchState`, `load`)
- `src/main/log.js` (`mainLog`)

## 10. 范围之外 (YAGNI)

- ❌ 全联赛通用 — 仅 2026 世界杯
- ❌ 关注球队列表 / 静音球队列表 — v1 全推
- ❌ 比赛开始 / 结束 / 半场 通知 — 仅进球
- ❌ 比分变更通知 (ESPN scorers 漏字段时) — 记 backlog, v2 再加
- ❌ 把进球推到 recent-activity
- ❌ 把进球推到 App 内弹窗 (tray popover) — 跟系统通知重复
- ❌ iOS / Web push — Electron Notification 已够
- ❌ Quiet hours 期间补推 (凌晨轰炸风险)
- ❌ 双源交叉验证 (ESPN + worldcup26) — ESPN scorers 已够
- ❌ bracket snapshot 推进球通知 — 独立模块
- ❌ `web-push` / `node-pushnotifications` — YAGNI
- ❌ sqlite 存 notified — state.json 已够
- ❌ 通知声音自定义 — 走系统默认
- ❌ 通知分组 (按场次 / 按时间) — YAGNI
- ❌ 5 分钟内 3+ 进球合并为「帽子戏法」 — 记 backlog
- ❌ renderer 内自己写 setInterval 轮询 — 调度只在 main
- ❌ 把状态从 `state.json` 搬到 `worldcup-goals.json` 独立文件 — YAGNI
- ❌ 完整 i18n — v1 写死 zh-CN
