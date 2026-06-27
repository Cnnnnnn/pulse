# Stock Detail AI Few-shot Examples Design

## 背景

个股 AI 分析 (`stock_detail_analyze`) 当前 prompt 的 `fewShot` 字段为空 (`src/ai/prompt-registry.js` line 137).

LLM 输出的稳定性问题:
- 偶发 perAngle 漏填某个 angle → UI 兜底为"暂无解读"
- signal 字段偶尔给非白名单值 → 校验降级为 "neutral"
- risks 过于泛泛而谈, 缺乏具体数据引用

调研依据: few-shot 已被同仓库其它 prompt (upgrade_advice, changelog_summary) 验证能显著稳定 LLM 输出格式 + 减少空话.

## 目标

为 `stock_detail_analyze` 加 2 个手写 few-shot 示例, 让 LLM:
1. 看到完整输入 → 完整输出 + 客观引用具体数字
2. 看到部分数据缺失 → 缺失的 angle.perAngle 字段填 "暂无数据", 不编造

## 改动

### 唯一修改点

`src/ai/prompt-registry.js` 的 `DEFAULT_PROMPTS.stock_detail_analyze.fewShot` 字段. 从 `""` 改为含 2 个示例的字符串.

### 示例 1: 正常股 600519 (贵州茅台, 4 个 angle 全部 ok)

**输入** (模拟 store 喂到 user message 的内容):
```
股票: 600519
各角度数据 (已是归约后的观察短文, 含单位与关键趋势):
- 价格趋势 (price_trend): 30 个交易日 close 从 1680.00 → 1720.00 (累计 2.38%); 区间最低 1620.00 最高 1750.00; 近 5 日涨跌 0.89%, 近 20 日涨跌 3.20%; 日均振幅 1.20%
- 估值水位 (valuation): 动态 PE 28.50 倍; PB 9.20 倍; 3 年 PE 分位 35.00%
- 盈利能力 (profitability): ROE 32.50%; 毛利率 91.20%; 净利率 52.30% (报告期 2024Q3)
- 交易热度 (volume_turnover): 30 日均成交额 12.30 亿; 最新成交额 18.50 亿 (相当于均量 150%); 30 日均换手率 0.45%; 最新换手率 0.62%
```

**输出** (期望 LLM 模仿的 JSON):
```json
{
  "summary": "贵州茅台近 30 日股价横盘 (累计 2.38%), 估值 PE 28.5 倍位于近 3 年 35 分位偏低区间, 盈利能力 ROE 32.5% 维持高位, 近期成交活跃 (日均量 1.5 倍).",
  "perAngle": {
    "price_trend": "30 日累计涨幅 2.38%, 区间窄幅震荡 (1620-1750), 5 日/20 日涨幅均温和, 短期趋势偏中性.",
    "valuation": "动态 PE 28.5 倍位于近 3 年 35 分位, 估值水平偏中性偏低; PB 9.2 倍反映高 ROE 资产溢价.",
    "profitability": "ROE 32.5% 与毛利率 91.2% 维持行业极高位, 净利率 52.3% 显著高于消费板块均值, 盈利质量优.",
    "volume_turnover": "最新日成交额 18.5 亿较 30 日均量 1.5 倍, 换手率 0.62% 略升, 交投活跃度边际改善."
  },
  "risks": [
    "PE 28.5 倍虽处近 3 年中位以下, 但绝对水平不低, 估值修复空间有限.",
    "最新日成交放量但涨幅温和, 多空分歧需后续确认."
  ],
  "signal": "neutral"
}
```

### 示例 2: 数据缺失 002463 (沪电股份, 2 个 angle 失败)

**输入**:
```
股票: 002463
各角度数据 (已是归约后的观察短文, 含单位与关键趋势):
- 价格趋势 (price_trend): 30 个交易日 close 从 35.00 → 48.00 (累计 37.14%); 区间最低 33.50 最高 49.20; 近 5 日涨跌 8.50%, 近 20 日涨跌 22.00%; 日均振幅 4.20%
- 资金流向 (capital_flow): 数据缺失
- 新闻舆情 (news_buzz): 数据缺失
```

**输出**:
```json
{
  "summary": "沪电股份近 30 日累计涨幅 37.14% 表现强势, 短期加速 (5 日 +8.5%); 资金流向与新闻舆情数据缺失, 难以全面评估, 建议后续关注.",
  "perAngle": {
    "price_trend": "30 日累计 37.14% 涨幅显著, 5 日 +8.5% 显示短期加速, 振幅 4.2% 反映波动率上升.",
    "capital_flow": "暂无数据",
    "news_buzz": "暂无数据"
  },
  "risks": [
    "短期累计涨幅 37% 较快, 后续存在技术性回调可能.",
    "资金面与舆情数据缺失, 风险评估不完整, 建议结合其它数据源交叉验证."
  ],
  "signal": "neutral"
}
```

### 格式要求

- 示例间用空行分隔, 拼接为单字符串 (跟现有 `upgrade_advice.fewShot` 一致)
- 每个示例固定为 2 段: "输入:" + JSON 输入, 换行, "输出:" + JSON 输出
- fewShot 会被 `resolvePrompt` 返回, 由 `buildAnalyzeMessages` 拼到 system 消息末尾 (现有逻辑已支持, 不动)

## 不做

- 不改 `stock_detail_analyze.system` 或 `rules` 字段
- 不改 `stock-detail-advisor.js` (现有代码已读 `fewShot` 字段)
- 不加新依赖
- 不拆分 prompt-registry 架构
- 不持久化 fewShot 用户编辑 (只走 default; 用户若在 Settings 改了 system+rules 仍用 default few-shot)

## 验收

### 测试

`tests/ai/prompt-registry.test.js` (新建):
1. `stock_detail_analyze.fewShot` 非空字符串
2. fewShot 包含 "价格趋势" / "资金流向" / "新闻舆情" / "暂无数据" 关键字 (覆盖两个示例的特征)
3. fewShot 包含 2 个 "输入:" 和 2 个 "输出:" 分隔标记

`tests/ai/stock-detail-advisor.test.js` (补 1 个):
- 模拟 LLM 模仿 few-shot 示例的格式输出 (含数据缺失的 angle 标 "暂无数据") → `parseAndValidateAnalyze` 正常解析, `result.perAngle.news_buzz === "暂无数据"`

### 手工验证

1. `npm start` → 选股 → "开始 AI 分析" → 验证 perAngle 字段尽量填满, 缺失 angle 明确标 "暂无数据" (而非空字符串)
2. 验证 risks 引用至少 1 个具体数字 (e.g. "PE 28.5 倍" 而非 "估值偏高")
3. 验证 signal 永远是白名单值 (因为有了示例)

## 风险

- fewShot 文本会进 system message, 增加 token 消耗. 估算 2 个示例 ~700 字 ≈ 1000 tokens, 每次调 LLM 多 1000 tokens. 极小.
- 示例的 stock code (600519, 002463) 是固定值, 不会与 LLM 实际输入冲突 (因 few-shot 在 system 段, user 段是另一只股)
- 示例中"数据缺失"必须严格用 "暂无数据" 字符串, 跟 `rules` 第 5 条保持一致

## 影响面

- 只动 1 个文件 1 个字段
- 不改任何渲染端 / store / fetcher / advisor 逻辑
- 不影响缓存键 (cache key 跟 few-shot 内容无关, 见 `adviseCacheKey`)
- 不破坏向后兼容 (用户已在 Settings 编辑过此 prompt 的 system/rules 的, fewShot 仍是 default 值追加)
