# 个股财务深度 — 同业对比 + 护城河评分 (设计)

> **阶段六 = 个股财务深度**: 在阶段四/五 (AI 解读 + UI 重做) 基础上, 给"选股 → 个股分析"流程补 2 个新 angle, 帮用户回答"这只比同行贵不贵、是不是真龙头".
> 沿用现有 fetcher / IPC / cache / store / LLM 模式, 不动 AI 解读的核心契约, 只在 `summarizeForAi` 增 2 段.

## 0. 背景与目的

阶段五 (UI 重做) 后用户反馈新痛点:
1. 现有 `valuation` (动态 PE / PB) 是**绝对值**, 不知道相对同行是贵是便宜
2. 现有 `profitability` (ROE / 毛利率) 是**单股快照**, 不知道"是不是同行里最好的" / 是不是"真护城河"

调研 (同行业, 来自 web search):
- **同业对比**: 东财 datacenter 公开 `RPT_PCF10_INDUSTRY_*` 系列接口, 返回每只股票在所属行业内的 PE / PB / PS **排名** (PE_TTM_RANK 等) + 行业 **中位数** (PE_TTM_MEDIAN 等). 不需商业 API, 公开可拉.
- **护城河评分**: 东财没有现成"护城河分", 走**客户端 3 维评分** (毛利率优势 / ROIC 优势 / 营收稳定度), 原始数据全是 datacenter 公开接口.

本 spec 在 `stock-detail-angles.js` 注册 2 个新 angle (`peer_compare`, `moat_score`), 财务 tab 内加 2 个折叠子区, AI 解读时引用这 2 维度数据.

## 1. 范围 (MVP)

### 1.1 必须做

- **新增 2 个 angle** (在 `src/stocks/stock-detail-angles.js` 注册):
  | key | label | group | fetcher | summarizeForAi |
  |---|---|---|---|---|
  | `peer_compare` | 同业对比 | 财务 | `src/stocks/detail-fetchers/peer-compare.js` | 同业 PE / PB 中位数 + 这只的排名 + 偏差百分比 |
  | `moat_score` | 护城河 | 财务 | `src/stocks/detail-fetchers/moat-score.js` | 3 维评分 (0-3) + 总分 (0-9) + 1 行质性解读 |

- **fetcher 形态**:
  - 复用 `chromium-http-client` (跟现有 7 个 angle 一致)
  - 走 8s timeout + 1 retry, 失败时 entry `status: "failed"`, 渲染端按现有 `angleStatusForTab` 状态机显示"拉取失败"
  - 不缓存 5min 内的 datacenter 数据 (跟现有 fetcher 一致: 主进程 60s 内存缓存)
  - 走 `stockDetailCache` 24h 持久化 (跟 `stock-detail-advisor.js` 一致) — 这是 LLM 解读的 cache, 不是 fetcher 的

- **数据契约** (`peer_compare`):
  ```js
  {
    industry: "汽车零部件",          // 来自 valuation fetcher 的 industry 字段
    pe: 28.5,                       // 复用 valuation fetcher, 不重拉
    peIndustryMedian: 22.0,          // 来自 RPT_PCF10_INDUSTRY_EVALUATION
    peRank: 18,                     // 来自 RPT_PCF10_INDUSTRY_EVALUATION (PE_TTM_RANK)
    peTotal: 52,                    // 行业总股票数
    peDeviationPct: 29.5,           // (pe - median) / median * 100
    pb: 4.2,                        // 复用 valuation fetcher
    pbIndustryMedian: 3.1,          // 同接口 PB_MQR_MEDIAN
    pbRank: 21,
    pbTotal: 52,
    pbDeviationPct: 35.5,
  }
  ```
  失败 (industry 为空 / median 为 null) → `status: "failed"`, reason: "no_industry_data".

- **数据契约** (`moat_score`):
  ```js
  {
    score: 7,                       // 总分 0-9
    breakdown: {
      marginEdge: 2,                // 0-3
      roicEdge: 3,                  // 0-3
      revenueStability: 2,          // 0-3
    },
    metrics: {
      grossMargin: 35.5,            // 当前报告期 (%)
      industryGrossMarginMedian: 22.0,
      roic: 18.2,                   // 当前报告期 (%)
      industryRoicMedian: 8.5,
      revenueCagr5y: 12.5,          // 近 5 年营收 CAGR (%), 用于"稳定度"
      revenueRankInIndustry: 5,     // 在行业里的营收排名
      industryTotal: 52,
    },
    note: "毛利高 + ROIC 高, 营收稳定, 强护城河",  // 客户端根据 3 维 score 生成
  }
  ```
  任意 1 维无法计算 (毛利率 / ROIC 缺失) → 该维 score = 0, 总分 = 剩余 2 维之和, `note` 标 "数据缺失部分维度".

