# Pulse 世界杯淘汰赛对阵模块 (Bracket)

- **日期**: 2026-06-14
- **作者**: brainstorming-2 (with user)
- **状态**: 待用户 review
- **项目类型**: macOS 菜单栏 Electron 应用 (Pulse v2.11+)
- **目标特性**: 在世界杯 tab 加第 4 个 sub-tab「对阵」，实时计算 2026 世界杯完整淘汰赛 bracket（小组赛 → 1/16 决赛 → 1/8 决赛 → 1/4 决赛 → 半决赛 → 决赛 + 季军赛），依据 FIFA 官方 Annex C 表 + 495 组合规则。

## 0. 决策日志 (brainstorming-2 产出)

| 决策点 | 选择 | 备选 + 否决理由 |
|---|---|---|
| 范围 | **完整 bracket 5 阶段 + 季军赛** (32→1) | 只 R16+（缺 Round of 32 新增）/ 仅决赛（信息不足） |
| 数据源 | **硬编码 FIFA Annex C 表 row 1 (默认) + 495 组合 warning** (openfootball TXT 只到小组赛，没 knockout 阶段) | scrape FIFA 官网（脆弱）/ 等 openfootball 更新（要数月）/ 完整 495 行表（YAGNI, v1 默认 row 1 简化） |
| 计算位置 | **main process 算 (纯函数), IPC 拉** | renderer useMemo（启动空白）/ 后台轮询（流量） |
| 触发 | **用户点 🔄 触发** + tab mount 拉缓存 | 30s 自动轮询（违背用户主动）/ 每次 mount 重算（CPU） |
| 入口 | **WorldcupHeader 第 4 sub-tab「对阵」** | 并入赛程（信息密度炸）/ 拆成 2 sub-tab（YAGNI） |
| 布局 | **传统 bracket tree (5 阶段垂直堆叠 + SVG 连线)** | 按阶段分组列表（不是 bracket）/ 表格（信息密度低） |
| 未完态 | **「按当前结果推测」+ 🔒 待定徽标** | 不渲染（用户看不到）/ 手动模拟器（YAGNI） |
| 卡片交互 | **可点 (复用 SquadModal)** | 只展示（体验差） |
| 第3名晋级 | **FIFA 标准排序 (pts→gd→gf), 选 top 8** | 不排都待定（无信息）/ 手动录入（违背自动） |
| Annex C 匹配 | **完整 495 行表** | 单条默认（覆盖率低）/ fallback 简化（信息丢失） |
| 缓存 | **`state.json` 顶层 `worldcup_bracket_snapshot`**，启动可显示 | 不缓存（启动空白）/ sqlite（工程过重） |
| 错误处理 | **snapshot.warnings[] 不阻断** + IPC fail 返 ok:false | 静默（用户不知）/ 抛错（崩溃风险） |
| 测试 mock | **白盒 fixture (groupResults + scores → snapshot)** | nock server（黑盒 CI 慢） |
| Out of scope | **30s 轮询 / 多 region / 历史版本 / 模拟器 / desktop notification** | 跟 v1 无关 |

## 1. 目标

### 1.1 必须达成

