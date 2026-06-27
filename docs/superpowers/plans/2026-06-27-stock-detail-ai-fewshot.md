# Stock Detail AI Few-shot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `stock_detail_analyze` prompt 添加 2 个手写 few-shot 示例 (正常股 + 数据缺失), 稳定 LLM 输出格式, 减少 perAngle 漏填和 risks 空话.

**Architecture:** 改 `src/ai/prompt-registry.js` 1 个文件 1 个字段 (`stock_detail_analyze.fewShot`). advisor 代码已读 `fewShot` 字段, 无需改. 加 2 个测试文件覆盖字段存在性 + 解析兼容.

**Tech Stack:** Node.js + Vitest (项目已用), JavaScript (CommonJS).

**Spec:** `docs/superpowers/specs/2026-06-27-stock-detail-ai-fewshot-design.md`

## Global Constraints

- 只动 1 个源文件: `src/ai/prompt-registry.js` (`stock_detail_analyze.fewShot` 字段)
- 不改 `stock_detail_analyze.system` / `rules` 字段
- 不改 `src/ai/stock-detail-advisor.js`
- 不加新依赖
- 不破坏缓存键 (`adviseCacheKey` 与 few-shot 内容无关)
- 提交用 conventional commits 风格 (与 `gitlab-workflow` 规则一致)
- 测试用 Vitest (项目既定)
- 所有改动必须 `npx vitest run` 全绿 + `node scripts/build-renderer.js` 无错
- 代码必须放文件顶部 (无 inline import, 符合 `no-inline-imports` 规则)

---

### Task 1: 加 prompt-registry few-shot 字段测试 (TDD red)

**Files:**
- Create: `tests/ai/prompt-registry.test.js`
- Test: `tests/ai/prompt-registry.test.js`

**Interfaces:**
- Consumes: `DEFAULT_PROMPTS` (从 `src/ai/prompt-registry.js` 导出)
- Produces: 1 个 describe 块 + 3 个 it 验证 few-shot 字段存在性和内容特征

- [ ] **Step 1: 写失败测试**

写入 `tests/ai/prompt-registry.test.js`:

```js
const { describe, it, expect } = require("vitest");
const { DEFAULT_PROMPTS } = require("../../src/ai/prompt-registry.js");

describe("stock_detail_analyze prompt", () => {
  it("fewShot 字段非空字符串", () => {
    const fewShot = DEFAULT_PROMPTS.stock_detail_analyze.fewShot;
    expect(typeof fewShot).toBe("string");
    expect(fewShot.trim().length).toBeGreaterThan(0);
  });

  it("fewShot 包含两个示例的关键 angle 关键字", () => {
    const fewShot = DEFAULT_PROMPTS.stock_detail_analyze.fewShot;
    // 示例 1: 正常股覆盖 price_trend / valuation / profitability / volume_turnover
    expect(fewShot).toContain("价格趋势");
    expect(fewShot).toContain("估值水位");
    expect(fewShot).toContain("盈利能力");
    // 示例 2: 数据缺失覆盖 capital_flow / news_buzz
    expect(fewShot).toContain("资金流向");
    expect(fewShot).toContain("新闻舆情");
  });

  it("fewShot 包含 '暂无数据' 字符串 (数据缺失示例特征)", () => {
    const fewShot = DEFAULT_PROMPTS.stock_detail_analyze.fewShot;
    expect(fewShot).toContain("暂无数据");
  });

  it("fewShot 包含 2 个 '输入:' 和 2 个 '输出:' 分隔标记", () => {
    const fewShot = DEFAULT_PROMPTS.stock_detail_analyze.fewShot;
    const inputMatches = fewShot.match(/输入:/g) || [];
    const outputMatches = fewShot.match(/输出:/g) || [];
    expect(inputMatches.length).toBe(2);
    expect(outputMatches.length).toBe(2);
  });
});
```

- [ ] **Step 2: 跑测试, 验证失败 (red)**

Run: `npx vitest run tests/ai/prompt-registry.test.js`
Expected: FAIL — `fewShot` 当前为 `""`, 第一个 it 在 `trim().length > 0` 处失败.

- [ ] **Step 3: 提交失败测试**

