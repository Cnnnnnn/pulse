# World Cup Bracket Layout Redesign (2026-06-30)

## Problem

`src/renderer/worldcup/BracketTree.jsx` 当前实现的三种视图模式都有视觉/交互问题，
整体观感被用户评价为"太丑"：

1. **单 stage tab 视图**（默认）只画 2 列（current + next stage）—— 必须切 tab 才能看全 R32→Final，
   中间 stage（r16/qf/sf）的晋级关系完全靠 tab 跳转。
2. **全景模式**（5 列横排）卡片缩到 152px，16 张 R32 卡挤在一列，字小、flag 小、比分糊。
3. **窄屏 fallback** 退化为垂直堆叠的 5 段 → 与 tab 模式断崖式跳变，体验碎裂。
4. **MatchCard 单行布局**（队1 vs 队2）信息扁平，缺少"对阵感"，16 张卡视觉同质。
5. **Final/Third 金色渐变**（`.bracket-card--final-prominent`）与其它卡片风格脱节。
6. **SVG L 型折线 connector** 在密集卡片间既不优雅也不易读；连线压在 column 之上需要 `z-index: 2` 才能看清。

## Goal

把对阵图重做为一张**完整可视的世界杯标准 bracket tree**：

- 一屏呈现 R32→R16→QF→SF→Final 的完整晋级结构（不需要切 tab）。
- 整体浅色现代风格（脱离当前深色背景）。
- 中央突出决赛奖杯卡；季军赛融入中央，从两个 SF 败者引出线。
- 整体等比缩放适配窗口宽度，永远不需要水平滚动。
- MatchCard 信息层级清晰，胜方突出、待定占位明确。

## Design Decisions (Approved in Brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| 整体布局 | **FIFA 标准 bracket tree** — 上半区 + 下半区，向中央汇聚 | 一张图讲完整届赛事，不需要 tab 切 |
| MatchCard 版式 | **双行 + 大比分**（ponytail 决策：ESPN 风双行版） — 上队1+比分 / 分隔线 / 下队2+比分 | 比单行信息层级清晰，胜方文字加粗 |
| Final 样式 | **中央奖杯卡** — 金色渐变边框 + 🏆 标题，比其它卡宽 30% | 与用户选 trophy_card 一致 |
| 主题 | **浅色现代风** — 白底 + 高级灰 + 蓝色点缀 | 与 app 其它面板（最近活动、收藏夹）统一 |
| 溢出策略 | **整体缩放** — 用 `transform: scale()` 等比缩放 bracket，永远整体可见 | 用户选 scale_zoom；不引入水平滚动 |
| 季军赛位置 | **SF 与 Final 之间** — 从两个 SF loser 引出线汇聚 | 用户选 center_layout；FIFA 官方标准 |
| 窄屏 fallback | **保留但仅窄屏触发** — `< 700px` 时退回垂直堆叠；≥ 700px 走整体缩放 | 极窄窗口缩得太小看不清，宁可分段 |

## Architecture

### Component 结构（重写）

```
<BracketTree snapshot onMatchClick>
└── <div class="bracket-tree bracket-tree--tree">
    ├── <StageHeader> "FIFA 2026 淘汰赛对阵"
    ├── <BracketGrid>                       ← 新：上下半区对称布局
    │   ├── <UpperHalf>                     ← R32[0..7] → R16[0..3] → QF[0..1] → SF[0]
    │   ├── <FinalCenter>                   ← 季军赛 + 决赛奖杯卡
    │   └── <LowerHalf>                     ← SF[1] → QF[2..3] → R16[4..7] → R32[8..15]
    └── <BracketConnectors>                 ← 重写：CSS 折线（不用 SVG）
```

### 数据流（不变）

```
bracketStore.computeBracket() → snapshot { r32[16], r16[8], qf[4], sf[2], final, third }
                                  ↓
BracketTree({ snapshot, onMatchClick })
                                  ↓
                              BracketGrid
                                  ↓
                       StageColumn (R32..SF) + FinalCenter
```

`worldcupBracket.value` / `bracketComputing.value` 等 signal 都不变。

### 关键计算（新增）

