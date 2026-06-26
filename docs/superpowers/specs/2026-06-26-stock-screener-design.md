# 股票筛选器（选股分析）设计 — 阶段一

| 日期       | 作者         | 状态     |
| ---------- | ------------ | -------- |
| 2026-06-26 | brainstorming | 设计已批准,待 writing-plans |

> 本 spec 立项一个 **v2 路线图未覆盖的新方向:股票选股分析**。
> 最近的现有候选是 I2 Watchlist(已 deferred 基金/贵金属/关键词到 v2)与 P61 配置导入导出里的 `fundPositions`,均不含股票。本 spec 把它作为独立功能立项。
>
> **三阶段规划(仅本 spec 写阶段一)**:
> - **阶段一(本 spec)= 条件选股筛选器**:设条件 → 全市场筛选 → 排名展示 + 存自选
> - **阶段二 = AI 分析**(后续独立 spec):筛选结果上叠加 LLM 诊股,复用 `shared-llm` + P71 预算硬限
> - **阶段三 = 策略 skill**(后续独立 spec):用户自定义策略保存/复用 + 策略市场
>
> 阶段一严格不碰阶段二/三,AI 与策略保存均为后续。

## 1. 背景与目的

Pulse 已有成熟的金融基建:基金持仓(`src/renderer/funds/` + `src/main/ipc/register-funds.js`)、贵金属(`src/renderer/metals/`),数据层走主进程 `HttpClient` 直接打东财/腾讯接口,**纯 JS、不依赖 Python**。

但**没有股票相关功能**。用户希望加"选股分析":通过条件筛选全市场 A 股,找出符合策略的票,并能收藏到自选列表。

阶段一解决:
1. **条件筛选**:估值(PE/PB/ROE/股息率)、行情动量(涨跌/换手)、行业板块、市值区间四类条件组合
2. **内置策略**:4 个预设策略 chip,一键填条件(把策略 skill 的部分价值提前)
3. **自选股**:筛选结果可存入独立自选股列表,后台定时刷新行情

## 2. 架构方案对比(已选 A)

| 方案 | 描述 | 结论 |
| --- | --- | --- |
| **A. 东财单接口 + 前端即时计算** | 用东财 clist 排行接口单请求返回全市场全字段,前端 filter+sort。基建全复用(HttpClient/scheduler/state-store/safeHandle) | **✅ 采用** |
| B. 东财 + 腾讯多源混合 | 行情走腾讯、财务走东财,双源兜底 | ❌ v1 多套适配器,违背"先收口" |
| C. AKShare/Tushare Python | 数据最全,但需打包 Python 运行时,与 Electron 纯 JS 架构冲突 | ❌ 否决 |

选 A 的理由:① 跟现有基金模块(`fund-fetcher.js`/`register-funds.js`/scheduler)同模式,代码可直接对照写;② 单接口失败风险用"fetcher 抽象层 + 缓存 + 友好降级"兜住;③ YAGNI,v1 先跑通,多源留 v2。

## 3. 数据模型

### 3.1 筛选条件 + 偏好(state.json 新字段 `stockScreener`)

```jsonc
"stockScreener": {
  "lastCriteria": {           // 上次的筛选条件, 进 tab 自动恢复(不自动执行筛选)
    "peMin": 0, "peMax": 20,
    "pbMin": null, "pbMax": null,
    "roeMin": 15,
    "dividendYieldMin": null, // 股息率 %
    "turnoverMin": null, "turnoverMax": null,  // 换手率 %
    "change5dMin": null,      // 近5日涨幅 % (动量)
    "marketCapTier": "large", // all | large | mid | small
    "industries": ["银行","食品饮料"]
  },
  "activeStrategy": "value_roe",  // 当前预设策略 id, "custom" = 自定义
  "lastSort": { "key": "roe", "dir": "desc" }
}
```

- `null` 字段 = 不限,filter 时跳过
- `marketCapTier`:`large`(>500亿) / `mid`(100-500亿) / `small`(<100亿) / `all`,避免用户手填数字
- `industries`:东财行业分类名数组,空 = 全行业