```bash
git add tests/ai/prompt-registry.test.js
git commit -m "test(ai): stock_detail_analyze few-shot 字段断言 (red)"
```

---

### Task 2: 填 few-shot 字段 (TDD green)

**Files:**
- Modify: `src/ai/prompt-registry.js:122-137` (在 `stock_detail_analyze` 对象的 `fewShot: ""` 处替换)

**Interfaces:**
- Consumes: Task 1 的测试断言
- Produces: `stock_detail_analyze.fewShot` 为非空字符串, 包含 2 个示例

- [ ] **Step 1: 修改 prompt-registry.js**

把 `src/ai/prompt-registry.js` 中 `stock_detail_analyze` 对象的 `fewShot: "",` 替换为:

```js
    fewShot: [
      "输入: 600519, 4 angle 齐全 (价格趋势/估值/盈利能力/交易热度)",
      "  价格趋势: 30 日 close 1680.00 → 1720.00 (累计 2.38%); 区间最低 1620.00 最高 1750.00; 近 5 日涨跌 0.89%, 近 20 日涨跌 3.20%; 日均振幅 1.20%",
      "  估值水位: 动态 PE 28.50 倍; PB 9.20 倍; 3 年 PE 分位 35.00%",
      "  盈利能力: ROE 32.50%; 毛利率 91.20%; 净利率 52.30% (报告期 2024Q3)",
      "  交易热度: 30 日均成交额 12.30 亿; 最新成交额 18.50 亿 (相当于均量 150%); 30 日均换手率 0.45%; 最新换手率 0.62%",
      '输出: {"summary":"贵州茅台近 30 日股价横盘 (累计 2.38%), 估值 PE 28.5 倍位于近 3 年 35 分位偏低区间, 盈利能力 ROE 32.5% 维持高位, 近期成交活跃 (日均量 1.5 倍).","perAngle":{"price_trend":"30 日累计涨幅 2.38%, 区间窄幅震荡 (1620-1750), 5/20 日涨幅温和, 短期偏中性.","valuation":"动态 PE 28.5 倍位于近 3 年 35 分位, 估值中性偏低; PB 9.2 倍反映高 ROE 资产溢价.","profitability":"ROE 32.5% 与毛利率 91.2% 维持行业极高位, 净利率 52.3% 显著高于消费板块均值, 盈利质量优.","volume_turnover":"最新日成交 18.5 亿为 30 日均量 1.5 倍, 换手率 0.62% 略升, 交投活跃度边际改善."},"risks":["PE 28.5 倍虽处近 3 年中位以下但绝对水平不低, 估值修复空间有限.","最新日成交放量但涨幅温和, 多空分歧需后续确认."],"signal":"neutral"}',
      "",
      "输入: 002463, 2 angle 数据缺失 (资金流向/新闻舆情)",
      "  价格趋势: 30 日 close 35.00 → 48.00 (累计 37.14%); 区间最低 33.50 最高 49.20; 近 5 日涨跌 8.50%, 近 20 日涨跌 22.00%; 日均振幅 4.20%",
      "  资金流向: 数据缺失",
      "  新闻舆情: 数据缺失",
      '输出: {"summary":"沪电股份近 30 日累计涨幅 37.14% 表现强势, 短期加速 (5 日 +8.5%); 资金流向与新闻舆情数据缺失, 难以全面评估, 建议后续关注.","perAngle":{"price_trend":"30 日累计 37.14% 涨幅显著, 5 日 +8.5% 显示短期加速, 振幅 4.2% 反映波动率上升.","capital_flow":"暂无数据","news_buzz":"暂无数据"},"risks":["短期累计涨幅 37% 较快, 后续存在技术性回调可能.","资金面与舆情数据缺失, 风险评估不完整, 建议结合其它数据源交叉验证."],"signal":"neutral"}',
    ].join("\n"),
```

- [ ] **Step 2: 跑测试, 验证通过 (green)**

Run: `npx vitest run tests/ai/prompt-registry.test.js`
Expected: 4 个 it 全部 PASS.

- [ ] **Step 3: 全量回归**

Run: `npx vitest run`
Expected: 既有 3154 个 + 4 个新 = 3158 个, 全部 PASS, 0 FAIL.

