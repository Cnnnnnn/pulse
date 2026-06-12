# Funds · 基金管理栏目 (2026-06-12)

## Problem

当前 Pulse 只盯 app 版本更新，用户想顺便盯一下自己买的基金：

1. **没有基金盈亏概览** — 每天打开券商 App 太重，要的就是"瞄一眼今天赚/亏多少"
2. **没有持仓记录统一入口** — 份额、成本散落在不同地方（券商 App / 笔记 / 脑子）
3. **没有实时估值跟踪** — 净值只有收盘后才更新，但盘中估值用户也想看
4. **没有按品类分组的视图** — 股票/债券/货币混在一起，看不出风险结构

## Goal

新增一个 SideNav 栏目"💰 基金管理"，让用户：

- **录入持仓**（基金代码 + 份额 + 成本净值 + 分类）
- **看总览数字**（今日预估盈亏 / 总市值 / 总盈亏 / 收益率）
- **看每只基金的明细**（当前估值 / 盈亏额 / 盈亏率）
- **按分类筛选**（股票型 / 债券型 / 货币型 / QDII / 其他）
- **5 分钟自动刷新一次**（仅交易时段）

## Design Decisions (Brainstormed)

| Decision | Choice | Rationale |
|---|---|---|
| 数据源 | **A: 用户录入 + 天天基金开放接口** | 可控 / 合规 / 天天基金接口实测稳定 (85ms 响应) |
| 数据录入 | **每只基金一行 entry, 用户手输** | 起步快; 不依赖券商账单格式 |
| 实时性 | **盘内 5 分钟拉一次, 非交易时段用最后拉到的数据** | 基金净值本身盘后才确认, 盘内只是"预估" |
| 多账户 / 多币种 / 分红再投 / 定投 | **MVP 不做, 进 backlog** | YAGNI; 单账户人民币 + 简单盈亏够用 |
| 分类 | **用户选, 5 选 1** | 天天基金分类标签杂, 用户选最稳 |
| 栏目接入方式 | **SideNav 加一项 + 独立 Layout (仿 WorldcupLayout)** | 跟现有架构对齐 |
| 删除策略 | **软删 (deletedIds), 7 天后清理** | 误删恢复; 跟现有 last-known 模式一致 |
| 节假日识别 | **MVP 不做, 按周末判定** | 节假日表维护成本高, 先按周末 |
| 失败兜底 | **last-known 缓存 + 红色标但保留旧数据** | 跟版本检查的 last-known 模式一致 |
| 净值是否落盘 | **不落, 内存缓存** | 盘后数据第二天就过期, 没意义落盘 |

## Data Model

### `state.json.funds.holdings[]` (持久化)

```ts
interface FundHolding {
  id: string                  // uuid v4, 内部用
  code: string                // 6 位基金代码, e.g. "000001"
  name: string                // e.g. "华夏成长混合" (录入时自动补全, 之后缓存)
  category: FundCategory      // 'stock' | 'bond' | 'money' | 'qdii' | 'other'
  shares: number              // 份额, e.g. 10000.50
  costNav: number             // 成本净值 (元/份), e.g. 1.234
  addedAt: number             // unix ms, 添加时间
  note?: string               // 备注, e.g. "定投扣款 - 招行"
}
```

### `state.json.funds.deletedIds[]` (软删, 7 天 GC)

```ts
type DeletedIds = string[]  // holding.id, 加时间戳可后续扩展
```

### 内存 transient 缓存 (不入 state.json)

```ts
interface FundNavCache {
  fetchedAt: number           // 本次拉取时间 (unix ms)
  data: Record<string, FundNav>  // code -> nav
  errors: Record<string, string>  // code -> 错误信息 (红色 UI 用)
}

interface FundNav {
  code: string
  name: string
  nav: number                 // 上一交易日单位净值 (确认值)
  estimatedNav: number | null // 今日盘中估值
  dayChange: number           // 今日涨跌额 (estimatedNav - nav)
  dayChangePct: number        // 今日涨跌幅 (%)
  navDate: string             // 净值日期 "2026-06-11"
  estimateTime: string | null // 估值时间 "2026-06-12 14:55"
  estimated: boolean          // true = 当日盘中估值; false = 上一交易日确认值
}
```

## Architecture

新增 1 个栏目，跟 `worldcup` 完全平行 (独立目录 + 独立 navStore key)：