### 3.2 内置策略(4 个,硬编码于 `src/stocks/strategies.js`)

| id | 名称 | 自动填的条件 |
| --- | --- | --- |
| `value_roe` | 低估值高ROE | PE 0~20, ROE≥15%, 大盘 |
| `blue_chip` | 蓝筹白马 | 大盘, ROE≥15%, PE 0~30 |
| `high_div` | 高股息 | 股息率≥4%, 大盘 |
| `momentum` | 成长动量 | 近5日涨幅≥3%, ROE≥10% |

结构 `{ id, label, buildCriteria() }`,点 chip 调 `buildCriteria()` 填充条件区。**选预设后条件区仍可微调**(微调即把 `activeStrategy` 切成 `custom`)。策略本身不持久化,持久化的是"上次选了哪个 + 上次的条件"。

### 3.3 自选股(state.json 新字段 `stockWatchlist`,独立,平行基金持仓)

```jsonc
"stockWatchlist": [
  {
    "code": "600519",        // 6位代码, exact match 去重
    "name": "贵州茅台",
    "industry": "食品饮料",
    "addedAt": 1782446000000
  }
]
```

- 不存行情/估值快照(每次刷新现拉,避免脏数据)
- `code` exact match 去重,加重复 → 忽略
- 退市/停牌 → 不删 pin,标灰 + "停牌/退市"标记(用户手动删)

### 3.4 持久化与迁移

- `stockWatchlist` 缺失 → `loadStockWatchlist()` 返 `[]`
- `stockScreener` 缺失 → `loadStockScreener()` 返 `{ lastCriteria: null, activeStrategy: 'value_roe', lastSort: {key:'roe',dir:'desc'} }`
- `PRESERVE_FIELDS`(state-store.js 已有套路)追加 `stockWatchlist` + `stockScreener`
- P61 配置导入导出已规划包含 `fundPositions`,本 spec 标注把 `stockWatchlist` + `stockScreener` 也纳入 P61 导出字段(实现交 P61)

## 4. IPC 通道(6 个,全走 `safeHandle`)

新增 `src/main/ipc/register-stocks.js`,对照 `register-funds.js`:

| channel | 入参 | 出参 | 用途 |
| --- | --- | --- | --- |
| `stocks:screen` | `{ criteria, sort }` | `{ ok, results: [StockRow], fetchedAt, total }` | 执行筛选:主进程拉全市场 → filter → sort → 返回 |
| `stocks:search` | `query` | `{ ok, results: [{code,name,industry}] }` | 模糊搜个股(加自选用) |
| `stocks:watchlist:list` | — | `{ ok, items: [StockWatchItem] }` | 拉自选股 |
| `stocks:watchlist:add` | `{ code }` | `{ ok, items }` | 加自选(内部反查 name/industry) |
| `stocks:watchlist:remove` | `{ code }` | `{ ok, items }` | 删自选 |
| `stocks:watchlist:quotes` | — | `{ ok, quotes: {code: {price,changePct,...}}, fetchedAt }` | 刷新自选股实时行情 |

设计要点:
- `stocks:screen` **不接分页参数**——东财接口单次返回全市场(约 5000 只),主进程 filter+sort 后前端做虚拟滚动/上拉加载
- `stocks:watchlist:add` 内部调 `stocks:search` 反查 name/industry(用户只输代码,名字自动填,对照基金 `applyFundMeta`)
- 走 `ctx.safeHandle` + `threwResponse` 兜底
- 不新增 scheduler IPC——筛选手动触发,自选股行情刷新复用 scheduler 同款机制(见 §5.3)

### preload 暴露

`window.api` 加:`stocksScreen / stocksSearch / stocksWatchlistList / stocksWatchlistAdd / stocksWatchlistRemove / stocksWatchlistQuotes`(命名跟 `fundsSearch` 等对齐)。

## 5. 数据源抓取层