- [A] 新模块 `src/main/worldcup/bracket-rules.js` 纯函数库: `sortThirdPlaced` / `selectThirdPlaced` / `matchAnnexCCase` / `resolveR32Matchups` / `propagateWinner` / `computeBracket` 6 个函数
- [A] `computeBracket(matches, scores, teamsData)` 主入口返 `BracketSnapshot { version, computedAt, inputsHash, projected, r32, r16, qf, sf, final, third, thirdPlacedAdvancing, annexCIndex, warnings }`
- [A] 硬编码 FIFA Annex C 默认行 (row 1) + R32-R16-QF-SF-Final-Third 全部 32 场队伍映射 (W73 vs W75 等) — Annex C 495 行完整表 v2 再补 (v1 默认 row 1 + warning 'simplified_annex_c_default_row')
- [A] 硬编码 Round of 32+ 全部 32 场的 Match 73-104 队伍映射规则 (W73 vs W75, W89 vs W90 等)
- [A] FIFA 第3名标准排序: pts → gd → gf → fairPlay → fifaCoeff 兜底
- [A] Annex C 495 表精确匹配 (top 8 group letters 集合相等)，未命中走 fallback (8 winner 都各自打 best3) + warning
- [A] 5 阶段全部走 `propagateWinner` 链式: R32 → R16 → QF → SF → Final + 季军赛 (L101/L102)
- [A] 已完赛 R32 场次 → R16 对应 slot 填真实胜者 (走 `worldcupScores`)
- [A] 未完赛 R32 → R16 slot 显示「胜者 W73」灰色占位 + 🔒 徽标
- [A] 新 IPC 通道 `worldcup:compute-bracket`, 入参 `{ force?: bool }`, 返 `{ ok, snapshot?, reason?, error? }`
- [A] `state.json` 顶层新字段 `worldcup_bracket_snapshot`，老 state.json 无该字段 → load 返 null
- [A] 复用现有 `patchState` 范式，写 snapshot 不丢其他字段
- [A] `worldcup:compute-bracket` 失败时不写 state.json（保留上次成功 snapshot）
- [A] tab mount 拉缓存 snapshot（不重算），仅 🔄 按钮触发 IPC
- [A] WorldcupHeader 加第 4 sub-tab `对阵` (icon `🏆`)
- [A] `WorldcupBracketView` 渲染 5 阶段 (R32 / R16 / QF / SF / Final+Third) + SVG 连线 + match card
- [A] match card 4 状态: `pending` (已确定两队) / `projected` (W73 占位) / `live` / `final`
- [A] card 可点 → 复用 `SquadModal` (传 `{ _isBracket: true }`)
- [A] snapshot 元信息条: 「上次计算 X 秒前 · 基于 N 个已完成小组 · 待小组赛完赛」+ warnings 列表
- [A] IPC 失败红条 + 重试按钮
- [A] 小组赛全未赛 → 空态「小组赛尚未开始」
- [A] 8 个测试覆盖 bracket-rules (sortThirdPlaced / selectThirdPlaced / matchAnnexCCase 4 例 / resolveR32Matchups / propagateWinner 2 例 / computeBracket 端到端 2 例) + 2 个 IPC 测试 + 1 个 renderer smoke 测试

### 1.2 应该达成 (nice-to-have)

- [B] snapshot.inputsHash (sha256 over groupResults+scores) → 拉缓存时短路 (避免重复算)
- [B] ⚠️ 图标显示 `warnings.length` 数量
- [B] 卡片 hover 显示来源 (`A 组第1` / `B 组第2` / `3CEFHI` 含义)
- [B] 季军赛单独视觉 (不同于正赛)

### 1.3 不会做 (out of scope)

- ❌ 30s 自动轮询 — 用户手动控制原则
- ❌ 多 region / 多赛事 — 仅 2026
- ❌ bracket 历史版本 — 只保留最新 snapshot
- ❌ 把 bracket 推到 recent-activity
- ❌ desktop notification
- ❌ 「假设某队出线」模拟器
- ❌ 把 bracket 推到现有 MatchAiPanel (复用 SquadModal 已够)

## 2. 架构

