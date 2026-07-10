# 贵金属实时看板 + 个人持仓 (2026-06-17)

> ## ⚠️ 实施修订 (2026-06-17, commit 6989054)
>
> 本 spec 原设计**国际金/银/汇率走 Yahoo Finance v8 chart API**(`GC=F`/`SI=F`/`CNY=X`),
> 但实施时实测发现 **Yahoo v8 chart 接口已挂**(返回 sad-panda HTML 而非 JSON),
> 导致国际品种卡片一直"加载中"。已做如下数据源替换(正文保留原设计作历史记录):
>
> | 品种 | 原设计 | 实施替换 | 说明 |
> |------|--------|----------|------|
> | XAU 国际黄金 | Yahoo `GC=F` + priceScale 1/100 | **新浪 `hf_GC`** | hf_* 已是现货 USD/oz,**无需 priceScale 换算** |
> | XAG 国际白银 | Yahoo `SI=F` + priceScale 1/50 | **新浪 `hf_SI`** | 同上,无需换算 |
> | CNY_PER_USD 汇率 | Yahoo `CNY=X` | **新浪 `USDCNY`** | 取字段 `[5]` 中间价 |
> | AU9999 国内金 | 新浪 `AU0` | (未改) | ⚠️ AU0/AG0 返回 **2024-07-17 陈旧数据**,新浪该接口疑似停更,另开 issue 处理 |
> | AG9999 国内银 | 新浪 `AG0` | (未改) | 同上 |
>
> **代码层影响**:
> - `metal-yahoo-fetcher.js` 已删除(191 行死路径)
> - 新增 `metal-sina-hf-fetcher.js`(解析 hf_GC/hf_SI/USDCNY 三种行格式)
> - `metal-config.js`: kind `yahoo-chart` → `sina-hf`,symbol 改 `hf_GC`/`hf_SI`/`USDCNY`,删 priceScale
> - `metal-fetcher.js` dispatcher: yahoo 分支 → sina-hf 分支
> - `metal-calc.js` / `metal-scheduler.js` / `metal-ipc.js` / renderer 全部不动(fetcher 层抽象的收益兑现了)
> - 0 新依赖(hf_* 只解析 ASCII 数字字段,中文名来自 config,不需要 iconv-lite)
>
> **field layout 实测确认 (2026-06-17)**:
> ```
> hf_GC / hf_SI (15 字段):
>   [0]current [2]bid [3]ask [4]high [5]low [6]time(HH:MM:SS) [7]prevClose [12]date(YYYY-MM-DD)
> USDCNY (11 字段):
>   [0]time [1]bid [3]ask [5]mid(←用作 rate) [10]date
> ```

## Problem

Pulse 当前覆盖了版本检查、AI 用量、基金盈亏、世界杯比分,但用户最常关心的另一类"实时数据"——**贵金属价格(黄金/白银)**——没有入口。痛点:

1. **没有跨品种金价速览** —— 打开浏览器→看国际金价→再切到银行 App 看 AU9999,流程太碎
2. **没有个人持仓盈亏的统一视图** —— 银行积存金、纸黄金、实物金、ETF(518880/159937)分散在不同账户,缺少"今天赚/亏多少"的统一口径
3. **国际价 vs 国内价断层** —— 银行实际成交价(AU9999)与国际金价(XAU/USD)有溢价/税/手续费,简单汇率换算会误导
4. **24/7 交易品种没有合适的定时器范式** —— 跟基金(A 股交易时段)不同,金价在周末/节假日也波动

## Goal

新增一个 SideNav 栏目 **"🥇 贵金属"** (v1+v2 一期),让用户:

- **实时看 4 个品种的当前价和涨跌** —— XAU(国际现货黄金)、XAG(国际现货白银)、AU9999(国内黄金)、AG9999(国内白银)
- **总览 CNY 折算后的总市值/总盈亏/今日预估盈亏** —— 跨币种汇总,人民币口径
- **录入个人持仓(可选)** —— 录入时按当时汇率快照冻结人民币成本,不再随汇率漂移
- **5 分钟自动刷新** —— 24/7 跑,无交易时段判定
- **失败兜底** —— 沿用 funds 的 last-known 模式,主源失败不阻塞卡片显示

## Non-Goals (明确不做)