```
src/
├── funds/                              ← 新增, 跟 worldcup 平级
│   ├── fundCalc.js                     ← 纯函数: profit / marketValue / total
│   ├── trading-hours.js                ← 纯函数: 交易时段判定 + 下次开盘时间
│   ├── fund-fetcher.js                 ← 拉天天基金 (JSONP 解包 + 字段映射)
│   ├── fund-scheduler.js               ← 5 分钟定时 + 交易时段判定
│   ├── fundStore.js                    ← renderer signals: holdings / navCache / schedulerState
│   ├── FundLayout.jsx                  ← 顶部 Header + CategoryTabs + 列表 + 空状态
│   ├── FundHeader.jsx                  ← 总览卡片 + 工具栏
│   ├── CategoryTabs.jsx                ← 子 tab: 全部 / 股票 / 债券 / 货币 / QDII / 其他
│   ├── FundList.jsx                    ← 按 category 分组的列表
│   ├── FundRow.jsx                     ← 单只基金行
│   └── AddFundModal.jsx                ← 添加 / 编辑持仓
└── main/
    └── fund-scheduler-bridge.js        ← 跟 worldcup 一样, 把 scheduler 状态推到 renderer

src/renderer/
└── (不动 SideNav / AppShell 主体, 只加分支)
```

### IPC Channels

```
funds:list              → FundHolding[]                         // 启动时拉一次
funds:add               → { holding: FundHolding } → FundHolding
funds:update            → { id: string, patch: Partial<FundHolding> } → FundHolding
funds:remove            → { id: string } → { ok: true }         // 软删
funds:nav:fetch         → 触发立即拉取 (返回 { results, errors })
funds:nav:state         → { lastFetch, nextFetch, status }      // 推送给 renderer 订阅
funds:nav:changed       ← 主进程推送 (renderer 用 webContents.send 订阅)
```

### Scheduler 状态机

```
[closed]      ── tick (交易时段) ──→  [running]
[running]     ── 完成 ──→            [idle]
[running]     ── 手动 fetch ──→      [running]   (重入)
[idle]        ── tick (交易时段) ──→  [running]
[closed]      ── 手动 fetch ──→      [running]   (绕过定时器)
```

`closed` = 当前不在交易时段
`idle` = 在交易时段, 但不在拉
`running` = 正在拉

### 刷新策略

```
[交易时段判定] (src/funds/trading-hours.js)
  09:30 - 11:30 周一-周五  → morning
  13:00 - 15:00 周一-周五  → afternoon
  其他                      → closed
[定时]
  isTrading → 每 5 分钟拉一次 (intervalMs = 5 * 60 * 1000)
  !isTrading → 等到下次开盘再拉 (msUntilNextOpen)
[手动触发]
  用户点 🔄 → 立即拉一次 (绕过定时器)
[失败兜底]
  单只基金失败 → errors[code] = msg, 其他基金继续
  整批失败 → last-known 缓存保留, UI 显示 "最近一次成功: 14:55"
```

## Layout

### 总览卡片 (顶部)

```
┌──────────┬──────────┬──────────┬──────────┐
│ 今日预估 │ 总市值   │ 总盈亏   │ 收益率   │
│+¥128.50  │ ¥32,450  │+¥4,520   │+16.18%   │
│↑ +0.40%  │ 6 只基金 │ 持有 1.2年│          │
└──────────┴──────────┴──────────┴──────────┘
```

- **今日预估** = `sum(shares × dayChange)`, 红/绿按正负
- **总市值** = `sum(shares × currentNav)`
- **总盈亏** = `总市值 - 总成本`
- **收益率** = `总盈亏 / 总成本 × 100%`
- "持有 1.2 年" = `Date.now() - min(addedAt)` 的人类可读

### Header 工具栏

```
💰 基金管理                              [+ 添加持仓] [🔄 刷新] [⚙️]
最后更新: 14:55 · 估值中 (spinner)         ●●●●○○ 4/6 只已更新
```

### Category 子 tab

```
[全部 6] [📈 股票 2] [📊 债券 1] [💵 货币 2] [🌏 QDII 1] [📦 其他 0]
```

- 默认选中"全部"
- 数字键 `1-6` 切换 (跟 worldcup 的 category 切换对齐)
- 分类切换只影响列表过滤, 不影响 Header 总览

### 列表行

```
┌─────────────────────────────────────────────────────────────────────┐
│ 000001  华夏成长混合                            📈 股票  ⋯           │
│ 持有 10,000.50 份 · 成本 1.2345                                    │
│                                                                      │
│ 净值 1.3456   市值 ¥13,456.32   盈亏 +¥2,111.32 (+18.65%)         │
│ 今日 +¥45.20 (+0.34%) ↑                                           │
└─────────────────────────────────────────────────────────────────────┘
```

- 点击行 → 展开持仓详情 (份额 / 成本 / 添加时间 / 备注)
- `⋯` 菜单 → 编辑 / 删除
- 红色 = 亏损, 绿色 = 盈利 (跟版本检查配色对齐)

### 空状态

```
┌──────────────────────────────────────────┐
│         💰                                │
│   还没添加持仓                            │
│   记录你的基金, 实时看盈亏                 │
│                                          │
│        [+ 添加第一只基金]                 │
└──────────────────────────────────────────┘
```