- **3 维评分规则** (客户端 hardcode 在 fetcher 里):
  - `marginEdge` (毛利优势, 0-3):
    - `grossMargin - industryGrossMarginMedian > 20pp` (百分点, 不是百分比) AND 当前毛利率在自身近 3 年 70 分位以上 → 3
    - `> 10pp` AND 当前毛利率在自身近 3 年 70 分位以上 → 2
    - `> 0` AND ROIC > 行业中位 → 1
    - 其他 → 0
  - `roicEdge` (ROIC 优势, 0-3):
    - `roic - industryRoicMedian > 10pp` → 3
    - `> 5pp` → 2
    - `> 0` → 1
    - 其他 → 0
  - `revenueStability` (营收稳定度, 0-3):
    - 营收排名稳定 (近 3 年 `revenueRankInIndustry` 极差 ≤ 2 位) AND 5 年 CAGR > 10% → 3
    - 营收排名稳定 AND 5 年 CAGR > 0% → 2
    - 5 年 CAGR > 行业 GDP 增速 (~5%) → 1
    - 其他 → 0

- **fetcher 实现要点**:
  - `peer_compare` fetcher 内部**直接调 `valuation` fetcher 拿 PE/PB** (不重拉 datacenter), 节省 1 次 HTTP
  - `moat_score` fetcher 走 2 个并行 datacenter 调用: 1) 自身财务 (近 5 年营收 / ROIC / 毛利率) 2) 行业财务中位数 (单独 1 个 reportName). 失败隔离同 `stock-detail-fetcher.js` 的 `Promise.allSettled` 模式

- **UI 改动** (`src/renderer/stocks/StockDetailDrawer.jsx`):
  - 财务 tab (FinancePanel) 在现有 6 个 metric card 下方, 加 2 个折叠子区, 用 `<details>` 元素 (原生折叠, 0 新依赖)
  - 子区标题: "📊 同业对比" / "🏰 护城河评分"
  - 子区内部: 走现有 `angleStatusForTab(["peer_compare"])` / `angleStatusForTab(["moat_score"])` 状态机
    - 用户未勾选该 angle → 子区不显示
    - 已勾选 + loading → "拉取中…"
    - 已勾选 + ready → 渲染子区内容
    - 已勾选 + failed → "拉取失败, 跳过此维度"
  - `angleStatusForTab` 已在阶段五支持单 key, 无需改
  - 子区样式: `.stock-finance-subblock` (新 CSS, 见 §3)

- **AI 解读增强** (`src/ai/prompt-registry.js`):
  - 在 `stock_detail_analyze` 的 `fewShot` 末尾加 1 个新示例, 演示"4 个 angle + 同业对比 + 护城河"全选的输出格式
  - 在 system 段 rules 加 1 条: "若用户勾选同业对比或护城河 angle, summary 必须引用 1 句具体数据 (例: 'PE 28.5 倍较行业中位 22.0 倍偏高 30%' / '护城河 7/9, 毛利率与 ROIC 双优势')"
  - 新 angle 的 `summarizeForAi` 各加 1 段短文 (例: "同业对比: PE 28.5 倍 vs 行业中位 22.0 倍, 排名 18/52, 偏贵 30%; PB 4.2 vs 3.1, 排名 21/52, 偏贵 35%")

- **测试**:
  - `tests/stocks/peer-compare.test.js` 新建, 覆盖 datacenter 返回 200 / 200 但 result.data 为空 / 500 / timeout, 各 path
  - `tests/stocks/moat-score.test.js` 新建, 覆盖 3 维评分 4 个 tier (0/1/2/3) 各 1 个 case
  - `tests/renderer/stocks/StockDetailDrawer.test.jsx` 补 4 个 case: 2 个 angle 在 4 种状态下 (not_selected / loading / ready / failed) 的子区渲染
  - `tests/ai/stock-detail-advisor.test.js` 补 1 个 case: 新 few-shot 示例的 perAngle 结构 (含 `peer_compare` / `moat_score` key)