### 5.1 文件结构(对照 `src/funds/`)

```
src/stocks/
  stock-fetcher.js      # 拉数据核心 (HttpClient 调东财接口)
  stock-constants.js    # 市场代码、字段映射、市值分档阈值
  stock-filter.js       # 纯函数: filter + sort (可单测, 无 IO)
  strategies.js         # 4 个内置策略 buildCriteria
  industry-map.js       # 东财行业分类映射 (启动时拉一次缓存)
src/main/stock-store.js          # state.json 读写, 对照 fund-store.js
src/main/ipc/register-stocks.js  # 6 个 IPC handler
```

### 5.2 数据源:东财实时排行接口

核心用东财选股器排行接口 `push2.eastmoney.com/api/qt/clist/get`(东财网页版选股器背后接口),**一个请求返回全市场全字段**:

```
GET https://push2.eastmoney.com/api/qt/clist/get
  ?pn=1&pz=5000          # 单页拉全市场
  &po=1&np=1
  &fltt=2                # 数字格式
  &fields=f12,f14,f2,f3,f15,f16,f6,f7,f8,f9,f23,f26,f21,f100
  &fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23  # 沪深全部
```

| 东财字段 | 含义 | 映射 |
| --- | --- | --- |
| f12 | 代码 | code |
| f14 | 名称 | name |
| f2 | 最新价 | price |
| f3 | 涨跌幅% | changePct |
| f8 | 换手率% | turnover |
| f9 | PE(动态) | pe |
| f23 | PB | pb |
| f21 | ROE(摊薄) | roe |
| f100 | 所属行业 | industry |

> **已知字段缺口(关键)**:`change5dMin`(近5日涨幅)、`dividendYieldMin`(股息率)在 clist 单接口里**无稳定直接字段**。处理方式:
> - 走东财 `datacenter.eastmoney.com/api/data/v1/get`(财报/分红接口)做**二次请求**按代码批量补 ROE(摊薄)/股息率/近 N 日涨幅
> - 二次请求失败或字段缺失 → 该字段标 `null`,`stock-filter.js` 对 null 字段"跳过该条件"而非"判为不满足"
> - 影响 §3.2 `momentum`(依赖 change5d)与 `high_div`(依赖股息率)两个策略:若二次请求全挂,这两个策略退化为"仅按其余非 null 条件筛",结果可能偏宽——前端在 fetchedAt 旁标注"动量/股息数据缺失,结果仅供参考"
>
> v1 先用 clist 单接口跑通估值(PE/PB)+ ROE + 行情(价/涨跌/换手)+ 市值 + 行业五类(这五类 clist 全覆盖),ROE/股息/动量的二次补全作为 fetcher 内部的增强步骤,失败不阻塞。

### 5.3 抓取时机(手动筛选 + 后台定时刷新)

- **手动筛选**:点 🔍 → `stocks:screen` → 主进程 fetcher 实时拉一次 → filter → 返回。结果带 `fetchedAt`,前端显示"更新于 14:32"。
- **自选股行情后台刷新**:新建独立轻量 `stockQuoteScheduler`(**不复用基金 fundScheduler 实例,避免两套数据耦合**),逻辑同构:
  - 盘中(9:30-15:00 工作日)每 N 分钟拉一次自选股行情,推送 `stocks:watchlist:quotes`
  - `config.json` 加 `stocks: { quoteRefreshMinutes: 5 }`(默认 5 分钟,避免限流)
  - 非盘中休眠(复用 `inQuietHours` 思路判断交易日历)
- **筛选结果缓存**:`stocks:screen` 结果主进程内存缓存(key=criteria hash,TTL 60s),避免短时连点重复打接口。

### 5.4 错误处理 & 限流防护