```
┌──────────────────────────────────────────────────────────────┐
│  src/main/worldcup/                     (新文件)            │
│  ├── bracket-rules.js         纯函数 (无 IO, 易测)           │
│  │   ├── sortThirdPlaced()    FIFA 标准排序 12 第3           │
│  │   ├── selectThirdPlaced()  top 8 晋级                     │
│  │   ├── matchAnnexCCase()    495 组合精确匹配               │
│  │   ├── resolveR32Matchups() 16 R32 场次真实队名            │
│  │   ├── propagateWinner()    链式推进下一阶段              │
│  │   └── computeBracket()     主入口 (组合上面)              │
│  └── bracket.js               IPC handler                    │
│                                                              │
│  src/renderer/worldcup/                                       │
│  ├── bracketStore.js          signal + IPC 拉                │
│  │   ├── worldcupBracket        signal<BracketSnapshot|null> │
│  │   ├── bracketComputing      signal<bool>                 │
│  │   ├── bracketError          signal<string|null>           │
│  │   └── computeBracket()      IPC 调用 + 写 snapshot        │
│  └── WorldcupBracketView.jsx  渲染 bracket tree + SVG       │
└──────────────────────────────────────────────────────────────┘

数据流:
  1. user 点 🔄 或 mount tab
     → IPC 'worldcup:compute-bracket' { force: false }
     → main: 拉 cached fixtures TXT (state.json.worldcup_fixtures_txt)
            → parseWorldcupTxt → matches
            → 读 cached scores (state.json.worldcup_scores)
            → bracket-rules.computeBracket(matches, scores, teamsData)
            → 写 state.json.worldcup_bracket_snapshot
     → renderer: signal 更新 → 重新渲染

  2. tab mount (无 🔄 触发)
     → IPC 'worldcup:load-bracket'
     → main: 读 state.json.worldcup_bracket_snapshot (若存在)
     → renderer: 拿 snapshot → 渲染

边界:
  - group 未完赛: 该组 winning/runnerUp 仍按已赛场次算
    (FIFA 退一规则: 1 场未赛 → GD/GF 假设最差)
  - < 8 第 3: annexC 仍匹配 (best-effort), warning 'less_than_8_thirds'
  - annexC 未命中: fallback 走简化版, warning 'annexC_mismatch_fallback'
```

## 3. 模块拆分

### 3.1 `src/main/worldcup/bracket-rules.js`

```js
/**
 * 纯函数库。0 IO, 0 state。可独立单测。
 *
 * 数据契约:
 *   matches:    [{ stage, team1, team2, score, date, time, ... }]
 *   scores:     { [matchKey]: { ft, status, et?, pen? } }
 *   teamsData:  [{ group: 'A', name: 'Mexico', cn: '墨西哥', ... }]
 */

// sortThirdPlaced(groupStandings) → [{ group, pts, gd, gf, ga, played }]
//   按 FIFA 标准: pts DESC → gd DESC → gf DESC → fairPlay → fifaCoeff
//   input: { 'A': standingA, 'B': standingB, ... }
//   output: 12 个第3降序

// selectThirdPlaced(sortedThird) → string[]
//   选 top 8 group letter, 例 ['E', 'I', 'J', 'K', 'L', 'D', 'F', 'G']
//   若 < 8 组完赛 → 返所有完赛的 (warnings 由 caller 加)

// matchAnnexCCase(advancingGroups) → { rowIndex, eightWinners, eightThirdSlotted }
//   495 行表, 每行 8 个 winner group letters 集合 == advancingGroups
//   返 rowIndex (0-494) + 该行所有 W-N 映射
//   未命中 → 返 null, caller 走 fallback

// resolveR32Matchups(annexCase, groupResults) → R32Matchup[16]
//   输入: annexCase 行的 16 R32 模板 + 12 组 winner/runnerUp/third
//   输出: [{ matchNum: 73, team1: {name, source}, team2: {name, source}, ... }, ...]
//   team1/team2.source ∈ { 'group:winner' | 'group:runnerUp' | 'group:third' | 'best-third-pool' }

// propagateWinner(prevStage, matchScores) → NextStageSlots
//   输入: R32Matchup[16] + 当前已赛比分 → R16Slot[16] { team: name|null }
//   已赛 → 填胜者 (走 score.ft + 决胜规则 et/pen)
//   未赛 → null (caller 标 'projected')

// computeBracket(matches, scores, teamsData) → BracketSnapshot
//   主入口: 串联 sortThirdPlaced → selectThirdPlaced → matchAnnexCCase
//   → resolveR32Matchups → propagateWinner ×4 (R32→R16→QF→SF→Final/Third)
//   → 收集 warnings + 算 inputsHash
```

### 3.2 `src/main/worldcup/bracket.js`