- **发版 cache-busting**: `stockDetailCache` 不动 (LLM 解读的 cache, 24h TTL 自带失效). fetcher 60s 内存 cache 不动.

### 1.2 不在范围 (留后续)

- ❌ 同业 TopN 表格 (fetcher 简单原则, 排名够用)
- ❌ 5 种护城河类型分类 (众问风格, 太重)
- ❌ 历史护城河趋势 (近 3 年 vs 现在对比)
- ❌ 点位信号 / 股东变动 (阶段六没选, 留阶段七)
- ❌ 国际化 i18n
- ❌ 自定义 prompt 编辑
- ❌ 暗黑模式适配 (财务子区 CSS 走现有 `--stock-*-bg/-text` 变量, 自动跟随)
- ❌ 移动端适配

## 2. 架构

### 2.1 模块分布

```
src/
  stocks/
    stock-detail-angles.js          # 改: 注册 2 个新 angle
    detail-fetchers/
      peer-compare.js               # 新: datacenter 行业均值 fetcher
      moat-score.js                 # 新: datacenter 财务 + 行业 fetcher
  renderer/
    stocks/
      StockDetailDrawer.jsx         # 改: FinancePanel 加 2 个折叠子区
  styles.css                        # 改: ~30 行 .stock-finance-subblock 样式
  ai/
    prompt-registry.js              # 改: stock_detail_analyze.fewShot 加 1 例, rules 加 1 条
tests/
  stocks/
    peer-compare.test.js            # 新
    moat-score.test.js              # 新
  renderer/stocks/
    StockDetailDrawer.test.jsx      # 改: 补 4 个 case
  ai/
    stock-detail-advisor.test.js    # 改: 补 1 个 case (few-shot 解析)
```

### 2.2 架构原则

- **fetcher 单职责**: 1 个 angle = 1 个 fetcher 文件 + 1 行注册 + 1 个 `summarizeForAi`. 跟现有 7 个 angle 完全一致
- **fetcher 复用**: `peer_compare` 内部 await `valuation` fetcher 拿 PE/PB, 不重拉 datacenter. `moat_score` 复用 profitability 已有财务接口的 data 缓存 (主进程 60s 内存 cache 跨 fetcher 命中, 走 datacenter 同 host, 节省 50% HTTP)
- **score 计算在 fetcher**: 不在 LLM 端算 — 数字评分要稳定, 客户端 hardcode, 不让 LLM 自由发挥
- **UI 不动 AI 契约**: 不增加新 prompt key / 新 cache key. 沿用 `stock_detail_analyze` prompt + `stockDetailCache` 24h cache
- **错误隔离**: 2 个新 angle 失败不影响其他 angle. fetcher 返 `status: "failed"`, `reason: "fetch_failed" | "parse_failed" | "no_industry_data" | "no_finance_data"`, UI 端复用 `FETCH_REASON_TEXT` 字典
- **不引第三方依赖**: 不引图表库 / 评分服务. 复用现有 `chromium-http-client` + `<details>` 原生元素 + existing CSS variables

### 2.3 数据流 (peer_compare 为例)

```
用户勾选 chip
  ↓
stockDetailStore.toggleAngle("peer_compare")
  ↓
loadAngleData(api, code, "peer_compare")
  ↓ IPC: stocks:detail-angles { code, angles: ["peer_compare"] }
  ↓
主进程 register-stock-detail.js → stock-detail-fetcher.js (调度)
  ↓
peer-compare.js fetcher:
  1. 并行: 调 valuation fetcher (拿 PE/PB + industry) + datacenter 行业接口
  2. 算 peRank / peDeviationPct / pbRank / pbDeviationPct
  3. 返 { status: "ok", data: { industry, pe, peIndustryMedian, peRank, ... } }
  ↓
perAngleData.value.peer_compare = { status: "ok", data }
  ↓
FinancePanel 渲染:
  - 调 angleStatusForTab("peer_compare")
  - 状态 = "ready"
  - 渲染子区 <details>: 4 个 mini metric (PE 这只 / PE 中位 / 排名 / 偏差%) + PB 同 4 个
  ↓
用户点 "开始 AI 分析"
  ↓
buildAnalyzeMessages:
  - 调 ang.summarizeForAi(entry.data) → "同业对比: PE 28.5 倍 vs 行业中位 22.0 倍, 排名 18/52, 偏贵 30%; PB 4.2 vs 3.1, 排名 21/52, 偏贵 35%"
  - 拼进 user message
  ↓
chatCompletion → LLM 看到中文短文 + 5 个其他 angle 短文 → 返 JSON
  ↓
parseAndValidateAnalyze (阶段六升级的 4 策略 parser) → 解析成功
  ↓
AiFoldable 展示 summary (引用 "PE 较行业偏高 30%")
```