### 添加 Modal

```
┌─ 添加持仓 ──────────────────────────┐
│                                     │
│  基金代码                            │
│  [000001                  ]  🔍     │  ← 输完 6 位自动拉名称
│                                     │
│  基金名称                            │
│  [华夏成长混合            ] (自动)   │
│                                     │
│  分类                                │
│  [📈 股票 ▼]                       │  ← 5 选 1
│                                     │
│  份额                                │
│  [10000.50              ]           │
│                                     │
│  成本净值 (元/份)                    │
│  [1.2345                ]           │
│                                     │
│  备注 (可选)                        │
│  [定投扣款 - 招行        ]           │
│                                     │
│           [取消]        [保存]       │
└─────────────────────────────────────┘
```

### 净值拉取失败单行

```
000001  华夏成长混合                            📈 股票  ⚠️
净值拉取失败 (network error), 上次成功 14:55
```

### 删除确认

```
┌─ 删除 ─────────────────────────────┐
│ 确定删除 "华夏成长混合"?            │
│                                    │
│ 7 天内可恢复 (在 state.json 里)     │
│                                    │
│        [取消]      [删除]          │
└────────────────────────────────────┘
```

## State Management

### Renderer signals (src/funds/fundStore.js)

```ts
// 持仓 (持久化, 启动时从主进程拉)
holdings: FundHolding[]

// 净值缓存 (transient, 内存)
navCache: FundNavCache

// scheduler 状态 (推过来)
schedulerState: { status: 'closed' | 'idle' | 'running', lastFetch: number | null, nextFetch: number | null }

// 当前 category 过滤
activeCategory: FundCategory | 'all'

// 搜索关键字
searchQuery: string

// Modal 开关
addModalOpen: boolean
editingHolding: FundHolding | null
```

### Computed (派生)

```ts
totalMetrics         // = calcPortfolioTotal(rows)
filteredRows         // 按 activeCategory + searchQuery 过滤
groupedByCategory    // 按 category 分组 (给 category tab 计数)
```

## Keyboard Shortcuts

| 键 | 作用域 | 动作 |
|---|---|---|
| `Cmd+Shift+F` | 全局 | 跳到基金管理栏目 |
| `Cmd+F` | 栏目内 | 聚焦搜索框 |
| `1-6` | 栏目内 | 切 category tab |
| `+` | 栏目内 | 打开添加 Modal |
| `R` | 栏目内 | 立即刷新净值 |
| `Esc` | Modal 内 | 关闭 Modal |

## Out of Scope (v1 backlog)

- 多账户 (同一只基金不同券商账户)
- 多币种 / 海外基金实际汇率换算 (QDII 直接用人民币净值)
- 分红再投 / 现金分红 自动追踪
- 定投记录 + IRR 计算
- 历史净值曲线 + 图表 (接口已验证可用, 见 backlog)
- 节假日识别 (先按周末判定, 节假日表 backlog)
- 持仓导入 (CSV / Excel / 截图 OCR)
- 公开排行榜 / 跟其他用户比收益
- 估值推送通知 (净值异动 → 系统通知, 跟版本检查的 notification-policy 走)
- AI 分析 (基于持仓 + 净值做点评, 跟 AI Sessions 集成)

## Testing

| 模块 | 测试 | 覆盖 |
|---|---|---|
| `fundCalc.js` | `tests/main/fund-calc.test.js` | 19 cases (盈利/亏损/估值/缺失/异常/category分组) |
| `trading-hours.js` | `tests/main/fund-trading-hours.test.js` | 20 cases (上午/下午/边界/周末/节假日/msUntilNext) |
| `fund-fetcher.js` | `tests/main/fund-fetcher.test.js` | 18 cases (JSONP 解包/字段映射/mock httpClient/batch 并发) |

合计 57 unit tests PASS (2026-06-12 实测)。

## Rollout

1. v1.0: 录入 + 持仓列表 + 总览 + 5 分钟自动刷新 (本 spec)
2. v1.1: 历史净值曲线 (复用 `http://api.fund.eastmoney.com/f10/lsjz` 已验证接口)
3. v1.2: 节假日识别 (对接节假日 API 或维护已知节假日表)
4. v1.3: 定投记录 + IRR
5. v1.4: 分红追踪 (再投 vs 现金)

## Risks

1. **天天基金接口稳定性**: 实测 85ms 响应 + JSONP 格式稳定. **对策**: 失败重试 + last-known 兜底
2. **接口限流**: 11 只基金 × 5 分钟 = 132 次/小时. **对策**: 监控, 超限降频
3. **节假日误判**: 春节/国庆按周末处理 → 拉不到数据 → UI 显示 "节假日不开市". **对策**: v1.2 解决
4. **净值日期边界**: 跨午夜拉到的可能是昨天数据 → UI 用 "估值于 23:55" 标注, 不当今日预估