```js
// IPC handler
//   'worldcup:compute-bracket' (入参 { force?: bool })
//     → loadFixturesTxt({ force }) (复用现有 src/main/worldcup/fetcher.js)
//     → parseWorldcupTxt (复用现有 src/main/worldcup/parser.js)
//     → loadWorldcupScores() (复用现有 src/main/worldcup/scores-fetcher.js
//                              + state-store.worldcup_scores)
//     → loadTeamsData() (复用现有 src/renderer/worldcup/teams-data.js 走 IPC 拉)
//     → computeBracket(matches, scores, teamsData) (新)
//     → patchState({ worldcup_bracket_snapshot: snapshot }) (复用现有 patchState)
//     → 返 { ok, snapshot } 或 { ok: false, reason }
//   'worldcup:load-bracket' (无入参)
//     → stateStore.loadWorldcupBracket() (新, 走 state-store.read)
//     → 返 { ok, snapshot } 或 { ok: true, snapshot: null }
```

### 3.3 `src/renderer/worldcup/bracketStore.js`

```js
// Signals
export const worldcupBracket = signal(null);     // BracketSnapshot | null
export const bracketComputing = signal(false);
export const bracketError = signal(null);
export const bracketLastComputedAt = signal(null);

// Functions
export async function loadBracket()              // 拉缓存
export async function computeBracket()           // IPC 调用 + 写 snapshot
```

### 3.4 `src/renderer/worldcup/WorldcupBracketView.jsx`

```jsx
export function WorldcupBracketView() {
  const snapshot = worldcupBracket.value;
  const computing = bracketComputing.value;
  const error = bracketError.value;

  // mount 拉缓存
  useEffect(() => { loadBracket(); }, []);

  // 错误态 / 加载态 / 空态 / 正常
  // 5 阶段: R32 / R16 / QF / SF / Final+Third
  //   每阶段: 阶段标题 + badge (16/8/4/2/1 场) + match card grid
  //   match card 4 状态: pending/projected/live/final
  // SVG 连线: 从 R32 → R16 → QF → SF → Final
}
```

## 4. 数据契约 (BracketSnapshot)

```ts
type BracketSnapshot = {
  version: 1;
  computedAt: number;              // Date.now()
  inputsHash: string;              // sha256(groupResults+scores)
  projected: boolean;              // true = 小组赛未全部完赛

  // 5 阶段 + 季军赛
  r32: BracketMatch[];             // 16 项, matchNum 73-88
  r16: BracketMatch[];             // 8 项, matchNum 89-96
  qf:  BracketMatch[];             // 4 项, matchNum 97-100
  sf:  BracketMatch[];             // 2 项, matchNum 101-102
  final: BracketMatch;             // 1 项, matchNum 104
  third: BracketMatch;             // 1 项, matchNum 103

  // 上下文
  thirdPlacedAdvancing: string[];  // 8 个晋级第3 group letter
  annexCIndex: number;             // 0-494, 或 -1 (fallback)
  warnings: string[];
};

type BracketMatch = {
  matchNum: number;                // 73, 89, 97, 101, 103, 104
  team1: BracketTeam | null;
  team2: BracketTeam | null;
  score: ScoreEntry | null;        // 来自 worldcupScores (若已赛)
  date: string;                    // 'YYYY-MM-DD'
  time: string;                    // 'HH:MM'
  venue: string;
  status: 'pending' | 'projected' | 'live' | 'final';
  source1?: string;                // 'group:A:winner' | 'r32:73' | ...
  source2?: string;
};

type BracketTeam = {
  name: string;                    // 'Mexico'
  cn: string;                      // '墨西哥' (从 teamsData 查)
  flag: string;                    // 🇲🇽
  source: 'group:winner' | 'group:runnerUp' | 'group:third' |
          'winner:r32:73' | 'winner:r16:89' | ... |
          'loser:sf:101';
};
```

## 5. 关键算法

### 5.1 第3名排序

FIFA 2026 规则 (Annex C.3):
1. **积分** (pts) DESC
2. **净胜球** (gd) DESC
3. **进球数** (gf) DESC
4. **Fair Play points** (卡片黄红牌累计)
5. **FIFA Coefficient** (国家队排名积分)

