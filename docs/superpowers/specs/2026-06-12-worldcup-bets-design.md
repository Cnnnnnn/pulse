# Worldcup Bets · 世界杯体彩记账 (2026-06-12)

## Problem

Pulse v2.9.0 已经有世界杯专栏（赛程 / 球队 / 射手），但**用户在世界杯期间买了体彩**没有任何地方记：

1. **没有"今天花了多少、盈亏多少"的快速记账** — 想要的是"瞄一眼世界杯至今总账"
2. **没有按比赛日聚合的视图** — 32 场小组赛散在 14 个比赛日，每天的盈亏看不到
3. **没有总投入 / 总盈亏的实时统计** — 完赛后想复盘"这一届世界杯我总共赢了/亏了多少"

## Goal

在 v2.9.0 世界杯 tab **内部**加一个体彩记账功能，让用户能：

- **每个比赛日 2 个数字**（投入 / 盈亏）手填
- **比赛日底部一行小卡**显示当前值 / "未填"占位
- **顶部 stats card** 实时显示总投入 / 总盈亏 / 已填天数 / 未填天数
- **不跟比赛结果自动联动** — 盈亏完全用户手填（用户拒绝玩法 / 赔率 / 中奖状态）

## Non-Goals (Out of Scope)

明确不做，免得后面有人加塞：

1. ❌ 玩法 / 赔率 / 比赛关联 / 中奖状态
2. ❌ 串关（parlay）记录
3. ❌ 跟 FIFA / 比赛结果自动联动算盈亏
4. ❌ 多币种（只 ¥）
5. ❌ 图表 / 走势 / 折线
6. ❌ 导出 CSV
7. ❌ 体彩 sub-tab（只 footer + 顶部 stats）
8. ❌ 跟基金 tab 打通
9. ❌ 跨用户同步
10. ❌ "今天还有 X 场比赛没填"提示

## Design Decisions (Brainstormed)

| Decision | Choice | Rationale |
|---|---|---|
| 范围 | **wc-only（只世界杯 tab）** | 用户明确; 不做通用彩种 |
| 颗粒度 | **per-matchday（每个比赛日 1 行）** | 用户明确; 不要 per-bet / per-ticket |
| 玩法 | **不记玩法 / 赔率** | 用户明确; 砍掉所有"竞猜"维度 |
| 字段 | **stake（投入）+ pnl（盈亏），2 个手填数字** | 跟"不联动比赛结果"一致 |
| 比赛日 UI | **day section 底部一行小卡** | 轻; 不喧宾夺主 |
| 总账 | **顶部 stats card** | 一眼看全 |
| 数据键 | **用比赛日 date (YYYY-MM-DD)** | 跟 `match.date` 1:1 对齐, 不需要手动选日期 |
| 持久化 | **沿用 `fund-store.js` 的 atomic write** | state.json 顶层加 `worldcupBets` key, 跟 `funds` 平级 |
| 架构 | **后端 1 个 store + 3 个 IPC 通道** | 跟现有 `worldcup:*` 通道完全对齐 |

## Data Model

### `state.json.worldcupBets` (持久化, 顶层 key)

```ts
interface WorldcupBets {
  // key = 比赛日 date "YYYY-MM-DD", 跟 match.date 1:1
  [date: string]: WorldcupBetEntry
}

interface WorldcupBetEntry {
  date: string         // "YYYY-MM-DD", 跟 key 一致
  stake: number        // 投入 (元, 整数/小数皆可, ≥ 0)
  pnl: number          // 盈亏 (元, 可正可负, e.g. +120 / -80)
  note: string         // 备注 (≤ 200 字符, 可空)
  updatedAt: number    // unix ms, 最后修改时间
}
```

**为什么用 date 做 key 而不是 array**：
- 比赛日天然不重复, 不需要 id
- upsert / 查询是 O(1)
- 删除 = delete key, 简单

**样例**：

```json
{
  "worldcupBets": {
    "2026-06-12": { "date": "2026-06-12", "stake": 100, "pnl": 120, "note": "", "updatedAt": 1781275908234 },
    "2026-06-13": { "date": "2026-06-13", "stake": 50, "pnl": -50, "note": "阿根廷输了", "updatedAt": 1781275910000 }
  }
}
```

### 内存派生 (不落盘, 每次从 worldcupBets + 比赛日求和算出)

```ts
interface BetsStats {
  totalStake: number   // Σ stake
  totalPnl: number     // Σ pnl
  filled: number       // 有 entry 的比赛日数
  unfilled: number     // 有比赛但没填的比赛日数
  roi: number | null   // totalPnl / totalStake, totalStake=0 时为 null (显示 "—")
}
```

## Architecture

### 后端 (main process)

**新文件**：`src/main/worldcup/bets-store.js`

```js
// API, 跟 fund-store.js 对齐
loadAll(statePath?) → { worldcupBets: { [date]: entry } }
upsert(input, statePath?) → { ok, entry }      // input: { date, stake, pnl, note? }
remove(date, statePath?) → { ok }

// 内部走 stateStore 的 atomic write (跟 funds 同一套)
```

**输入校验**（IPC 层抛错或返 `{ ok: false, reason }`）：

- `date` 必须 `YYYY-MM-DD`
- `stake` 必须 ≥ 0 的有限数（0 合法 — 白嫖）
- `pnl` 任意有限数
- `note` ≤ 200 字符
- 数字 > 1e9 直接拒