| 场景 | 处理 |
| --- | --- |
| 东财接口超时/挂 | `HttpClient` 已有 retry/timeout;最终失败 → `stocks:screen` 返 `{ok:false, reason:"fetch_failed"}`,前端 toast |
| 接口改版字段缺失 | fetcher 字段存在校验,缺字段返 null,filter 跳过——不崩 |
| 高频请求被限流 | 缓存 TTL 60s + 后台 scheduler 固定间隔;前端防抖(连点只发一次) |
| 盘外/休市 | scheduler 休眠;手动筛选仍可用(返回上一交易日收盘数据) |

## 6. 渲染端 UI

### 6.1 文件结构(对照 `src/renderer/funds/`)

```
src/renderer/stocks/
  stockStore.js            # signals store, 对照 fundStore.js
  ScreenerPanel.jsx        # 选股 tab 容器 (Header + 条件区 + 表格)
  StrategyBar.jsx          # 策略 chip 横条 (4 预设 + 自定义)
  CriteriaPanel.jsx        # 精简条件区 (PE/ROE/市值 + ⚙高级折叠)
  ResultTable.jsx          # 结果表格 (列头排序 + ⭐存自选)
  WatchlistPanel.jsx       # 自选股 tab (列表 + 刷新)
  AddStockModal.jsx        # 加自选 (搜索代码/名称, 对照 AddFundModal)
```

### 6.2 组件职责与数据流

```
SideNav (加"📈 选股" + "⭐自选股" 两个 tab)
  │
  ├─ ScreenerPanel
  │    ├─ StrategyBar ──点 chip──> stockStore.applyStrategy(id) ─> 填充 criteria
  │    ├─ CriteriaPanel ──改输入──> stockStore.setCriteria(patch)
  │    │                              └─ 微调后 activeStrategy 自动切 'custom'
  │    └─ ResultTable ──点筛选──> api.stocksScreen(criteria, sort)
  │         ├─ 点列头 ──> stockStore.setSort(key)
  │         └─ 点 ⭐ ──> api.stocksWatchlistAdd/Remove(code)
  │
  └─ WatchlistPanel
       └─ + 按钮 ──> AddStockModal (api.stocksSearch 模糊搜)
            订阅 stocks:watchlist:quotes ─> 实时价/涨跌
```

### 6.3 store signals(对照 fundStore)

- `criteria` (signal) — 当前筛选条件
- `activeStrategy` (signal) — 当前策略 id
- `results` (signal) — 筛选结果数组
- `fetchedAt` / `loading` / `error` (signal)
- `sortKey` / `sortDir` (signal)
- `watchlist` (signal) — 自选股列表
- `watchlistQuotes` (signal) — 自选股实时行情 {code: {...}}
- `advancedOpen` (signal) — 高级条件折叠状态

### 6.4 关键交互

- 进选股 tab → 读 `stockScreener.lastCriteria` 恢复上次条件 → **不自动筛选**(用户手动点 🔍,避免进 tab 就打接口)
- 策略 chip 选中态:`activeStrategy === id` 高亮;用户改任何条件 → 自动切 `custom`,所有 chip 取消高亮
- 表格列头点击 toggle 排序方向,sort 变化触发 `api.stocksScreen(criteria, newSort)`
- 布局采用**方案 A(策略横条 chip)**:4-5 个预设策略平铺,一眼可见一键切换;条件区精简(默认 PE/ROE/市值,高级折叠 PB/股息/换手/行业)

### 6.5 CSS

新增 `styles.css` 里 `.stock-*` 前缀样式段(对照现有 `.fund-*`),复用 `.tab-list` / `.btn` / `PanelEmpty` 等通用组件。SideNav 图标用 `IconChart`(icons.jsx 新增)。

## 7. 测试(vitest,对照现有 tests/)

| 测试文件 | 覆盖 |
| --- | --- |
| `tests/stocks/stock-filter.test.js` | **纯函数重点测**:filter(null 条件跳过、各区间组合)、sort(升降序、null 值排尾) |
| `tests/stocks/strategies.test.js` | 4 个 `buildCriteria()` 返回值正确 |
| `tests/main/stock-store.test.js` | add/remove round-trip、去重、迁移(缺字段返默认) |
| `tests/main/register-stocks.test.js` | IPC handler:screen 成功/失败、watchlist add/remove、search(mock HttpClient) |