我们 v1 简化到前 3 个 (fair play / fifa coeff 数据源不易拿), 不命中 → warning 'third_sort_fallback_to_top3'

### 5.2 Annex C 495 行表

存储格式 (src/main/worldcup/bracket-rules.js 内的常量):
```js
const ANNEX_C_TABLE = [
  // 每行: 8 winner groups 集合 (sorted), 例 ['B','C','D','E','F','I','K','L']
  // 匹配: 8 晋级第3 group letter 集合 == ANNEX_C_TABLE[i]
  // 行 index (0-494) 决定 16 R32 模板
];
```

实际我们不**直接**存 495 行 (500+ 行表是 YAGNI)，改为 **8 个晋级的第3 → 哪些 winner group 参与** 的关系映射。FIFA 表格的实质是「哪些 winner 打 best-third，哪些 winner 之间互打」。v1 实现:

- 8 晋级第3 group letters → 取 8 个 winner groups (固定: 每个晋级第3 配 1 winner)
- 4 个 runnerUp 之间互打 (固定 matchup, Annex C 表第 1 行: 2A vs 2B, 2E vs 2I, 2K vs 2L, 2D vs 2G)

> 注: FIFA 真实表格有 495 种是因为 8 best-third 组合不同, 我们用**默认**排列 (Annex C 表 row 1), warning 标注 `simplified_annex_c_default_row`

### 5.3 propagateWinner 胜者判定

```
match.status === 'final':
  if score.ft[0] > score.ft[1]: team1 胜
  elif score.ft[0] < score.ft[1]: team2 胜
  elif score.et: 同样规则
  elif score.pen: 同样规则 (pen[0]/pen[1])
  else: error (完赛但没胜者, warning 'match_no_winner')
```

### 5.4 inputsHash 算 fingerprint

```js
function hashInputs(groupResults, scores) {
  const payload = JSON.stringify({
    g: groupResults,
    s: Object.fromEntries(
      Object.entries(scores).sort(([a], [b]) => a.localeCompare(b))
    ),
  });
  return 'sha256:' + sha256(payload).slice(0, 12);
}
```

## 6. UI 渲染细节

### 6.1 状态徽标

| status | 视觉 |
|--------|------|
| `pending` | 中性灰背景 + 「未赛」徽标 |
| `projected` | 暗灰 + 🔒 + 「待定」徽标 |
| `live` | 红色 dot + 实时比分 (跟 MatchCard 一致) |
| `final` | 胜方高亮 + ✓ + 推进连线高亮 |

### 6.2 SVG 连线

- R32 (16 场) → R16 (8 场): 每 2 个 R32 连到 1 个 R16
- R16 (8) → QF (4): 每 2 个 R16 连到 1 个 QF
- QF (4) → SF (2): 每 2 个 QF 连到 1 个 SF
- SF (2) → Final (1) + Third (1)

连线规则 (bracket 走向):
- R32 match 73+74 → R16 match 89
- R32 match 75+76 → R16 match 90
- ... (按 FIFA 官方 mapping)
- 横向走线, 颜色: `#888` (default) / `#4ade80` (胜者已确定高亮)

### 6.3 元信息条 (footer)

```
「上次计算: 12 秒前 · 基于 5 个已完成小组 · 待小组赛完赛」
「⚠️ 1 个 warning: simplified_annex_c_default_row」
```

### 6.4 错误态

- IPC fail → 「计算失败: <reason>」红条 + 🔄 按钮 (re-call computeBracket)
- 小组赛全未赛 → 「小组赛尚未开始」空态
- 小组赛部分完 → 「按当前结果推测 (待小组赛完赛)」banner

## 7. 错误处理