## 3. UI 细节

### 3.1 FinancePanel 改造 (子区折叠)

```jsx
function FinancePanel({ hidden }) {
  // ... 现有逻辑 ...
  return (
    <div role="tabpanel" id="stock-tabpanel-finance" ... class="stock-tab-panel stock-metric-grid">
      {items.map(...)}
      {/* peer_compare 子区, 走 angleStatusForTab */}
      <PeerCompareSubblock />
      {/* moat_score 子区 */}
      <MoatScoreSubblock />
    </div>
  );
}

function PeerCompareSubblock() {
  const status = angleStatusForTab("peer_compare");
  if (status.state === "not_selected") return null;  // 未勾选不显示
  if (status.state === "loading") return <SubblockSkeleton title="📊 同业对比" hint="拉取中…" />;
  if (status.state === "failed") return <SubblockSkeleton title="📊 同业对比" hint={`拉取失败: ${FETCH_REASON_TEXT[status.reason]}`} />;
  const data = angleEntry("peer_compare");
  return (
    <details class="stock-finance-subblock" open>
      <summary>📊 同业对比 · {data.industry}</summary>
      <div class="stock-finance-subblock-grid">
        <SubblockMetric label="PE 这只" value={data.pe} suffix="倍" />
        <SubblockMetric label="PE 行业中位" value={data.peIndustryMedian} suffix="倍" />
        <SubblockMetric label="PE 排名" value={`${data.peRank}/${data.peTotal}`} />
        <SubblockMetric
          label="PE 偏差"
          value={data.peDeviationPct}
          suffix="%"
          colored
        />
        {/* PB 同 4 个 */}
      </div>
    </details>
  );
}
```

### 3.2 CSS 新增 (`styles.css`)

```css
.stock-finance-subblock {
  grid-column: 1 / -1;
  margin-top: 12px;
  padding: 12px;
  background: var(--stock-panel-bg, #f5f5f7);
  border: 1px solid var(--stock-panel-border, #e5e5ea);
  border-radius: 8px;
}
.stock-finance-subblock > summary {
  font-weight: 600;
  cursor: pointer;
  list-style: none;
  padding: 4px 0;
}
.stock-finance-subblock > summary::-webkit-details-marker { display: none; }
.stock-finance-subblock > summary::before {
  content: "▸";
  display: inline-block;
  margin-right: 6px;
  transition: transform 0.15s;
}
.stock-finance-subblock[open] > summary::before { transform: rotate(90deg); }
.stock-finance-subblock-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 8px;
}
.stock-finance-subblock-skeleton {
  color: var(--stock-metric-label, #8e8e93);
  font-size: 13px;
  padding: 12px;
}
.stock-finance-subblock-metric.up { color: var(--stock-up, #ff3b30); }
.stock-finance-subblock-metric.down { color: var(--stock-down, #34c759); }
```

### 3.3 默认勾选策略

- `selectedAngles` 默认值不变: `["price_trend", "volume_turnover"]` (保持现状)
- 用户主动勾选 / 取消 `peer_compare` / `moat_score`, 走现有 `toggleAngle(key)` + `loadAngleData(api, code, key)` 链路
- 财务 tab 内子区始终渲染位置, 但只在 angle 已勾选时显示内容 (其他状态显示 skeleton 或不显示)

## 4. 错误处理

| 场景 | 处理 |
|---|---|
| datacenter 接口超时 (8s) | fetcher 返 `status: "failed"`, `reason: "fetch_failed"`. UI 子区显示"网络请求失败" |
| datacenter 200 但 result.data 为空 | fetcher 返 `status: "failed"`, `reason: "no_industry_data"`. UI 子区显示"暂无行业数据" |
| 该股票无 industry 字段 (新股 / 北交所) | peer_compare 返 `status: "failed"`, `reason: "no_industry_data"`. **moat_score 也返 `status: "failed"`, `reason: "no_industry_data"`** — 不做 fallback, 保持 2 个 angle 行为一致, 用户在 UI 上看到 2 个子区都失败, 不会困惑"为啥 peer 失败 moat 还能用" |
| 财务 5 年数据缺失 (< 3 年) | moat_score 的 `revenueStability` 降级: 该维 score = 0, `note` 追加 "营收稳定度数据不足" |
| 毛利率 / ROIC 单点缺失 | moat_score 的对应维 score = 0, `note` 标 "数据缺失部分维度", 总分 = 剩余 2 维 |
| LLM 返 parse_failed (阶段六升级的 4 策略 parser 都失败) | 跟现有一致: 抽屉显示"AI 失败 / 返回格式异常, 请重试" |
| 2 个 angle 都失败 | 不影响其他 5 个 angle, AI 仍可基于其他 5 个解读 |