优先级:`stock-filter.test.js` 是纯逻辑最重要——filter/sort 正确是筛选器质量核心。fetcher 网络部分用 fixture mock(对照 `fund-fetcher.test.js`),不真打网络。

## 8. 验收

- [ ] `state.json` 加 `stockWatchlist` + `stockScreener`,旧文件缺字段不报错
- [ ] 6 个 IPC handler 注册(screen/search/watchlist×4)
- [ ] `stocks:screen` 调东财 clist 接口拉全市场 → filter → sort → 返回
- [ ] 4 个内置策略 chip,点击自动填条件;改条件切 custom
- [ ] 表格列头排序、⭐ 存自选
- [ ] 自选股 tab:搜索加/删、后台 5 分钟行情刷新、订阅推送
- [ ] 错误降级:接口失败 toast、缺字段跳过、缓存 60s
- [ ] SideNav 加"📈 选股" + "⭐自选股" 两个 tab
- [ ] `tests/stocks/` 全套绿,`stock-filter.test.js` 覆盖 filter+sort
- [ ] release notes

## 9. 明确不做(留后续阶段)

- **阶段二 AI 分析**:每行 AI 诊股按钮 → 复用 `shared-llm` + P71 预算硬限
- **阶段三 策略 skill**:用户自定义策略保存/复用 + 策略市场(目前 4 个预设硬编码)
- 港股/美股、ETF/指数
- 盘中高频推送(秒级/分钟级实时)
- K线图、技术指标(均线/MACD)

## 10. 风险

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| 东财 clist 接口改版/限流 | 中 | fetcher 抽象层方便换源;缓存 TTL 60s;后台固定间隔;失败友好降级 |
| ROE/股息率字段不全 | 中 | 单接口缺字段标 null,filter 跳过该条件;必要时补财报接口二次请求 |
| 全市场 5000 只内存占用 | 低 | 主进程内存缓存仅 60s TTL;前端虚拟滚动,不全量渲染 DOM |
| scheduler 盘中误触发(节假日) | 低 | 复用 inQuietHours 思路 + 交易日历判断;失败不阻断 |
| 自选股退市/停牌仍显示 | 低 | 表格标灰 + 标记,用户手动删,不自动清 |

## 11. Brainstorming 决策记录

| # | 问题 | 用户选 |
|---|---|---|
| 1 | 方向 | B 条件选股筛选器(AI 分析、策略 skill 留后续阶段) |
| 2 | 市场范围 | A 股(沪深)优先 |
| 3 | 数据源 | 主进程 JS 直接打东财/腾讯接口(复用 HttpClient,无 Python) |
| 4 | v1 筛选维度 | 估值财务(PE/PB/ROE) + 行情动量(涨跌/换手) + 行业概念板块 + 市值区间(全选) |
| 5 | 结果交互 | 表格 + 排序 + 存自选(AI/策略保存推后) |
| 6 | 自选股存储 | 独立 `state.json.stockWatchlist[]` + 新 SideNav tab |
| 7 | 抓取时机 | 手动筛选 + 后台定时刷新(复用 scheduler,避免限流) |
| 8 | 策略入口 | 方案 A 策略横条 chip(平铺一键切换) |
| 9 | 条件区密度 | 精简(默认露常用 + 高级折叠) + 4 个固定策略自动填 |
| 10 | 进 tab 行为 | 不自动筛选,用户手动点 🔍 |

**额外决策(讨论中确认):**
- 架构选方案 A(东财单接口 + 前端计算),方案 B/C 否决
- 不复用基金 fundScheduler 实例,新建独立 stockQuoteScheduler
- 节流参数:筛选缓存 60s + 自选股后台 5 分钟刷新
- 4 个内置策略:value_roe / blue_chip / high_div / momentum
- 市值分档 large/mid/small + all,不保留自定义区间
- 自选股不存快照只存代码