| 场景 | 行为 |
|------|------|
| IPC 失败 | renderer 「计算失败: <reason>」红条 + 🔄 重试 |
| 小组赛全未赛 | snapshot 返 null, UI 空态「小组赛尚未开始」 |
| 小组赛部分完 | snapshot.projected = true, UI 「待小组赛完赛」banner |
| Annex C 未命中 | warning 'simplified_annex_c_default_row', fallback 走 row 1 |
| 第3名 < 8 个 | warning 'less_than_8_thirds', selectThirdPlaced 返 N 个 |
| 某场 R32 比分异常 | 该场 status='pending', warning 'match_X_no_score', 不阻断 |
| 胜负无解 (完赛但无 ft) | warning 'match_no_winner', propagateWinner 跳过该 slot |
| snapshot 写入失败 | mainLog.warn, 不影响 IPC 返回 (in-memory 仍可用) |

## 8. 测试

### 8.1 `tests/main/worldcup-bracket-rules.test.js` (8 个)

1. `sortThirdPlaced`: 12 第3 排序按 pts/gd/gf
2. `selectThirdPlaced`: top 8 选
3. `matchAnnexCCase`: 4 种不同 8-group-letter 集合命中
4. `resolveR32Matchups`: 命中后 16 R32 场次 team1/team2 正确
5. `propagateWinner`: R32 全部 final → R16 slot 全部填胜者
6. `propagateWinner`: R32 部分 final → 未赛 slot 显示 'W73' 占位
7. `computeBracket` 端到端: 12 组全完赛 → 完整 bracket, projected=false
8. `computeBracket` 小组赛未完: projected=true + warnings 含 'group_X_incomplete'

### 8.2 `tests/main/worldcup-bracket-ipc.test.js` (2 个)

1. handler 调用 → 写 state.json.worldcup_bracket_snapshot, 返 ok
2. handler 失败 (parser throw) → 返 `{ ok: false, reason }`, state.json 不写

### 8.3 `tests/renderer/worldcup-bracket-view.test.jsx` (1 个 smoke)

1. 给 snapshot fixture → 渲染 bracket tree, 不崩, match cards 正确渲染

## 9. 文件清单

### 9.1 新增 (5)

- `src/main/worldcup/bracket-rules.js` (~400 行, 含 495 行表 + Annex C 映射)
- `src/main/worldcup/bracket.js` (~80 行, IPC handler)
- `src/renderer/worldcup/bracketStore.js` (~80 行, signal + IPC)
- `src/renderer/worldcup/WorldcupBracketView.jsx` (~300 行, UI + SVG)
- `tests/main/worldcup-bracket-rules.test.js` (~250 行, 8 测试)

### 9.2 修改 (5)

- `src/main/state-store.js`: 加 `worldcup_bracket_snapshot` load/save + patchState 支持
- `src/main/ipc.js`: 加 `worldcup:compute-bracket` / `worldcup:load-bracket` 通道注册
- `src/renderer/worldcup/WorldcupHeader.jsx`: WC_SUBTABS 加 `{ key: 'bracket', label: '对阵', icon: '🏆' }`
- `src/renderer/worldcup/WorldcupLayout.jsx`: subTab === 'bracket' 路由分支
- `preload.js`: 暴露 `worldcupComputeBracket` / `worldcupLoadBracket` API

### 9.3 新增测试 (3)

- `tests/main/worldcup-bracket-rules.test.js` (8 测试)
- `tests/main/worldcup-bracket-ipc.test.js` (2 测试)
- `tests/renderer/worldcup-bracket-view.test.jsx` (1 测试)

## 10. 范围之外 (YAGNI)

- ❌ 30s 自动轮询 — 流量 + 用户主动控制原则
- ❌ 多 region / 多赛事 — 仅 2026
- ❌ bracket 历史版本 (v1→v2→v3 对比)
- ❌ 把 bracket 推到 recent-activity
- ❌ desktop notification (某阶段开始时)
- ❌ 「假设某队出线」模拟器
- ❌ bracket 推到现有 MatchAiPanel (复用 SquadModal 已够)
- ❌ 把 bracket 数据导出 CSV
- ❌ bracket 推送外部 (Slack / Discord webhook)
- ❌ 把 495 行完整 Annex C 表都 hardcode (v1 用 row 1 默认, warning 标注)
- ❌ Fair Play / FIFA Coefficient 第3名排序兜底 (FIFA 数据不易拿, v2 再加)