- ❌ 历史 K 线 / sparkline 迷你图(进 v3 backlog)
- ❌ 价格阈值提醒(进 v4 backlog)
- ❌ 多账户 / 同一品种多笔持仓
- ❌ 美元/人民币双向持仓(只能选一种 `costCurrency`)
- ❌ 买入手续费 / 印花税 / 仓储费自动计算
- ❌ 节假日识别(24/7 跑,无此概念)
- ❌ 价格持久化(state.json 不缓存价格,缓存就过期了)

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| 模块定位 | **独立 `metals/` 目录**(跟 `funds/`、`worldcup/` 平级) | 数据源、刷新逻辑(24/7 vs 交易时段)、UI 都不一样,合并反而难维护 |
| 数据源策略 | **fetcher 层抽象成"品种 + 数据源 enum"**,每个品种登记 1 个主源 (留 fallback 扩展点) | 不锁死单一接口;Yahoo 挂/新浪挂时可以热替换,symbol 换改 metal-config.js 一处即可(后续可加 `fallback` 字段,不破坏现有数据契约) |
| 国际金/银数据源 | **Yahoo Finance v8 `chart` API** (`GC=F`、`SI=F`,需做期货合约→oz 换算) | 跟 Pulse 现有零配置风格一致;Yahoo v7/quote 已 401,v8/chart 实测 200;字段含 previousClose + regularMarketTime,无需另算涨跌 |
| 国内金/银数据源 | **新浪 `hq.sinajs.cn/list=AU0,AG0` JSONP**(GBK 编码,需 iconv-lite 解码) | 跟 funds 的 JSONP 解包模式完全一致;返回字段含日期,失败可降级到 last-known |
| 汇率数据源 | **复用 Yahoo `CNY=X`**,跟价格同一轮拉取 | 0 新依赖,跟 Yahoo 主源同生命周期,失败隔离 |
| 币种策略 | **本币 + CNY 双显**;持仓 `costPriceCNY` 在录入时按汇率快照冻结 | 历史成本不该用实时汇率折算(去年买的金不该因今年汇率变而重估);只有"今日盈亏"和"跨币种总市值"走实时汇率 |
| 刷新频率 | **5 分钟**,24/7 跑 | 跟 funds 对齐,架构 1:1 复用 scheduler 模式 |
| 调度器位置 | **main 进程,setInterval**,**不进 worker_threads** | 2 个 HTTP 请求不需并发池化;避开 electron-merge-debug 描述的"worker require electron"陷阱(参考 commit `33e6152`) |
| 失败隔离 | **fetcher 级别隔离**(Yahoo 全挂不影响 Sina) | 4 个数据点分布在 2 个 fetcher,互不阻塞 |
| 失败重试 | 单次失败不重试(避免节奏被拖长),靠下一次 tick | 跟 funds 一致 |
| 失败提示 | 连续失败 3 次 → toast "贵金属行情接口异常" | 跟 funds-worldcup 错误体验一致 |
| 删持仓策略 | **软删(`deletedIds`),7 天后清理** | 误删恢复;跟现有 last-known 模式对齐 |
| 持仓为空时 | 只显示价格卡片,盈亏区显示"未录入持仓" | 看板价值独立存在,不强制绑定持仓 |
| SideNav 接入 | **新增一项"🥇 贵金属"**,位置在"基金"和"版本检查"之间 | 逻辑顺序:实时市场 → 个人资产 → 系统状态 |
| 新依赖 | **+1 个 `iconv-lite`**(~200KB,纯 JS) | 解 GBK 编码;无原生代码,跨平台无风险 |

## Data Model

### `state.json.metals`(持久化)

```ts
interface MetalConfig {
  // 用户选择的关注品种(默认 4 个全开,用户可关)
  watchedIds: MetalId[]                 // e.g. ['XAU', 'XAG', 'AU9999', 'AG9999']

  // 每个品种可独立的持仓(可选,留空 = 不算盈亏)
  holdings: Record<MetalId, MetalHolding | null>

  // 软删(误删恢复,7 天 GC)
  deletedIds: string[]
}

type MetalId = 'XAU' | 'XAG' | 'AU9999' | 'AG9999'

interface MetalHolding {
  id: string                            // uuid v4, 内部用
  quantity: number                      // 数量 (克数 或 oz)
  costPrice: number                     // 成本价 (本币, 不是人民币)
  costCurrency: 'CNY' | 'USD'           // 决定 costPrice 是什么币
  costPriceCNY: number                  // 录入时按当时汇率快照折算成人民币 (历史成本冻结)
  addedAt: number                       // unix ms
  note?: string
}
```