- [ ] **Step 4: 提交**

```bash
git add src/ai/prompt-registry.js
git commit -m "feat(ai): stock_detail_analyze 加 few-shot 示例 (正常股 + 数据缺失)"
```

---

### Task 3: 补 advisor 解析测试 (覆盖 few-shot 输出格式)

**Files:**
- Modify: `tests/ai/stock-detail-advisor.test.js` (在末尾加 1 个 it)
- Test: `tests/ai/stock-detail-advisor.test.js`

**Interfaces:**
- Consumes: `parseAndValidateAnalyze` (从 `src/ai/stock-detail-advisor.js` 导出)
- Produces: 1 个新 it 验证 LLM 模仿 few-shot 输出格式 (含 "暂无数据" 的 perAngle 项) 正常解析

- [ ] **Step 1: 读现有 advisor 测试文件, 找到合适的插入位置**

Run: `Read tests/ai/stock-detail-advisor.test.js`
找到最后一个 `});` 块, 在其前面 (即最后一个 `it()` 之后) 插入新 it.

- [ ] **Step 2: 加新 it**

在最后一个 `});` 之前插入:

```js
  it("解析 LLM 模仿 few-shot 示例的输出 (含 '暂无数据' 的 perAngle 项)", () => {
    // ponytail: 模拟 LLM 看到 few-shot 后学到的输出格式, 数据缺失的 angle 填 "暂无数据".
    // parseAndValidate 不区分空字符串 vs 业务串 — "暂无数据" 应作为有效解读保留.
    const llmText = JSON.stringify({
      summary: "沪电股份近 30 日累计涨幅 37.14% 表现强势, 短期加速 (5 日 +8.5%); 资金流向与新闻舆情数据缺失.",
      perAngle: {
        price_trend: "30 日累计 37.14% 涨幅显著, 5 日 +8.5% 显示短期加速.",
        capital_flow: "暂无数据",
        news_buzz: "暂无数据",
      },
      risks: [
        "短期累计涨幅 37% 较快, 后续存在技术性回调可能.",
        "资金面与舆情数据缺失, 风险评估不完整.",
      ],
      signal: "neutral",
    });
    const parsed = parseAndValidateAnalyze(llmText);
    expect(parsed).not.toBeNull();
    expect(parsed.perAngle.capital_flow).toBe("暂无数据");
    expect(parsed.perAngle.news_buzz).toBe("暂无数据");
    expect(parsed.risks).toHaveLength(2);
    expect(parsed.signal).toBe("neutral");
  });
```

- [ ] **Step 3: 跑测试, 验证通过**

Run: `npx vitest run tests/ai/stock-detail-advisor.test.js`
Expected: 既有 N 个 + 1 个新 = N+1 个, 全部 PASS.

- [ ] **Step 4: 全量回归**

Run: `npx vitest run`
Expected: 3158 + 1 = 3159 个, 全部 PASS, 0 FAIL.

- [ ] **Step 5: renderer build 验证**

Run: `node scripts/build-renderer.js`
Expected: 退出码 0, 无错误输出.

- [ ] **Step 6: 提交**

```bash
git add tests/ai/stock-detail-advisor.test.js
git commit -m "test(ai): stock_detail_advisor 解析 few-shot 格式输出"
```

---

### Task 4: 验证完成

**Files:** 无 (仅验证)

- [ ] **Step 1: 全量测试再跑一次**

Run: `npx vitest run 2>&1 | tail -5`
Expected: `PASS (3159) FAIL (0)`.

- [ ] **Step 2: git log 看 3 个新 commit**

Run: `git log --oneline -5`
Expected: 看到 3 个新 commit (test red / feat / test 补), 顺序对应 Task 1/2/3.

- [ ] **Step 3: git status 干净**

Run: `git status`
Expected: `nothing to commit, working tree clean`.

---

## 备注

- 此 plan 不需要拆 worktree (改动 < 100 行, 集中在 1 个 src 文件 + 2 个 test 文件)
- 不需要 review 节点间停 (改动是 1 字段 + 2 测试, 评审可在最后整体看)
- LLM 行为变化需真实调 LLM 才能观察; plan 范围内只保证 prompt 字段正确 + parse 兼容