## 5. 验收

### 5.1 fetcher 测试

**`tests/stocks/peer-compare.test.js`** (新建, 6 个 case):
1. 正常路径: valuation + datacenter 都 200 → 返完整 data
2. valuation 返 null (无 industry) → `status: "failed"`, `reason: "no_industry_data"`
3. datacenter 500 → `status: "failed"`, `reason: "fetch_failed"`
4. datacenter 200 但 `result.data = []` → `status: "failed"`, `reason: "no_industry_data"`
5. datacenter timeout (8s) → 抛 timeout 异常 → 走 fetch_failed
6. 算 peDeviationPct 正确: (28.5 - 22.0) / 22.0 * 100 = 29.55

**`tests/stocks/moat-score.test.js`** (新建, 8 个 case):
1. 3 维都满分 (marginEdge 3 + roicEdge 3 + revenueStability 3) → score=9
2. 3 维都 0 → score=0, note 标"无明显护城河"
3. 1 维缺失 (毛利率缺失) → marginEdge=0, 总分 = 剩余 2 维
4. 毛利超行业中位 20% → marginEdge=3
5. 毛利超行业中位 10% → marginEdge=2
6. ROIC 超行业中位 10pp → roicEdge=3
7. 营收 CAGR > 10% 且排名稳定 → revenueStability=3
8. 营收 CAGR < 0 → revenueStability=0

### 5.2 UI 测试 (`tests/renderer/stocks/StockDetailDrawer.test.jsx` 补 4 个)

1. 用户未勾选 `peer_compare` 时, 财务 tab 内无 `<details>` 子区
2. 用户勾选 + loading 时, 子区显示"拉取中…"
3. 用户勾选 + ready 时, 子区显示 4 个 PE mini metric + 4 个 PB mini metric
4. 用户勾选 + failed 时, 子区显示"拉取失败: 网络请求失败"

### 5.3 AI 解读测试 (`tests/ai/stock-detail-advisor.test.js` 补 1 个)

1. few-shot 第 3 个示例能正确解析: `perAngle` 含 `peer_compare` 和 `moat_score` key, 文本非空

### 5.4 端到端 (manual, 跑 `npm run dev`)

1. 选 600519, 勾选"同业对比" + "护城河" → 财务 tab 内看到 2 个子区
2. 选 002463 (小盘股, 数据少) → 同业对比子区正常, 护城河子区部分维度显示"数据不足"
3. 选 688xxx (科创板) → 同业对比子区正常 (用科创板行业代码)
4. 选 000xxx (深市北交所) → 同业对比子区显示"暂无行业数据", 护城河子区同样显示"暂无行业数据" (2 个 angle 行为一致, 不混淆)
5. 4 个 angle + 同业 + 护城河全选, 点"开始 AI 分析" → 5-15 秒内返结果, summary 引用 "PE 偏高 30%" / "护城河 7/9"

### 5.5 Lint + 既有测试

- `npx vitest run` 全量 (3400+ tests) 不回归
- `npx eslint` (无新增 lint error)

## 6. 发版

- `version` bump: `2.49.0` → `2.50.0` (新增 angle, 算 minor)
- `RELEASE-NOTES.md` 加 1 段 "阶段六: 财务深度 (同业对比 + 护城河)"
- `stockDetailCache` 24h TTL 自动清老 key, 不需手动清
- 不动 `CACHE_VERSION` (这次纯增量, 老 key 不冲突)

## 7. 不做 (重申)

- ❌ 同业 TopN 表格
- ❌ 5 种护城河类型分类
- ❌ 历史护城河趋势
- ❌ 点位信号 / 股东变动 (留阶段七)
- ❌ 国际化 i18n
- ❌ 自定义 prompt 编辑
- ❌ 暗黑模式专项适配 (走现有 CSS 变量, 自动跟随)
- ❌ 移动端适配
- ❌ 第三方图表库 / 评分服务