**容错**：

- `state.json` 损坏 → `worldcupBets = {}`，不抛
- `upsert` 失败 → store 不变，返错

### IPC 通道 (`src/main/ipc.js`，v2.9.x 区块紧挨着现有 `worldcup:*`)

```js
ipcMain.handle("worldcup:load-bets", ...)
ipcMain.handle("worldcup:upsert-bet", (_evt, { date, stake, pnl, note }) => ...)
ipcMain.handle("worldcup:remove-bet", (_evt, date) => ...)
```

### Preload (`preload.js`)

```js
worldcupLoadBets: () => ipcRenderer.invoke("worldcup:load-bets"),
worldcupUpsertBet: (payload) => ipcRenderer.invoke("worldcup:upsert-bet", payload),
worldcupRemoveBet: (date) => ipcRenderer.invoke("worldcup:remove-bet", date),
```

### API 镜像 (`src/renderer/api.js`)

```js
worldcupLoadBets: pick(overrides, "worldcupLoadBets"),
worldcupUpsertBet: pick(overrides, "worldcupUpsertBet"),
worldcupRemoveBet: pick(overrides, "worldcupRemoveBet"),
```

### 前端 (renderer)

**新文件**：
- `src/renderer/worldcup/betsStore.js` — Preact signals + actions
  - `worldcupBets` (signal, Map 形式)
  - `betsLoaded` (signal, boolean)
  - `loadWorldcupBets()`
  - `upsertWorldcupBet({ date, stake, pnl, note? })`
  - `removeWorldcupBet(date)`
  - 导出纯函数 `computeBetsStats(betsMap, allDates) → BetsStats`

**新组件**：
- `src/renderer/worldcup/WorldcupBetsStats.jsx` — 顶部 stats card
- `src/renderer/worldcup/DayBetFooter.jsx` — 每个 day section 底部小卡 + 行内编辑

**改文件**：
- `src/renderer/worldcup/WorldcupView.jsx`
  - 顶部插入 `<WorldcupBetsStats />`（位置：`WorldcupHeader` 下面、`dayGroups` 上面）
  - `dayGroups.map` 里每个 day section 底部追加 `<DayBetFooter date={date} />`
- `styles.css` 加 3 个新 class

## UI 行为

### WorldcupBetsStats (顶部 stats card)

- 4 个数字横排：总投入 / 总盈亏 / 已填 X 天 / 未填 Y 天
- 总盈亏 ≥ 0 绿色，< 0 红色
- 拉不到比赛日（fetchWorldcupFixtures 失败）→ **不渲染**
- 加载中 → 显示占位 "—"

### DayBetFooter (day section 底部小卡)

- **已填**：`投入 ¥100 · 盈亏 +¥120 [编辑] [清空]`，盈亏颜色同 stats
- **未填**：灰色 `未填 →` 按钮
- **点编辑 / 未填** → 行内展开表单：
  - 2 个 number input: stake / pnl
  - 1 个 textarea (note, 可选)
  - 2 个 button: 保存 / 取消
  - 快捷键: `Esc` 取消, `Cmd/Ctrl+Enter` 保存
- **保存** → 调 `upsertWorldcupBet`，成功后 footer 切到已填态
- **清空** → 调 `removeWorldcupBet(date)`，footer 回到"未填"

## Files (Final Manifest)

**新增 4 个**：
- `src/main/worldcup/bets-store.js`
- `src/renderer/worldcup/betsStore.js`
- `src/renderer/worldcup/WorldcupBetsStats.jsx`
- `src/renderer/worldcup/DayBetFooter.jsx`

**改 5 个**：
- `src/main/ipc.js`（加 3 个 handler）
- `preload.js`（加 3 个 bridge）
- `src/renderer/api.js`（加 3 个 pick）
- `src/renderer/worldcup/WorldcupView.jsx`（插入 stats + footer）
- `styles.css`（3 个新 class）

**加 1 个测试**：
- `tests/main/worldcup-bets-store.test.js`

**版本号**：v2.9.x → v2.10.0（minor bump，新增用户可见功能），changelog 走 `RELEASE-NOTES.md`。

## Testing

### 单测 (vitest, 跟 `fund-store.test.js` 同一模式)

`tests/main/worldcup-bets-store.test.js` 覆盖：

1. `upsert` 新增 / 覆盖 / 删除
2. 输入校验: invalid date / stake < 0 / stake 非 number / pnl 非 number / note > 200 字
3. Atomic write: 模拟崩溃 → state.json 完整
4. `computeBetsStats`: ROI / 空 map / 单天 / 全部 stake=0

### 手测 (build 前 user 必走)

1. 6-12 footer 点"未填" → 填 100 / 120 → 保存 → 立刻显示 100 / +120
2. 顶部 stats card 数字对得上
3. 重启 app → 数字仍在
4. 改同一日期 5 次 → 只剩最后一次
5. 清空 → footer 回到"未填"，stats 数字 -1
6. 输 -50（亏）→ stats 红色
7. 输 0 stake / 200 pnl（白嫖赢了）→ 接受
8. 拉不到比赛日 → 不渲染 stats，不渲染 footer
9. 输错日期格式 (e.g. "2026/06/12") → 拒绝
10. 输 stake = -10 → 拒绝

## Future / Backlog (不做)

- 比赛结果自动联动算盈亏
- 串关
- 多币种
- 图表 / 走势
- 导出