### 内存 transient 缓存(不入 state.json)

```ts
interface MetalQuoteCache {
  fetchedAt: number                     // 本次拉取时间 (unix ms)
  data: Record<MetalId, MetalQuote>      // id -> quote
  errors: Record<MetalId, string>       // id -> 错误信息 (红色 UI 用)
}

interface MetalQuote {
  id: MetalId
  price: number                         // 当前价 (本币)
  prevClose: number                     // 昨日收盘价 (本币)
  change: number                        // 涨跌额 = price - prevClose
  changePct: number                     // 涨跌幅 %
  currency: 'CNY' | 'USD'
  unit: 'oz' | 'g'
  quoteTime: number                     // unix ms
  source: 'yahoo' | 'sina'
  // v3+ 字段(暂存,不消费):week52High, week52Low (Yahoo 已给)
}

interface FxRateCache {
  fetchedAt: number
  cnyPerUsd: number                     // 1 USD = X CNY (来自 Yahoo CNY=X)
}
```

**为什么 `prevClose` 存进数据模型而不是 UI 层算**:Yahoo 给的是 `chartPreviousClose`,新浪给的是"昨日收盘"。没这个字段算不出涨跌幅 —— 是数据契约,不是 UI 衍生量。

## Architecture

```
src/
├── metals/                              ← 新增, 跟 funds 平级
│   ├── metal-config.js                  ← 静态品种元信息 + 主源/fallback 注册
│   ├── metal-yahoo-fetcher.js           ← Yahoo v8 chart (国际金/银 + 汇率)
│   ├── metal-sina-fetcher.js            ← 新浪 JSONP (国内金/银, GBK)
│   ├── metal-fetcher.js                 ← 统一入口: 按品种分发, 并发拉取, 合并返回
│   ├── metal-calc.js                    ← 纯函数: 涨跌幅 / 持仓盈亏 / 跨币种总市值
│   └── metal-scheduler.js               ← 5 分钟 setInterval (24/7, main 进程直接跑)
└── renderer/
    └── metals/
        ├── MetalLayout.jsx              ← Header + 总览卡片 + 网格 + 空状态
        ├── MetalHeader.jsx              ← 总览 (CNY 总市值/总盈亏/今日预估) + 工具栏
        ├── MetalCard.jsx                ← 单个品种卡片 (价格/涨跌/持仓/盈亏)
        ├── MetalGrid.jsx                ← 2 列卡片网格
        ├── AddMetalModal.jsx            ← 添加关注 / 编辑持仓
        └── metalStore.js                ← renderer signals: quotes / fx / holdings / schedulerState
```

**关键架构决策**:
- **不进 worker_threads** —— fetcher 不需要 `electron`(`https` + `iconv-lite` 都是纯 JS 模块),在 main 进程直接跑最简单。规避 electron-merge-debug 描述的"worker require electron"陷阱
- **`metal-config.js` 静态表枚举 4 个品种**,以后加品种(Pt/Pd/铜)只改这一个文件 —— 跟 funds 的 `fund-category.js` 同套路
- **scheduler 不需要 `trading-hours.js`** —— 金价 24/7 跑,反而比 funds 还简单一档
- **fetcher 抽象成 `kind: 'yahoo-chart' | 'sina-jsonp'` enum**,新增数据源只写 fetcher + 在 config 里登记,不改 dispatcher
- **预留 fallback 扩展点** — `metal-config.js` 的每个品种只声明 `primary`,后续可加 `fallback` 字段实现主备切换,无需改 dispatcher

### IPC Channels

```
metals:list               → MetalConfig                          // 启动拉一次
metals:config:update      → { patch: Partial<MetalConfig> }      // 更新关注列表
metals:holding:upsert     → { id: MetalId, holding: MetalHolding | null }
metals:holding:remove     → { id: MetalId }                      // 软删
metals:quote:fetch        → 触发立即拉取                          // 返回 { results, fxRate, errors }
metals:quote:state        → { lastFetch, nextFetch, status }     // 推给 renderer
metals:quote:changed      ← 主进程推送                            // renderer 用 webContents.send 订阅
```

### 调度器状态机(简化版,因为 24/7)

funds 的状态机有 `closed`(非交易时段)。metals 去掉 `closed`,只剩:

```
[idle]      ── tick (5 min) ──→    [running]
[running]   ── 完成 ──→            [idle]
[running]   ── 手动 fetch ──→      [running]   (重入, 跟 funds 同)
[idle]      ── 手动 fetch ──→      [running]   (绕过定时器, 跟 funds 同)
```

- `idle` = 距上次拉取 ≥ 5 分钟,等待下一 tick
- `running` = 正在拉
- 启动时立即触发首次 fetch(不等 5 分钟),进入 `running` → 完成 → `idle`
- 网络断 30 分钟恢复后,scheduler 在下一个 tick(最多 5 分钟)触发补拉,不会"疯狂补拉"

### Fetcher 并发模型

```
metal-fetcher.js (统一入口)
├── Yahoo fetcher (单次 HTTP, 1 个请求串 3 个 symbols: GC=F,SI=F,CNY=X)
│     → 3 个数据点: XAU, XAG, FxRate
└── Sina fetcher (单次 HTTP, JSONP, list=AU0,AG0)
      → 2 个数据点: AU9999, AG9999
```

**两个 fetcher 并发** (`Promise.all`),5 分钟一次,合并返回。失败隔离:Yahoo 全挂不影响 Sina,反之亦然。

### 数据源注册表(`metal-config.js` 草图)

```js
METALS = [
  {
    id: 'XAU',
    name: '现货黄金',
    unit: 'oz',
    currency: 'USD',
    primary: { kind: 'yahoo-chart', symbol: 'GC=F', priceScale: 1 / 100 },
  },
  {
    id: 'XAG',
    name: '现货白银',
    unit: 'oz',
    currency: 'USD',
    primary: { kind: 'yahoo-chart', symbol: 'SI=F', priceScale: 1 / 50 },
  },
  {
    id: 'AU9999',
    name: '国内黄金 AU9999',
    unit: 'g',
    currency: 'CNY',
    primary: { kind: 'sina-jsonp', symbol: 'AU0' },
  },
  {
    id: 'AG9999',
    name: '国内白银 AG9999',
    unit: 'g',
    currency: 'CNY',
    primary: { kind: 'sina-jsonp', symbol: 'AG0' },
  },
]

FX_RATES = [
  { id: 'CNY_PER_USD', primary: { kind: 'yahoo-chart', symbol: 'CNY=X' } },
]
```

**实现阶段第一件事**(进入 `writing-plans` 之后):
1. 验证 Yahoo `GC=F` 期货合约价 → 现货 oz 的换算系数(实测确认 `scale`)
2. 验证 Sina `AU0` 字段顺序(实测需要 iconv 解码后对照新浪文档)
3. 若主源挂 → 改 `metal-config.js` 一行即可,无需改 fetcher/dispatcher/scheduler/UI

## Layout

### 总览卡片 (顶部)

```
┌─ 🥇 贵金属 ──────────────────────────────────────────────────┐
│ 最后更新: 14:55  · 估值中 (spinner)        [🔄 刷新] [⚙️]    │
├──────────────────────────────────────────────────────────────┤
│ 总市值 (CNY)         总盈亏 (CNY)         今日预估 (CNY)     │
│ ¥15,420.50           +¥1,820.50 (+13.4%)  +¥82.30 (+0.5%)   │
│ 4 个品种 · 汇率 6.7557│ 持有 1.2年         ↑ 较昨收           │
└──────────────────────────────────────────────────────────────┘
```

- **总市值 CNY** = `Σ (各品种本币市值 × 汇率到 CNY)`,汇率缺失时显示"汇率待刷新"
- **总盈亏 CNY** = `总市值 - Σ (costPriceCNY × quantity)`
- **今日预估 CNY** = `Σ (今日涨跌本币 × quantity × 汇率到 CNY)`
- "持有 1.2 年" = `Date.now() - min(addedAt)` 人类可读

### 卡片网格 (2 列,桌面优先)