```js
// 上半区 R32 索引 0..7 → R16 索引 0..3 → QF 索引 0..1 → SF 索引 0
// 下半区镜像: R32 索引 8..15 → R16 4..7 → QF 2..3 → SF 1
function splitBracketByHalf(snapshot) {
  const upperR32 = snapshot.r32.slice(0, 8);
  const upperR16 = snapshot.r16.slice(0, 4);
  const upperQF  = snapshot.qf.slice(0, 2);
  const lowerQF  = snapshot.qf.slice(2, 4);
  const lowerR16 = snapshot.r16.slice(4, 8);
  const lowerR32 = snapshot.r32.slice(8, 16);
  return { upperR32, upperR16, upperQF, lowerQF, lowerR16, lowerR32 };
}
```

这是 FIFA 标准 bracket 的镜像分割。测试要断言这个 split 行为。

## Layout

### 整体结构（CSS Grid + 缩放）

```
┌─────────────────────────────────────────────────────────────┐
│                FIFA 2026 淘汰赛对阵                          │ ← StageHeader
│                                                              │
│ ┌──────────────┬──────────┬───────┬──────┐ ╔══════════╗    │
│ │   R32 (上)   │  R16 (上)│ QF (上)│ SF上 │ ║  🏆 决赛 ║    │ ← 上半区
│ │  ┌─┐ ┌─┐     │ ┌─┐ ┌─┐  │ ┌─┐   │ ┌─┐  │ ║ 队1 vs 队2║   │
│ │  └─┘ └─┘     │ └─┘ └─┘  │ └─┘   │ └─┘  │ ║   比分   ║   │
│ │  ┌─┐ ┌─┐ ... │ ...      │ ┌─┐   │      │ ╚══════════╝    │
│ │  └─┘ └─┘     │          │ └─┘   │      │ ┌──────────┐    │ ← 季军赛
│ │   (8 张)      │  (4 张)  │ (2 张)│ (1张)│ │  季军卡  │    │
│ └──────────────┴──────────┴───────┴──────┘ └──────────┘    │
│                                                              │
│ ┌──────────────┬──────────┬───────┬──────┐                   │
│ │   R32 (下)   │  R16 (下)│ QF (下)│ SF下 │                   │ ← 下半区
│ │  (8 张)      │  (4 张)  │ (2 张)│ (1张)│                   │
│ └──────────────┴──────────┴───────┴──────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### MatchCard (新设计 — 双行版)

```
┌─────────────────────────┐
│  M73  ·  🕐 06/29 18:00 │ ← 头: matchNum + 开球时间（极小灰）
├─────────────────────────┤
│ 🇧🇷 巴西           2 - 0 │ ← 上队 + 右对齐大比分（胜方加粗金黄）
├─────────────────────────┤
│ 🇩🇪 德国           1 - 0 │ ← 下队 + 右对齐比分
├─────────────────────────┤
│ 🏟 洛杉矶 · 已完赛       │ ← 场地 + 状态 badge（极小）
└─────────────────────────┘
```

- 待定: `? - ?` 占位，队伍显示 "A 组第 1" / "R32 #73 胜者"
- live: 左边框红色脉冲
- final: 胜方整行加粗 + 队名金黄色
- projected (待定): 整体 opacity 0.55 + 虚线边

### Final 奖杯卡

```
┌─────────────────────────┐
│       🏆 决 赛 🏆        │ ← 金色渐变背景 + 大号 🏆
├─────────────────────────┤
│ 🇧🇷 巴西           2 - 1 │
├─────────────────────────┤
│ 🇫🇷 法国           1 - 1 │
└─────────────────────────┘
```

宽度比普通 MatchCard 宽 30%，居中悬浮在上半区 SF 和下半区 SF 之间。

### 季军赛卡

普通 MatchCard 样式但带"🥉 季军赛"标识，从两个 SF 卡片左侧引出虚线汇聚到季军卡左侧。

### 连接线

- **R32→R16→QF→SF**: CSS 静态折线（每个非 R32 卡左侧有 2 根 ::before 伪元素线接到上游卡片右侧），零 JS。
- **SF→Final + SF→Third**: SVG（因为从两个 SF 卡汇聚到中央奖杯卡 + 季军卡，位置动态），继续用 `useConnectors`。

**为什么不全用 SVG**：R32→SF 这 24 条连线纯水平对齐，CSS 一根 `::before` 横线即可；用 SVG 要 ResizeObserver 监听 + 重算 + 笛卡尔坐标，得不偿失。

### 整体缩放（CSS transform）

```css
.bracket-tree--tree {
  transform-origin: top left;
  transform: scale(var(--bracket-scale, 1));
  /* JS 监听 ResizeObserver 算 --bracket-scale = containerWidth / bracketNaturalWidth */
}
```

`--bracket-scale` 由一个 useEffect 在 mount 和 resize 时算：
- bracket 自然宽度 = 5 列宽 + 4 个 gap + 卡片 padding
- 容器宽度 = window.innerWidth - padding
- scale = min(1, containerWidth / naturalWidth)

下限 0.4（再小就放弃缩放改走 fallback）。

## State / Signal（不变）

- `worldcupBracket.value` — snapshot
- `bracketComputing.value` — boolean
- `bracketError.value` — string | null
- `bracketLastComputedAt.value` — timestamp
- `loadBracket()` / `computeBracket({force})` / `clearBracketError()` — actions

**删除 state**：
- `WorldcupBracketView` 中的 `currentStage` state — 新设计不需要 tab 切换
- `STAGE_TABS` 数组
- `StageColumn` 中的 `currentCol` / `nextCol` 单一阶段 refs

## 测试影响

需要更新的测试 (`tests/renderer/worldcup-bracket-tree.test.jsx`)：

| 现有测试 | 新期望 |
|---|---|
| "v2.56 single-stage view: renders current + next stage columns (2 total)" | 删除该断言；新设计只渲染整张 bracket |
| "renders MatchCards within R32 column" | 改为：渲染 8 张上半区 R32 + 8 张下半区 R32 |
| "MatchCard displays team1 left + team2 right (single-row layout)" | 改为：MatchCard 双行布局（team1 上、team2 下、比分右侧） |
| "v2.56 single-stage view: connector only renders current→next pair" | 删除；新设计用 CSS 静态折线，连接器只在 Final/Third 用 SVG |
| "v2.56 final stage: renders only final column" | 删除；新设计 Final 在中央，不分页 |
| "v2.56 Final stage tab renders Final card with --final-prominent class" | 改为：默认视图就能看到 `.bracket-card--final-prominent` |
| "v2.56 Third stage tab renders Third card with --third-prominent class" | 改为：默认视图就能看到 `.bracket-card--third-prominent` |
| "fallback renders all 5 stage sections" | 保留 fallback 测试，断言数仍为 5 |

**新增测试**：
- "renders upper half: R32[0..7], R16[0..3], QF[0..1], SF[0]"  — 断言镜像分割
- "renders lower half: R32[8..15], R16[4..7], QF[2..3], SF[1]" — 断言镜像分割
- "renders final card with trophy styling when final exists" — 断言 `.bracket-final-card` 类
- "MatchCard double-row layout: team1 top, team2 bottom, score right" — 断言结构

## 错误处理

不变。`bracketError.value` 走现有 `.bracket-view--error` UI。

## YAGNI (不做的)

- 不做路径高亮动画（用户没要）。
- 不做 hover 展开胜方路径详情（用户没要）。
- 不做"按球队过滤"功能（用户没要）。
- 不引入新依赖（CSS transform + 少量 SVG 都是原生）。
- 不重写 `bracket.js` / `bracket-rules.js`（数据/计算逻辑已经验证）。

## Implementation Plan (概要)

写完设计文档后调用 writing-plans skill 拆分：

1. 重写 `BracketTree.jsx`：删除单 stage tab 模式，引入 splitBracketByHalf + BracketGrid + FinalCenter
2. 重写 styles.css 的 `.bracket-tree*` 块：浅色现代风、双行 MatchCard、CSS 折线、transform: scale
3. 删除 `WorldcupBracketView.jsx` 中 `currentStage` state 和 STAGE_TABS
4. 更新 `tests/renderer/worldcup-bracket-tree.test.jsx`：删除单 stage tab 断言，新增镜像分割 + 双行卡断言
5. 跑 `npm test && npm run build:renderer` 验证