```
┌─ XAU 现货黄金 ─────────┐  ┌─ XAG 现货白银 ─────────┐
│ $2,348.50 / oz         │  │ $30.45 / oz            │
│ ≈ ¥575.6 / g           │  │ ≈ ¥7.46 / g            │
│ ↑ +0.42%               │  │ ↓ -0.18%               │
│ ─────────────────────  │  │ ─────────────────────  │
│ 持仓 0.5 oz            │  │ 持仓 50 g              │
│ 成本 $2,300            │  │ 成本 ¥7.20 / g         │
│ 累计 +¥867 (+1.69%)    │  │ 累计 +¥13 (+3.6%)      │
│ 今日 +¥174 (+0.42%)    │  │ 今日 -¥6 (-0.18%)      │
└────────────────────────┘  └────────────────────────┘
┌─ AU9999 国内黄金 ──────┐  ┌─ AG9999 国内白银 ──────┐
│ ¥558.30 / g            │  │ ¥7.12 / g              │
│ ↑ +0.21%               │  │ ↓ -0.05%               │
│ ─────────────────────  │  │ ─────────────────────  │
│ 持仓 5 g               │  │ 未录入持仓              │
│ 成本 ¥540 / g          │  │ [+ 录入]                │
│ 累计 +¥91 (+3.4%)      │  │                        │
│ 今日 +¥1 (+0.21%)      │  │                        │
└────────────────────────┘  └────────────────────────┘
```

- **关键不变量**:累计盈亏的折算用 `costPriceCNY`(录入时冻结),不依赖实时汇率;只有"今日盈亏"和"折算参考价"用实时汇率
- 持仓缺失时,卡片价格区正常显示,盈亏区显示"+ 录入"按钮
- 卡片背景色按涨跌:绿涨红跌(跟 funds/worldcup 配色一致)
- 卡片右上角 `⋯` 菜单:编辑持仓 / 取消关注

### 空状态

```
┌──────────────────────────────────────────┐
│              🥇                           │
│     还没关注任何品种                       │
│     实时盯黄金白银价格                      │
│                                          │
│      [+ 添加第一个品种]                    │
└──────────────────────────────────────────┘
```

### 添加/编辑 Modal

```
┌─ 编辑持仓 ──────────────────────────┐
│                                      │
│  品种                                │
│  [XAU 现货黄金 ▼]    (4 选 1)       │  ← 已关注的 4 个品种均可录入持仓
│                                      │
│  数量                                │
│  [0.5                  ] oz          │  ← 单位随品种变 (oz 或 g)
│                                      │
│  成本价                              │
│  [$2,300.00           ] /oz          │
│  [≈ ¥16,590.00        ]             │  ← 按当前汇率快照显示, 提交后冻结到 costPriceCNY
│                                      │
│  备注 (可选)                          │
│  [招行积存金 2024-03     ]            │
│                                      │
│  ──                                  │
│   勾选"清除持仓"可删除本品种持仓       │
│   (保留关注,仅清空持仓数据)            │
│                                      │
│         [取消]      [保存]            │
└──────────────────────────────────────┘
```

### 失败卡片样式

```
┌─ XAU 现货黄金 ─────────┐
│ ⚠️ 数据获取失败         │
│ 上次成功: 14:55         │
│ [点击重试]              │
└────────────────────────┘
```

## State Management

### Renderer signals (`src/renderer/metals/metalStore.js`)

```ts
// 关注列表 + 持仓 (持久化, 启动时从主进程拉)
config: MetalConfig

// 报价缓存 (transient, 内存)
quoteCache: MetalQuoteCache

// 汇率缓存 (transient, 内存)
fxCache: FxRateCache

// scheduler 状态 (主进程推过来)
schedulerState: { status: 'idle' | 'running', lastFetch: number | null, nextFetch: number | null }

// Modal 开关
addModalOpen: boolean
editingMetalId: MetalId | null
```

### Computed (派生,在 renderer 算,不持久)

```ts
overview           // = calcOverview(config, quoteCache, fxCache) → 总市值/总盈亏/今日预估 (CNY)
cardData           // = per-metals: price / change / holding pnl / today pnl / ref CNY price
```

## Error Handling

| 故障 | 表现 | 兜底 |
|---|---|---|
| Yahoo 完全失败 | XAU/XAG/CNY=X 三处灰 | 红色标"上次成功 14:55",保留旧值 |
| Sina 完全失败 | AU9999/AG9999 两处灰 | 同上 |
| 单只品种字段缺失(罕见) | 该卡片显示"数据异常" | 不影响其他品种 |
| iconv-lite 解码失败 | 国内卡片灰 | 日志 + 卡片显示"新浪接口异常" |
| 汇率缺失但价格有 | 总市值 CNY 灰 | "汇率待刷新",各品种本币数字仍正常 |
| 连续失败 3 次 | 全屏 toast | "贵金属行情接口异常,请检查网络",不阻塞 UI |
| 重连成功 | toast 自动消失 | 跟 funds 行为一致 |

**重试策略**: 单次失败不重试(避免 5 分钟节奏被拖长),靠下一次 tick 自动恢复。

## Keyboard Shortcuts

| 键 | 作用域 | 动作 |
|---|---|---|
| `Cmd+Shift+M` | 全局 | 跳到贵金属栏目 |
| `Cmd+M` | 栏目内 | 聚焦"添加关注"搜索 |
| `R` | 栏目内 | 立即刷新 |
| `Esc` | Modal 内 | 关闭 Modal |

## Testing (vitest)

| 模块 | 用例 | 覆盖 |
|---|---|---|
| `metal-calc.js` | 15 cases | 涨跌幅 / 折算 / 持仓盈亏 / 跨币种总市值 / 汇率缺失 / 持仓缺失 / 单位换算 |
| `metal-config.js` | 5 cases | 4 个品种元信息齐全 / id 唯一 / kind enum 合法 |
| `metal-yahoo-fetcher.js` | 10 cases | 单次响应解析 / 字段映射 (regularMarketPrice, previousClose, regularMarketTime) / 缺字段 / mock HTTP 失败 |
| `metal-sina-fetcher.js` | 10 cases | JSONP 解包 / GBK 解码 / 字段映射 (顺序对照新浪文档) / mock 失败 |
| `metal-fetcher.js` | 5 cases | yahoo + sina 并发 / 隔离失败 / 汇率合并 / 字段归一 |

合计 **45 unit tests PASS**(目标)。

**特别提醒**(实现阶段):
- Yahoo v8 chart 实测响应示例:
  ```json
  {"chart":{"result":[{"meta":{
    "symbol":"GC=F","currency":"USD",
    "regularMarketPrice":4362.8,"previousClose":4351.6,
    "regularMarketTime":1781633600
  }}]}}
  ```
  注意 `regularMarketPrice` 是**期货合约价**(每合约 100 oz),需要 `priceScale: 1/100` 换算
- Sina JSONP 实测响应(`iconv -f GBK -t UTF-8` 后):
  ```
  var hq_str_AU0="黄金现货,145957,574.86,585.84,...,2024-07-17,...";
  ```
  字段顺序需对照新浪 hq.sinajs.cn 文档逐字段确认

## Rollout

1. **v2.20.0 (本 spec)**: 看板 + 关注列表 + 持仓 + 盈亏 + 总览 CNY
2. v2.21.0 (v3): 历史价格 sparkline 迷你图(复用 Yahoo chart 的 range=5d 数据)
3. v2.22.0 (v4): 价格阈值提醒 + 系统通知(走 notification-policy)

## Risks & Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| Yahoo v8 chart 接口签名变化 | XAU/XAG/FX 全挂 | 字段映射有详细测试,失败第一时间发现;Sina 路径独立可用 |
| Yahoo `GC=F` / `SI=F` 单位(期货合约 vs 现货) | 价格差 100 倍 | `metal-config.js` 里 `priceScale` 字段显式声明;测试用例覆盖 |
| Sina JSONP 接口变更/限流 | AU9999/AG9999 全挂 | 同上,4 个数据点不互相阻塞;Yahoo 反向验证作 fallback |
| Sina 数据陈旧(2024-07 快照) | 国内卡片长期不变 | 失败判定阈值 = quoteTime 距今 > 24h;超阈值显示"数据过期,可能接口停更" |
| iconv-lite 体积 | 安装包 +200KB | 纯 JS,跨平台无原生模块风险;可接受 |
| 用户填错品种单位 | 盈亏数字离谱 | Modal 标注单位 (oz/g),成本价自动按品种本币显示 |
| 汇率频繁波动 | 总市值 CNY 抖动 | 5 分钟内波动极小;展示"按 HH:MM 汇率"标注 |
| 历史成本冻结但今日盈亏用实时汇率 | 两个数字背后口径不同 | UI 用"累计 vs 今日"双行分开展示,避免混淆 |

## Open Questions

无。本 spec 范围内决策已闭环。下列议题进 v3+ backlog:

- 历史 K 线 sparkline(数据源复用 Yahoo chart range=5d)
- 价格阈值提醒(走 notification-policy)
- 多账户 / 同一品种多笔持仓
- 节假日(本 spec 不涉及,24/7 跑)
