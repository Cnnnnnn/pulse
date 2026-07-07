# 个股诊断报告重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把个股分析从"选 angle + 5 tab + 折叠 AI 的抽屉"重设计为"选股表格点诊断 → 全屏报告页（左列表右报告），结论置顶 + 模块卡，规则算分 + AI 解读，进页自动生成"。

**Architecture:** stocks nav 内新增子路由 signal `stockDiagnosisCode`；null=选股表格，有值=全屏诊断页。新增纯函数 `diagnosis-scorer.js`（5 维确定性评分，参照 moat-score 机制），AI 改造为"解说员"（收到 scores 不打分只解读）。复用 9 个 angle 数据契约 + IPC + AI 合规链路。

**Tech Stack:** Preact + @preact/signals（renderer），vitest + happy-dom + @testing-library/preact（测试），esbuild（构建）。

**Spec:** `docs/superpowers/specs/2026-07-04-stock-diagnosis-redesign-design.md`

**关键数据契约真相（写代码时务必遵循，与 spec §4 细化调整）:**
- `valuation` fetcher 的 `pePercentile3y` **恒为 null** → 估值评分基于 PE 绝对值（PE≤15→高分…），不用历史分位
- `profitability` 的 `num()` 把 0 当 null（ROE=0 被当缺失）→ scorer 用自己的 `num0()` 接受 0
- `tech_indicators` 只有 `{ma5,ma10,ma20,macdHist}`，**无 rsi/kdj** → 技术评分基于均线排列 + MACD 柱
- `capital_flow` 真实字段是 `{mainNetInflow5d, mainNetInflow10d, sampleCount}`

---

## File Structure

**新增:**
- `src/stocks/diagnosis-scorer.js` — 纯函数 5 维评分（参照 moat-score.js 机制）
- `tests/stocks/diagnosis-scorer.test.js` — scorer 单测
- `src/renderer/stocks/diagnosisStore.js` — 诊断页 state（diagnosisCode signal + 拉数据 + 算分 + AI 解读 action）
- `src/renderer/stocks/StockDiagnosisPage.jsx` — 全屏诊断页容器
- `src/renderer/stocks/diagnosis/StockDiagnosisHeader.jsx` — 返回 + hero + 评级徽标
- `src/renderer/stocks/diagnosis/StockMiniList.jsx` — 左侧筛选结果迷你列表
- `src/renderer/stocks/diagnosis/VerdictCard.jsx` — 综合评级大卡 + 一句话结论
- `src/renderer/stocks/diagnosis/DimensionScores.jsx` — 5 维评分条
- `src/renderer/stocks/diagnosis/ModuleGrid.jsx` — 6 个模块卡网格（含子卡）
- `tests/renderer/stocks/StockDiagnosisPage.test.jsx` — 诊断页渲染/加载/错误态单测

**修改:**
- `src/ai/prompt-registry.js` — stock_detail_analyze 加 scores 上下文 + 改指令为"解说员"
- `src/ai/stock-detail-advisor.js` — buildAnalyzeMessages 接收并注入 scores
- `src/renderer/stocks/StockLayout.jsx` — 加子路由分支（null→表格 / 有值→诊断页）
- `src/renderer/stocks/ResultTable.jsx` — 每行加「诊断」按钮 + COLUMNS 加操作列
- `src/ai/prompt-registry.js` fewShot 同步加 scores 输入示例

**删除（旧版，Task 10）:**
- `src/renderer/stocks/StockDetailDrawer.jsx`（637 行）
- `src/renderer/stocks/stockDetailStore.js`（旧抽屉 state）
- `tests/renderer/stocks/StockDetailDrawer.test.jsx`（312 行）
- StockLayout 里 `<StockDetailDrawer/>` 调用 + 顶栏「AI 个股」按钮
- `stock-results-pad-drawer` 让位逻辑
- 41 条 stock-* 死 CSS（按 dead-candidate-report 核对）

---

## Task 1: diagnosis-scorer.js — 纯函数 5 维评分

**Files:**
- Create: `src/stocks/diagnosis-scorer.js`
- Test: `tests/stocks/diagnosis-scorer.test.js`

**数据契约（perAngleData 的每个 angle 是 `{status:"ok"|"failed", data?}`）:**
- `profitability.data`: `{roe, grossMargin, netMargin, reportDate}`（roe/gross/netMargin 可能 null）
- `valuation.data`: `{pe, pb, pePercentile3y:null}`
- `capital_flow.data`: `{mainNetInflow5d, mainNetInflow10d, sampleCount}`
- `tech_indicators.data`: `{ma5, ma10, ma20, macdHist}`
- `news_buzz.data`: `{...}`（含情感倾向，需确认字段，见 Step 1）
- `price_trend.data`: `{closes?, klines?, lastQuote?}`

- [ ] **Step 1: 确认 news_buzz 数据结构**

Run: `grep -nA3 "return {" src/stocks/detail-fetchers/news-buzz.js | head -20`
（scorer 的"风险"维度要用 news_buzz 的情感字段，需确认实际字段名，如 `sentiment`/`buzz`/`negativeCount`。若字段不符，本任务 Step 4 的风险评分规则以实际为准微调。）

- [ ] **Step 2: 写失败测试 — 基本面评分（ROE）**

```js
// tests/stocks/diagnosis-scorer.test.js
import { describe, it, expect } from "vitest";
import { computeScores } from "../../src/stocks/diagnosis-scorer.js";

describe("diagnosis-scorer", () => {
  describe("基本面 fundamental (基于 ROE)", () => {
    it("ROE>=20 → 8 分", () => {
      const data = { profitability: { status: "ok", data: { roe: 24, grossMargin: 30, netMargin: 12 } } };
      const s = computeScores(data);
      expect(s.dimensions.fundamental).toBe(8);
    });
    it("ROE 15-20 → 6 分", () => {
      const data = { profitability: { status: "ok", data: { roe: 17, grossMargin: 25, netMargin: 10 } } };
      expect(computeScores(data).dimensions.fundamental).toBe(6);
    });
    it("ROE 缺失 (null) → null", () => {
      const data = { profitability: { status: "ok", data: { roe: null } } };
      expect(computeScores(data).dimensions.fundamental).toBeNull();
    });
    it("profitability 整个 angle 失败 → null", () => {
      const data = { profitability: { status: "failed" } };
      expect(computeScores(data).dimensions.fundamental).toBeNull();
    });
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/stocks/diagnosis-scorer.test.js`
Expected: FAIL — `Cannot find module '../../src/stocks/diagnosis-scorer.js'`

- [ ] **Step 4: 实现 scorer — 辅助函数 + 基本面维度**

```js
// src/stocks/diagnosis-scorer.js
/**
 * 个股诊断 5 维评分 — 纯函数, 确定性 (同输入同输出).
 * 参照 moat-score.js 的硬编码阈值机制. 评分 0-10, 数据缺失返回 null.
 * Spec: docs/superpowers/specs/2026-07-04-stock-diagnosis-redesign-design.md §4
 */

// num: 接受 0 (区别于 profitability fetcher 把 0 当 null 的行为)
function num0(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && isFinite(n) ? n : null;
}

function angleData(perAngleData, key) {
  const e = perAngleData && perAngleData[key];
  return e && e.status === "ok" ? (e.data || {}) : null;
}

// ── 基本面 ──
function scoreFundamental(data) {
  const prof = angleData(data, "profitability");
  if (!prof) return null;
  const roe = num0(prof.roe);
  if (roe === null) return null;
  if (roe >= 20) return 8;
  if (roe >= 15) return 6;
  if (roe >= 10) return 4;
  return 2;
}

// 占位, 后续 Step 补全
function scoreValuation(data) { return null; }
function scoreCapital(data) { return null; }
function scoreTech(data) { return null; }
function scoreRisk(data) { return null; }

const DIMENSIONS = [
  ["fundamental", scoreFundamental, 0.25],
  ["valuation", scoreValuation, 0.20],
  ["capital", scoreCapital, 0.15],
  ["tech", scoreTech, 0.15],
  ["risk", scoreRisk, 0.25],
];

export function computeScores(perAngleData) {
  const dimensions = {};
  const rationale = [];
  for (const [key, fn] of DIMENSIONS) {
    dimensions[key] = fn(perAngleData);
  }
  // overall: 非 null 维度按权重加权平均 (权重在缺维度的剩余维度间按比例重分配)
  const present = DIMENSIONS.filter(([, , w], i) => dimensions[DIMENSIONS[i][0]] !== null);
  let overall = null;
  if (present.length > 0) {
    const wsum = present.reduce((s, d) => s + d[2], 0);
    overall = present.reduce((s, [k, , w]) => s + dimensions[k] * (w / wsum), 0);
    overall = Math.round(overall * 10) / 10;
  }
  return { overall, dimensions, rationale };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/stocks/diagnosis-scorer.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: 写估值维度测试**

追加到 `tests/stocks/diagnosis-scorer.test.js` 的 describe 块内：

```js
  describe("估值 valuation (基于 PE 绝对值, pePercentile3y 恒 null 不可用)", () => {
    it("PE<=15 → 8", () => {
      const data = { valuation: { status: "ok", data: { pe: 12, pb: 1.5, pePercentile3y: null } } };
      expect(computeScores(data).dimensions.valuation).toBe(8);
    });
    it("PE 15-25 → 6", () => {
      const data = { valuation: { status: "ok", data: { pe: 20 } } };
      expect(computeScores(data).dimensions.valuation).toBe(6);
    });
    it("PE 40-60 → 3", () => {
      const data = { valuation: { status: "ok", data: { pe: 50 } } };
      expect(computeScores(data).dimensions.valuation).toBe(3);
    });
    it("PE>80 → 2", () => {
      const data = { valuation: { status: "ok", data: { pe: 100 } } };
      expect(computeScores(data).dimensions.valuation).toBe(2);
    });
    it("PE null (亏损) → null", () => {
      const data = { valuation: { status: "ok", data: { pe: null } } };
      expect(computeScores(data).dimensions.valuation).toBeNull();
    });
  });
```

- [ ] **Step 7: 实现估值维度 + 运行测试**

替换 `scoreValuation`：
```js
function scoreValuation(data) {
  const v = angleData(data, "valuation");
  if (!v) return null;
  const pe = num0(v.pe);
  if (pe === null || pe <= 0) return null; // 亏损/缺 EPS
  if (pe <= 15) return 8;
  if (pe <= 25) return 6;
  if (pe <= 40) return 4;
  if (pe <= 60) return 3;
  return 2;
}
```
Run: `npx vitest run tests/stocks/diagnosis-scorer.test.js` → PASS

- [ ] **Step 8: 写资金维度测试 + 实现**

测试：
```js
  describe("资金 capital (基于 5 日主力净流入)", () => {
    it("正流入 → 6-8", () => {
      const data = { capital_flow: { status: "ok", data: { mainNetInflow5d: 5e8, mainNetInflow10d: 8e8, sampleCount: 5 } } };
      const s = computeScores(data).dimensions.capital;
      expect(s).toBeGreaterThanOrEqual(6);
      expect(s).toBeLessThanOrEqual(8);
    });
    it("流出 → 2-4", () => {
      const data = { capital_flow: { status: "ok", data: { mainNetInflow5d: -3e8, mainNetInflow10d: -5e8, sampleCount: 5 } } };
      const s = computeScores(data).dimensions.capital;
      expect(s).toBeGreaterThanOrEqual(2);
      expect(s).toBeLessThanOrEqual(4);
    });
    it("sampleCount=0 (新股) → null", () => {
      const data = { capital_flow: { status: "ok", data: { mainNetInflow5d: 0, mainNetInflow10d: 0, sampleCount: 0 } } };
      expect(computeScores(data).dimensions.capital).toBeNull();
    });
  });
```
实现：
```js
function scoreCapital(data) {
  const c = angleData(data, "capital_flow");
  if (!c || !c.sampleCount) return null;
  const inflow = num0(c.mainNetInflow5d);
  if (inflow === null) return null;
  if (inflow > 0) {
    // 流入: 大于 5 亿 → 8, 1-5 亿 → 7, 小额 → 6
    if (inflow > 5e8) return 8;
    if (inflow > 1e8) return 7;
    return 6;
  }
  // 流出: 小于 -5 亿 → 2, -1 到 -5 亿 → 3, 小额 → 4
  if (inflow < -5e8) return 2;
  if (inflow < -1e8) return 3;
  return 4;
}
```
Run: `npx vitest run tests/stocks/diagnosis-scorer.test.js` → PASS

- [ ] **Step 9: 写技术维度测试 + 实现**

测试：
```js
  describe("技术 tech (均线排列 + MACD 柱)", () => {
    const closes = (n) => Array.from({ length: 30 }, (_, i) => 10 + i * n); // 上升趋势
    it("多头排列(价>ma5>ma20) + MACD>0 → 8", () => {
      const up = closes(0.5);
      const data = { tech_indicators: { status: "ok", data: {
        ma5: up[29] - 2, ma10: up[29] - 5, ma20: up[29] - 10, macdHist: 0.3,
      } } };
      expect(computeScores(data).dimensions.tech).toBe(8);
    });
    it("MACD 死叉 (hist<0) → 3", () => {
      const data = { tech_indicators: { status: "ok", data: { ma5: 15, ma10: 14, ma20: 13, macdHist: -0.2 } } };
      expect(computeScores(data).dimensions.tech).toBe(3);
    });
    it("macdHist=0 (数据不足) → null", () => {
      const data = { tech_indicators: { status: "ok", data: { ma5: 0, ma10: 0, ma20: 0, macdHist: 0 } } };
      expect(computeScores(data).dimensions.tech).toBeNull();
    });
  });
```
实现：
```js
function scoreTech(data) {
  const t = angleData(data, "tech_indicators");
  if (!t) return null;
  const macdHist = num0(t.macdHist);
  const ma5 = num0(t.ma5);
  const ma20 = num0(t.ma20);
  // fetcher 的 ma() 长度不足返 0, 用 ma20===0 判数据不足
  if (macdHist === null || !ma20) return null;
  const bullishAlign = ma5 && ma20 && ma5 > ma20;
  if (macdHist > 0 && bullishAlign) return 8;
  if (macdHist > 0) return 6;
  if (macdHist < 0) return 3;
  return 5;
}
```
Run: `npx vitest run tests/stocks/diagnosis-scorer.test.js` → PASS

- [ ] **Step 10: 写风险维度测试 + 实现**

（风险维度先基于 valuation 高估值 + news_buzz 情感，若 Step 1 确认 news_buzz 字段不同，按实际调整）

测试：
```js
  describe("风险 risk (反向分: 越高=越安全)", () => {
    it("低 PE + 无负面 → 高分(安全)", () => {
      const data = {
        valuation: { status: "ok", data: { pe: 12 } },
        news_buzz: { status: "ok", data: { sentiment: "positive", count: 5 } },
      };
      expect(computeScores(data).dimensions.risk).toBeGreaterThanOrEqual(7);
    });
    it("极高 PE → 低分(危险)", () => {
      const data = { valuation: { status: "ok", data: { pe: 120 } } };
      expect(computeScores(data).dimensions.risk).toBeLessThanOrEqual(4);
    });
    it("估值+舆情都缺 → null", () => {
      expect(computeScores({}).dimensions.risk).toBeNull();
    });
  });
```
实现（先简化版，基于估值安全度；news_buzz 情感有则微调，无则只用估值）：
```js
function scoreRisk(data) {
  const v = angleData(data, "valuation");
  if (!v) return null;
  const pe = num0(v.pe);
  if (pe === null || pe <= 0) return null;
  // 估值越低越安全 (反向): PE<=15→8, <=25→7, <=40→6, <=60→5, <=80→4, >80→2
  let base;
  if (pe <= 15) base = 8;
  else if (pe <= 25) base = 7;
  else if (pe <= 40) base = 6;
  else if (pe <= 60) base = 5;
  else if (pe <= 80) base = 4;
  else base = 2;
  // news_buzz 情感微调 (若 Step 1 确认有 sentiment 字段)
  const news = angleData(data, "news_buzz");
  if (news && news.sentiment === "negative") base = Math.max(2, base - 1);
  if (news && news.sentiment === "positive") base = Math.min(8, base + 1);
  return base;
}
```
Run: `npx vitest run tests/stocks/diagnosis-scorer.test.js` → PASS

- [ ] **Step 11: 写 overall 加权测试**

```js
  describe("overall 加权", () => {
    it("全部维度齐全 → 加权平均", () => {
      const data = {
        profitability: { status: "ok", data: { roe: 24 } },     // fundamental=8
        valuation: { status: "ok", data: { pe: 12 } },          // valuation=8, risk≈9(PE12+)
        capital_flow: { status: "ok", data: { mainNetInflow5d: 5e8, sampleCount: 5 } }, // capital=8
        tech_indicators: { status: "ok", data: { ma5: 11, ma20: 10, macdHist: 0.3 } },  // tech=8
      };
      const s = computeScores(data);
      expect(s.overall).toBeGreaterThan(7);
      expect(s.overall).toBeLessThanOrEqual(10);
    });
    it("全部缺失 → overall null", () => {
      expect(computeScores({}).overall).toBeNull();
    });
    it("部分缺失 → 仅用现存维度重分配权重", () => {
      const data = { profitability: { status: "ok", data: { roe: 24 } } }; // 只 fundamental=8
      const s = computeScores(data);
      expect(s.overall).toBe(8); // 单维度, 权重重分配后 = 该维度分
    });
  });
```
Run: `npx vitest run tests/stocks/diagnosis-scorer.test.js` → PASS（所有维度测试）

- [ ] **Step 12: 补 rationale（规则自带依据，供 AI 引用）**

在 computeScores 里，每个维度算分时 push 一条依据到 rationale。修改各 score 函数返回 `{score, reason}` 或在 computeScores 拼。简化做法：在 computeScores 末尾按 dimensions 拼：

```js
  // 在 computeScores return 前:
  if (dimensions.valuation !== null) {
    const pe = num0(angleData(perAngleData, "valuation")?.pe);
    if (pe !== null) rationale.push(`PE ${pe}，估值${pe <= 25 ? "合理" : pe <= 60 ? "偏高" : "过高"}`);
  }
  if (dimensions.fundamental !== null) {
    const roe = num0(angleData(perAngleData, "profitability")?.roe);
    if (roe !== null) rationale.push(`ROE ${roe}%，${roe >= 15 ? "盈利能力强" : "盈利一般"}`);
  }
```

补 rationale 测试：
```js
    it("rationale 含具体依据", () => {
      const data = { valuation: { status: "ok", data: { pe: 20 } }, profitability: { status: "ok", data: { roe: 18 } } };
      const r = computeScores(data).rationale;
      expect(r.some((x) => x.includes("PE"))).toBe(true);
      expect(r.some((x) => x.includes("ROE"))).toBe(true);
    });
```
Run: `npx vitest run tests/stocks/diagnosis-scorer.test.js` → PASS

- [ ] **Step 13: 导出 + 提交**

确认 `src/stocks/diagnosis-scorer.js` 末尾：`export { computeScores };`
```bash
git add src/stocks/diagnosis-scorer.js tests/stocks/diagnosis-scorer.test.js
git commit -m "feat(stock): diagnosis-scorer 5 维确定性评分 (基本面/估值/资金/技术/风险)"
```

---

## Task 2: AI 解读改造 — 注入 scores，角色转"解说员"

**Files:**
- Modify: `src/ai/prompt-registry.js`（stock_detail_analyze system/rules/fewShot）
- Modify: `src/ai/stock-detail-advisor.js`（buildAnalyzeMessages 接收 scores）
- Test: `tests/ai/stock-detail-advisor.test.js`（已存在，加 scores 用例）

- [ ] **Step 1: 读现有 advisor 测试范式**

Run: `cat tests/ai/stock-detail-advisor.test.js | head -50`
（确认现有测试怎么 mock chatCompletion、怎么调 aiStockDetailAnalyze、断言结构）

- [ ] **Step 2: 写失败测试 — scores 注入 prompt**

追加到 `tests/ai/stock-detail-advisor.test.js`：
```js
import { buildAnalyzeMessages } from "../../src/ai/stock-detail-advisor.js";

describe("buildAnalyzeMessages scores 注入", () => {
  it("user 段含 scores 维度分 + rationale", () => {
    const messages = buildAnalyzeMessages({
      code: "300750",
      angles: ["profitability", "valuation"],
      perAngleData: {
        profitability: { status: "ok", data: { roe: 24 } },
        valuation: { status: "ok", data: { pe: 20 } },
      },
      scores: {
        overall: 7.5,
        dimensions: { fundamental: 8, valuation: 6, capital: null, tech: null, risk: 7 },
        rationale: ["PE 20，估值合理", "ROE 24%，盈利能力强"],
      },
    });
    const userText = messages[1].content;
    expect(userText).toContain("综合评级");
    expect(userText).toContain("7.5");
    expect(userText).toContain("PE 20");
  });
  it("scores 缺失时不崩 (向后兼容)", () => {
    const messages = buildAnalyzeMessages({ code: "300750", angles: [], perAngleData: {} });
    expect(messages[1].content).toContain("300750");
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/ai/stock-detail-advisor.test.js`
Expected: FAIL — buildAnalyzeMessages 不接收 scores（或 user 段不含 "综合评级"）

- [ ] **Step 4: 改 buildAnalyzeMessages 接收 scores**

修改 `src/ai/stock-detail-advisor.js` 的 buildAnalyzeMessages（行 44-80），签名加 `scores`，在 user 段开头插入 scores 块：

```js
export function buildAnalyzeMessages({ code, angles, perAngleData, freeText, scores } = {}) {
  const def = resolvePrompt(PROMPT_KEY);
  const system = [def.system, def.rules, def.fewShot].filter(Boolean).join("\n\n");
  const lines = [];
  lines.push(`股票: ${code}`);
  // ── scores 块 (规则评分, AI 只解读不打分) ──
  if (scores && typeof scores === "object") {
    const dim = scores.dimensions || {};
    const dimText = ["fundamental:基本面","valuation:估值","capital:资金","tech:技术","risk:风险"]
      .map(([k,l]) => `${l}=${dim[k] === null ? "数据不足" : dim[k]}`)
      .join("，");
    lines.push(`综合评级: ${scores.overall ?? "数据不足"}/10 (${dimText})`);
    if (Array.isArray(scores.rationale) && scores.rationale.length) {
      lines.push(`评分依据: ${scores.rationale.join("；")}`);
    }
    lines.push(`【重要】以上评级由规则给出, 你的任务是基于此评分写解读, 不要重新打分.`);
  }
  // ── 各角度数据 (原逻辑不变) ──
  for (const k of angles || []) {
    const ang = ANGLES_BY_KEY[k];
    const entry = (perAngleData || {})[k];
    if (!ang) continue;
    let body;
    if (entry && entry.status === "ok" && entry.data) {
      body = ang.summarizeForAi ? ang.summarizeForAi(entry.data) : JSON.stringify(entry.data);
    } else {
      body = "数据缺失";
    }
    lines.push(`- ${ang.label} (${k}): ${body}`);
  }
  if (freeText) lines.push(`补充说明: ${freeText}`);
  return [{ role: "system", content: system }, { role: "user", content: lines.join("\n") }];
}
```
（保留原有 ANGLES_BY_KEY 引用逻辑，仅在其前插入 scores 块。）

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/ai/stock-detail-advisor.test.js` → PASS

- [ ] **Step 6: 改 prompt 指令为"解说员"**

修改 `src/ai/prompt-registry.js` 的 stock_detail_analyze（行 122-158）：
- system 加一句：`若输入含"综合评级"，该评级由规则给出，你必须基于此评分撰写解读，不得重新打分或质疑评分。`
- rules 加一条：`6. 若输入含"综合评级 X/10"，summary 必须解释为什么是 X 分 (引用评分依据)，不要输出自己的评分。`
- fewShot 示例的输入加 scores 行（示例 1 输入加 "综合评级: 6.5/10 (基本面=8，估值=6...)"）

具体改 system（行 123-127 末尾追加）：
```
若输入含"综合评级"，该评级由规则客观给出，你必须基于此评分撰写解读，不得重新打分或质疑评分。你的角色是解说员，不是评判者。
```
rules 追加第 6 条（行 135 后）：
```
6. 若输入含"综合评级 X/10"，summary 必须解释为何是这个分（引用"评分依据"），不要输出自己的评分。
```

- [ ] **Step 7: 运行全部 advisor 测试确认无回归**

Run: `npx vitest run tests/ai/stock-detail-advisor.test.js` → PASS

- [ ] **Step 8: 提交**

```bash
git add src/ai/stock-detail-advisor.js src/ai/prompt-registry.js tests/ai/stock-detail-advisor.test.js
git commit -m "feat(stock): AI 解读改造 — 注入规则 scores, 角色转解说员(不打分只解读)"
```

---

## Task 3: diagnosisStore.js — 诊断页 state + 数据流

**Files:**
- Create: `src/renderer/stocks/diagnosisStore.js`
- Test: `tests/renderer/stocks/diagnosisStore.test.js`

- [ ] **Step 1: 写失败测试 — 子路由 signal + 自动拉数据**

```js
// tests/renderer/stocks/diagnosisStore.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { signal } from "@preact/signals";
import { stockDiagnosisCode, openDiagnosis, closeDiagnosis, diagnosisState } from "../../../src/renderer/stocks/diagnosisStore.js";

describe("diagnosisStore", () => {
  beforeEach(() => { closeDiagnosis(); });

  it("stockDiagnosisCode 默认 null (显示选股表格)", () => {
    expect(stockDiagnosisCode.value).toBeNull();
  });
  it("openDiagnosis(code) 设 code", () => {
    openDiagnosis("300750");
    expect(stockDiagnosisCode.value).toBe("300750");
  });
  it("closeDiagnosis 清回 null", () => {
    openDiagnosis("300750");
    closeDiagnosis();
    expect(stockDiagnosisCode.value).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/renderer/stocks/diagnosisStore.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 diagnosisStore 基础 signal**

```js
// src/renderer/stocks/diagnosisStore.js
/**
 * 个股诊断报告页 state. Spec: 2026-07-04-stock-diagnosis-redesign-design.md
 * stockDiagnosisCode = null → 选股表格; 有值 → 全屏诊断页.
 */
import { signal, computed } from "@preact/signals";
import { computeScores } from "../../stocks/diagnosis-scorer.js";

export const stockDiagnosisCode = signal(null);

// 诊断页数据状态: { status: "idle"|"loading"|"ready"|"error", perAngleData, scores, aiResult, error }
export const diagnosisState = signal({ status: "idle", perAngleData: {}, scores: null, aiResult: null, error: null });

export function openDiagnosis(code) {
  stockDiagnosisCode.value = code;
}

export function closeDiagnosis() {
  stockDiagnosisCode.value = null;
  diagnosisState.value = { status: "idle", perAngleData: {}, scores: null, aiResult: null, error: null };
}

// 拉数据 + 算分 + AI 解读 (进页自动调用)
export async function loadDiagnosis(api, code) {
  diagnosisState.value = { ...diagnosisState.value, status: "loading", error: null };
  try {
    const ALL_ANGLES = ["price_trend","volume_turnover","valuation","profitability","capital_flow","tech_indicators","news_buzz","peer_compare","moat_score"];
    const resp = await api.stocksDetailAngles({ code, angles: ALL_ANGLES });
    if (!resp || !resp.ok) throw new Error(resp?.reason || "fetch_failed");
    const perAngleData = resp.data || {};
    const scores = computeScores(perAngleData);
    diagnosisState.value = { status: "ready", perAngleData, scores, aiResult: null, error: null };
    // AI 解读 (后台, 不阻塞数据展示)
    try {
      const aiResp = await api.stocksDetailAnalyze({ code, perAngleData, scores });
      if (aiResp && aiResp.ok) {
        diagnosisState.value = { ...diagnosisState.value, aiResult: aiResp.result };
      }
    } catch (aiErr) {
      // AI 失败不影响数据展示, 仅记 error
      diagnosisState.value = { ...diagnosisState.value, aiResult: null, error: "ai_failed" };
    }
  } catch (e) {
    diagnosisState.value = { status: "error", perAngleData: {}, scores: null, aiResult: null, error: e.message };
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/renderer/stocks/diagnosisStore.test.js` → PASS

- [ ] **Step 5: 写 loadDiagnosis 测试（mock api）**

```js
import { loadDiagnosis } from "../../../src/renderer/stocks/diagnosisStore.js";

describe("loadDiagnosis", () => {
  beforeEach(() => { closeDiagnosis(); });

  it("成功: 拉 angles → 算分 → (后台) AI", async () => {
    const api = {
      stocksDetailAngles: vi.fn().mockResolvedValue({ ok: true, data: {
        profitability: { status: "ok", data: { roe: 24 } },
        valuation: { status: "ok", data: { pe: 12 } },
      }}),
      stocksDetailAnalyze: vi.fn().mockResolvedValue({ ok: true, result: { summary: "测试", signal: "neutral" }}),
    };
    await loadDiagnosis(api, "300750");
    expect(diagnosisState.value.status).toBe("ready");
    expect(diagnosisState.value.scores.overall).toBeGreaterThan(0);
    expect(diagnosisState.value.aiResult.summary).toBe("测试");
  });
  it("angles 失败 → status error", async () => {
    const api = { stocksDetailAngles: vi.fn().mockResolvedValue({ ok: false, reason: "fetch_failed" }) };
    await loadDiagnosis(api, "300750");
    expect(diagnosisState.value.status).toBe("error");
  });
  it("AI 失败 → 数据仍 ready, error=ai_failed", async () => {
    const api = {
      stocksDetailAngles: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      stocksDetailAnalyze: vi.fn().mockRejectedValue(new Error("ai")),
    };
    await loadDiagnosis(api, "300750");
    expect(diagnosisState.value.status).toBe("ready");
    expect(diagnosisState.value.error).toBe("ai_failed");
  });
});
```
Run: `npx vitest run tests/renderer/stocks/diagnosisStore.test.js` → PASS

- [ ] **Step 6: 提交**

```bash
git add src/renderer/stocks/diagnosisStore.js tests/renderer/stocks/diagnosisStore.test.js
git commit -m "feat(stock): diagnosisStore — 子路由 signal + 进页自动拉数据/算分/AI解读"
```

---

## Task 4: ResultTable 加「诊断」按钮

**Files:**
- Modify: `src/renderer/stocks/ResultTable.jsx`（COLUMNS + 行渲染）
- Modify: `src/renderer/stocks/ResultTable.jsx` 测试（若有）或新增

- [ ] **Step 1: 写失败测试 — 行内有诊断按钮**

```js
// tests/renderer/stocks/ResultTable.test.jsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";
import { ResultTable } from "../../../src/renderer/stocks/ResultTable.jsx";
import { results } from "../../../src/renderer/stocks/stockStore.js";
import { stockDiagnosisCode } from "../../../src/renderer/stocks/diagnosisStore.js";

vi.mock("../../../src/renderer/api.js", () => ({ api: {} }));
afterEach(() => { cleanup(); results.value = []; stockDiagnosisCode.value = null; });

describe("ResultTable 诊断按钮", () => {
  it("每行末尾有「诊断」按钮", () => {
    results.value = [{ code: "300750", name: "宁德时代", price: 218, changePct: 2.3, pe: 28, roe: 24, industry: "电池" }];
    const { container } = render(<ResultTable api={{}} />);
    const btn = container.querySelector('[data-testid="diagnosis-btn"]');
    expect(btn).toBeTruthy();
  });
  it("点击诊断按钮 → stockDiagnosisCode 设为该 code", () => {
    results.value = [{ code: "300750", name: "宁德时代", price: 218 }];
    const { container } = render(<ResultTable api={{}} />);
    fireEvent.click(container.querySelector('[data-testid="diagnosis-btn"]'));
    expect(stockDiagnosisCode.value).toBe("300750");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/renderer/stocks/ResultTable.test.jsx`
Expected: FAIL — 无 diagnosis-btn

- [ ] **Step 3: COLUMNS 加操作列 + 行渲染加按钮**

修改 `src/renderer/stocks/ResultTable.jsx`：

COLUMNS（行 18-25）末尾加：
```js
  { key: "actions", label: "", align: "right" },
```

行渲染（行 93-121 的循环内，最后一个 `<span class="stock-td">` 后）加操作 cell。先在文件顶部 import：
```js
import { openDiagnosis } from "./diagnosisStore.js";
```
然后在每行末尾（`industry` cell 之后）加：
```jsx
<span class="stock-td stock-th-right">
  <button
    type="button"
    class="btn btn-ghost btn-sm"
    data-testid="diagnosis-btn"
    onClick={() => openDiagnosis(r.code)}
  >
    诊断
  </button>
</span>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/renderer/stocks/ResultTable.test.jsx` → PASS

- [ ] **Step 5: 确认 grid-template-columns 容纳新列**

Run: `grep -n "stock-table-head.*grid-template" styles.css`
当前是 `1.4fr 0.8fr 0.7fr 0.6fr 0.6fr 1fr 36px`（6 列数据 + 36px? 实际是 6 列）。需确认加第 7 列后对齐。修改 styles.css 的 `.stock-table-head, .stock-table-row`（约 10285 行）grid-template-columns 末尾加 `64px`（操作列宽度）。若已无 36px 尾列则直接加。

- [ ] **Step 6: 提交**

```bash
git add src/renderer/stocks/ResultTable.jsx tests/renderer/stocks/ResultTable.test.jsx styles.css
git commit -m "feat(stock): ResultTable 行内加「诊断」按钮 → openDiagnosis(code)"
```

---

## Task 5: StockDiagnosisPage 容器 + Header + 子路由接入

**Files:**
- Create: `src/renderer/stocks/diagnosis/StockDiagnosisHeader.jsx`
- Create: `src/renderer/stocks/StockDiagnosisPage.jsx`
- Modify: `src/renderer/stocks/StockLayout.jsx`（子路由分支）

- [ ] **Step 1: 写 StockDiagnosisPage 测试**

```js
// tests/renderer/stocks/StockDiagnosisPage.test.jsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/preact";
import { StockDiagnosisPage } from "../../../src/renderer/stocks/StockDiagnosisPage.jsx";
import { stockDiagnosisCode, diagnosisState, closeDiagnosis } from "../../../src/renderer/stocks/diagnosisStore.js";
import { results } from "../../../src/renderer/stocks/stockStore.js";

afterEach(() => { cleanup(); closeDiagnosis(); results.value = []; });

describe("StockDiagnosisPage", () => {
  it("渲染返回按钮 + 股票 hero (从 results 找股票名)", () => {
    stockDiagnosisCode.value = "300750";
    results.value = [{ code: "300750", name: "宁德时代", price: 218, changePct: 2.3 }];
    diagnosisState.value = { status: "ready", perAngleData: {}, scores: { overall: 6.5, dimensions: {}, rationale: [] }, aiResult: { summary: "测试" }, error: null };
    const { container } = render(<StockDiagnosisPage api={{}} />);
    expect(container.textContent).toContain("宁德时代");
    expect(container.querySelector('[data-testid="diagnosis-back"]')).toBeTruthy();
  });
  it("loading 态显示加载指示", () => {
    stockDiagnosisCode.value = "300750";
    diagnosisState.value = { status: "loading", perAngleData: {}, scores: null, aiResult: null, error: null };
    const { container } = render(<StockDiagnosisPage api={{}} />);
    expect(container.textContent).toMatch(/加载|生成/i);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/renderer/stocks/StockDiagnosisPage.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 StockDiagnosisHeader**

```jsx
// src/renderer/stocks/diagnosis/StockDiagnosisHeader.jsx
import { closeDiagnosis } from "../diagnosisStore.js";

export function StockDiagnosisHeader({ stock, scores }) {
  return (
    <header class="diagnosis-header">
      <button type="button" class="diagnosis-back" data-testid="diagnosis-back" onClick={closeDiagnosis}>
        ← 返回选股
      </button>
      <div class="diagnosis-hero">
        <span class="diagnosis-hero-name">{stock?.name || stock?.code}</span>
        <span class="diagnosis-hero-code">{stock?.code}</span>
        {stock?.price != null && (
          <span class={`diagnosis-hero-price ${stock.changePct >= 0 ? "up" : "down"}`}>
            ¥{stock.price} {stock.changePct >= 0 ? "+" : ""}{stock.changePct}%
          </span>
        )}
      </div>
      {scores?.overall != null && (
        <span class="diagnosis-rating-badge">{scores.overall}/10</span>
      )}
    </header>
  );
}
```

- [ ] **Step 4: 实现 StockDiagnosisPage**

```jsx
// src/renderer/stocks/StockDiagnosisPage.jsx
import { useEffect } from "preact/hooks";
import { stockDiagnosisCode, diagnosisState, loadDiagnosis } from "./diagnosisStore.js";
import { results } from "./stockStore.js";
import { StockDiagnosisHeader } from "./diagnosis/StockDiagnosisHeader.jsx";
import { StockMiniList } from "./diagnosis/StockMiniList.jsx";
import { VerdictCard } from "./diagnosis/VerdictCard.jsx";
import { DimensionScores } from "./diagnosis/DimensionScores.jsx";
import { ModuleGrid } from "./diagnosis/ModuleGrid.jsx";

export function StockDiagnosisPage({ api }) {
  const code = stockDiagnosisCode.value;
  const state = diagnosisState.value;
  const stock = results.value.find((r) => r.code === code) || { code };

  useEffect(() => {
    if (code) loadDiagnosis(api, code);
  }, [code]);

  return (
    <div class="stock-diagnosis-page">
      <StockDiagnosisHeader stock={stock} scores={state.scores} />
      <div class="stock-diagnosis-body">
        <StockMiniList currentCode={code} />
        <div class="stock-diagnosis-report">
          {state.status === "loading" && <div class="diagnosis-loading">正在生成诊断报告…</div>}
          {state.status === "error" && <div class="diagnosis-error">报告生成失败：{state.error} <button onClick={() => loadDiagnosis(api, code)}>重试</button></div>}
          {state.status === "ready" && (
            <>
              <VerdictCard scores={state.scores} aiResult={state.aiResult} />
              <DimensionScores scores={state.scores} />
              <ModuleGrid perAngleData={state.perAngleData} aiResult={state.aiResult} />
              <div class="diagnosis-disclaimer">AI 仅供参考，不构成投资建议</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/renderer/stocks/StockDiagnosisPage.test.jsx` → PASS（StockMiniList/VerdictCard/DimensionScores/ModuleGrid 此时是 stub，下一个 Task 实现）

先创建 4 个子组件的最小 stub（让 import 不报错）：
```jsx
// src/renderer/stocks/diagnosis/StockMiniList.jsx
export function StockMiniList({ currentCode }) { return <div class="stock-mini-list" data-testid="stock-mini-list" />; }
// src/renderer/stocks/diagnosis/VerdictCard.jsx
export function VerdictCard({ scores, aiResult }) { return <div class="verdict-card" />; }
// src/renderer/stocks/diagnosis/DimensionScores.jsx
export function DimensionScores({ scores }) { return <div class="dimension-scores" />; }
// src/renderer/stocks/diagnosis/ModuleGrid.jsx
export function ModuleGrid({ perAngleData, aiResult }) { return <div class="module-grid" />; }
```

- [ ] **Step 6: StockLayout 子路由接入**

修改 `src/renderer/stocks/StockLayout.jsx`：在 `<ResultTable />` 处加子路由分支。

文件顶部 import：
```js
import { stockDiagnosisCode } from "./diagnosisStore.js";
import { StockDiagnosisPage } from "./StockDiagnosisPage.jsx";
```
把 `<ResultTable api={api} />`（约行 77）改为：
```jsx
{stockDiagnosisCode.value
  ? <StockDiagnosisPage api={api} />
  : <>
      <StrategyBar />
      <CriteriaPanel />
      <ResultTable api={api} />
    </>}
```
（注意保留原有的 StrategyBar/CriteriaPanel，让它们只在选股表格态显示。）

- [ ] **Step 7: 提交**

```bash
git add src/renderer/stocks/StockDiagnosisPage.jsx src/renderer/stocks/diagnosis/ src/renderer/stocks/StockLayout.jsx tests/renderer/stocks/StockDiagnosisPage.test.jsx
git commit -m "feat(stock): StockDiagnosisPage 容器 + Header + StockLayout 子路由接入"
```

---

## Task 6: 子组件实现 — VerdictCard / DimensionScores / ModuleGrid / StockMiniList

**Files:**
- Implement: `src/renderer/stocks/diagnosis/VerdictCard.jsx`
- Implement: `src/renderer/stocks/diagnosis/DimensionScores.jsx`
- Implement: `src/renderer/stocks/diagnosis/ModuleGrid.jsx`
- Implement: `src/renderer/stocks/diagnosis/StockMiniList.jsx`

- [ ] **Step 1: 实现 VerdictCard（综合评级大卡 + AI 一句话）**

```jsx
// src/renderer/stocks/diagnosis/VerdictCard.jsx
const RATING_LABEL = (s) => s == null ? "数据不足" : s >= 7.5 ? "强烈" : s >= 6 ? "中性偏强" : s >= 4 ? "中性" : "偏弱";

export function VerdictCard({ scores, aiResult }) {
  const overall = scores?.overall;
  return (
    <div class="verdict-card">
      <div class="verdict-rating">
        <span class="verdict-score">{overall == null ? "—" : overall}<span class="verdict-max">/10</span></span>
        <div class="verdict-label-wrap">
          <span class="verdict-label">{RATING_LABEL(overall)}</span>
          <span class="verdict-sub">综合评级</span>
        </div>
      </div>
      <div class="verdict-summary">{aiResult?.summary || (overall == null ? "数据不足，无法生成评级" : "AI 解读生成中…")}</div>
    </div>
  );
}
```

- [ ] **Step 2: 实现 DimensionScores（5 维评分条）**

```jsx
// src/renderer/stocks/diagnosis/DimensionScores.jsx
const DIMS = [
  ["fundamental", "基本面"],
  ["valuation", "估值"],
  ["capital", "资金"],
  ["tech", "技术"],
  ["risk", "风险"],
];
const COLOR = (s) => s == null ? "#ddd" : s >= 7 ? "#34c759" : s >= 5 ? "#007aff" : s >= 3 ? "#ff9500" : "#ff3b30";

export function DimensionScores({ scores }) {
  const dims = scores?.dimensions || {};
  return (
    <div class="dimension-scores">
      {DIMS.map(([k, label]) => {
        const s = dims[k];
        return (
          <div class="dim" key={k}>
            <div class="dim-bar" style={{ width: `${(s ?? 0) * 10}%`, background: COLOR(s) }} />
            <div class="dim-label">{label}</div>
            <div class="dim-score">{s == null ? "—" : s}</div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: 实现 ModuleGrid（6 模块卡）**

```jsx
// src/renderer/stocks/diagnosis/ModuleGrid.jsx
import { FundamentalsCard } from "./FundamentalsCard.jsx";
import { ValuationCard } from "./ValuationCard.jsx";
import { CapitalFlowCard } from "./CapitalFlowCard.jsx";
import { TechCard } from "./TechCard.jsx";
import { NewsCard } from "./NewsCard.jsx";
import { RiskCard } from "./RiskCard.jsx";

export function ModuleGrid({ perAngleData, aiResult }) {
  const risks = aiResult?.risks || [];
  return (
    <div class="module-grid">
      <FundamentalsCard data={perAngleData.profitability} />
      <ValuationCard data={perAngleData.valuation} />
      <CapitalFlowCard data={perAngleData.capital_flow} />
      <TechCard data={perAngleData.tech_indicators} />
      <NewsCard data={perAngleData.news_buzz} />
      <RiskCard risks={risks} />
    </div>
  );
}
```
（6 个子卡 FundamentalsCard/ValuationCard/.../RiskCard 各自读对应 angle 的 data 字段渲染，每个 ~15 行，从 perAngleData[key].data 取字段。每个卡数据缺失时显示"数据不足"。）

创建 6 个子卡文件。先以 FundamentalsCard 为完整范例，其余 5 个按各自数据字段实现：

```jsx
// src/renderer/stocks/diagnosis/FundamentalsCard.jsx
export function FundamentalsCard({ data }) {
  const d = data?.status === "ok" ? data.data : null;
  return (
    <div class="module-card module-card--fundamentals">
      <div class="module-card-title">📊 基本面</div>
      {d ? (
        <div class="module-card-body">
          <div>ROE {d.roe ?? "—"}%</div>
          <div>毛利率 {d.grossMargin ?? "—"}%</div>
          <div>净利率 {d.netMargin ?? "—"}%</div>
        </div>
      ) : <div class="module-card-empty">数据不足</div>}
    </div>
  );
}
```

```jsx
// src/renderer/stocks/diagnosis/ValuationCard.jsx
export function ValuationCard({ data }) {
  const d = data?.status === "ok" ? data.data : null;
  return (
    <div class="module-card module-card--valuation">
      <div class="module-card-title">💰 估值</div>
      {d ? (
        <div class="module-card-body">
          <div>PE {d.pe ?? "—"}</div>
          <div>PB {d.pb ?? "—"}</div>
        </div>
      ) : <div class="module-card-empty">数据不足</div>}
    </div>
  );
}
```

```jsx
// src/renderer/stocks/diagnosis/CapitalFlowCard.jsx
export function CapitalFlowCard({ data }) {
  const d = data?.status === "ok" ? data.data : null;
  return (
    <div class="module-card module-card--capital">
      <div class="module-card-title">🌊 资金面</div>
      {d ? (
        <div class="module-card-body">
          <div>5日主力 {d.mainNetInflow5d != null ? (d.mainNetInflow5d / 1e8).toFixed(2) + "亿" : "—"}</div>
          <div>10日主力 {d.mainNetInflow10d != null ? (d.mainNetInflow10d / 1e8).toFixed(2) + "亿" : "—"}</div>
        </div>
      ) : <div class="module-card-empty">数据不足</div>}
    </div>
  );
}
```

```jsx
// src/renderer/stocks/diagnosis/TechCard.jsx
export function TechCard({ data }) {
  const d = data?.status === "ok" ? data.data : null;
  return (
    <div class="module-card module-card--tech">
      <div class="module-card-title">📈 技术面</div>
      {d ? (
        <div class="module-card-body">
          <div>MA5 {d.ma5?.toFixed(2) ?? "—"}</div>
          <div>MA20 {d.ma20?.toFixed(2) ?? "—"}</div>
          <div>MACD柱 {d.macdHist?.toFixed(3) ?? "—"}</div>
        </div>
      ) : <div class="module-card-empty">数据不足</div>}
    </div>
  );
}
```

```jsx
// src/renderer/stocks/diagnosis/NewsCard.jsx
// news_buzz 字段需以 Task 1 Step 1 确认的实际结构为准, 这里用常见字段
export function NewsCard({ data }) {
  const d = data?.status === "ok" ? data.data : null;
  return (
    <div class="module-card module-card--news">
      <div class="module-card-title">📰 舆情</div>
      {d ? (
        <div class="module-card-body">
          <div>本周 {d.count ?? d.total ?? "—"} 条</div>
          {d.sentiment && <div>情感倾向: {d.sentiment}</div>}
        </div>
      ) : <div class="module-card-empty">数据不足</div>}
    </div>
  );
}
```

```jsx
// src/renderer/stocks/diagnosis/RiskCard.jsx
export function RiskCard({ risks }) {
  const list = Array.isArray(risks) ? risks : [];
  return (
    <div class="module-card module-card--risk">
      <div class="module-card-title">⚠️ 风险提示</div>
      {list.length > 0 ? (
        <ul class="module-card-body module-card-risk-list">
          {list.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      ) : <div class="module-card-empty">暂无明显风险信号</div>}
    </div>
  );
}
```

ModuleGrid 的 import 需对应这 6 个文件名（FundamentalsCard/ValuationCard/CapitalFlowCard/TechCard/NewsCard/RiskCard）。

- [ ] **Step 4: 实现 StockMiniList（左侧筛选结果列表）**

```jsx
// src/renderer/stocks/diagnosis/StockMiniList.jsx
import { results } from "../stockStore.js";
import { stockDiagnosisCode, openDiagnosis } from "../diagnosisStore.js";

export function StockMiniList({ currentCode }) {
  const rows = results.value;
  return (
    <aside class="stock-mini-list" data-testid="stock-mini-list">
      <div class="stock-mini-list-head">筛选结果 {rows.length}</div>
      <div class="stock-mini-list-body">
        {rows.map((r) => (
          <button
            type="button"
            key={r.code}
            class={`stock-mini-item${r.code === currentCode ? " active" : ""}`}
            onClick={() => openDiagnosis(r.code)}
          >
            <span class="stock-mini-name">{r.name || r.code}</span>
            <span class={`stock-mini-price ${r.changePct >= 0 ? "up" : "down"}`}>{r.price} {r.changePct >= 0 ? "+" : ""}{r.changePct}%</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: 运行诊断页测试确认组件渲染**

Run: `npx vitest run tests/renderer/stocks/StockDiagnosisPage.test.jsx` → PASS

- [ ] **Step 6: 补 ModuleGrid 子卡测试（每个卡数据缺失态）**

```js
// tests/renderer/stocks/diagnosis/ModuleGrid.test.jsx
// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { ModuleGrid } from "../../../../src/renderer/stocks/diagnosis/ModuleGrid.jsx";

describe("ModuleGrid", () => {
  it("数据齐全渲染各模块", () => {
    const { container } = render(<ModuleGrid perAngleData={{
      profitability: { status: "ok", data: { roe: 24 } },
    }} aiResult={{ risks: ["汇率风险"] }} />);
    expect(container.textContent).toContain("ROE");
    expect(container.textContent).toContain("汇率风险");
  });
  it("angle 缺失显示「数据不足」", () => {
    const { container } = render(<ModuleGrid perAngleData={{}} aiResult={{}} />);
    expect(container.textContent).toContain("数据不足");
  });
});
```
Run: `npx vitest run tests/renderer/stocks/diagnosis/ModuleGrid.test.jsx` → PASS

- [ ] **Step 7: 提交**

```bash
git add src/renderer/stocks/diagnosis/ tests/renderer/stocks/diagnosis/
git commit -m "feat(stock): 诊断页子组件 — VerdictCard/DimensionScores/ModuleGrid/StockMiniList"
```

---

## Task 7: 诊断页样式

**Files:**
- Modify: `styles.css`（追加 .stock-diagnosis-* / .verdict-* / .dimension-* / .module-* / .stock-mini-* 块）

- [ ] **Step 1: 追加诊断页 CSS**

在 styles.css 末尾追加（参照 mockup 视觉，复用项目 token）：

```css
/* === 个股诊断报告页 (2026-07-04) === */
.stock-diagnosis-page { display: flex; flex-direction: column; height: 100%; background: var(--bg-secondary, #f5f5f7); }
.diagnosis-header { display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: var(--bg-modal, #fff); border-bottom: 1px solid var(--border, rgba(0,0,0,0.08)); flex-shrink: 0; }
.diagnosis-back { background: transparent; border: 0; color: var(--accent-primary, #007aff); cursor: pointer; font-size: 13px; }
.diagnosis-hero { display: flex; align-items: baseline; gap: 8px; }
.diagnosis-hero-name { font-size: 16px; font-weight: 600; }
.diagnosis-hero-code { font-size: 11px; color: var(--text-tertiary, #aeaeb2); }
.diagnosis-hero-price { font-size: 13px; font-weight: 600; }
.diagnosis-rating-badge { margin-left: auto; background: rgba(0,122,255,0.12); color: var(--accent-primary, #007aff); padding: 3px 12px; border-radius: 12px; font-size: 13px; font-weight: 600; }

.stock-diagnosis-body { display: flex; flex: 1; min-height: 0; }
.stock-mini-list { width: 240px; border-right: 1px solid var(--border, rgba(0,0,0,0.08)); background: var(--bg-modal, #fff); overflow-y: auto; flex-shrink: 0; }
.stock-mini-list-head { padding: 8px 12px; font-size: 11px; color: var(--text-tertiary); border-bottom: 1px solid var(--border-light); }
.stock-mini-item { display: flex; justify-content: space-between; width: 100%; padding: 8px 12px; background: transparent; border: 0; cursor: pointer; font-size: 12px; text-align: left; }
.stock-mini-item:hover { background: var(--bg-hover); }
.stock-mini-item.active { background: rgba(0,122,255,0.08); }
.stock-mini-price.up { color: #ff3b30; } .stock-mini-price.down { color: #34c759; }

.stock-diagnosis-report { flex: 1; overflow-y: auto; padding: 16px 20px; }
.diagnosis-loading, .diagnosis-error { padding: 40px; text-align: center; color: var(--text-secondary); }
.diagnosis-disclaimer { text-align: center; font-size: 10px; color: var(--text-tertiary); padding: 12px; }

.verdict-card { background: linear-gradient(135deg, rgba(0,122,255,0.06), #fff); border: 1px solid rgba(0,122,255,0.2); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
.verdict-rating { display: flex; align-items: center; gap: 12px; }
.verdict-score { font-size: 32px; font-weight: 700; color: var(--accent-primary); }
.verdict-max { font-size: 14px; color: var(--text-tertiary); }
.verdict-label { font-weight: 600; color: var(--accent-primary); }
.verdict-sub { font-size: 11px; color: var(--text-tertiary); }
.verdict-summary { margin-top: 8px; font-size: 13px; color: var(--text-secondary); line-height: 1.6; }

.dimension-scores { display: flex; gap: 8px; margin-bottom: 14px; }
.dimension-scores .dim { flex: 1; text-align: center; }
.dimension-scores .dim-bar { height: 4px; border-radius: 2px; margin-bottom: 4px; min-width: 8px; }
.dimension-scores .dim-label { font-size: 10px; color: var(--text-secondary); }
.dimension-scores .dim-score { font-size: 13px; font-weight: 600; }

.module-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.module-card { border: 1px solid var(--border); border-radius: 10px; padding: 12px; background: var(--bg-modal, #fff); }
.module-card-title { font-weight: 600; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
.module-card-body { font-size: 12px; line-height: 1.7; }
.module-card-empty { font-size: 11px; color: var(--text-tertiary); }
.module-card--risk { border-color: rgba(255,149,0,0.3); background: rgba(255,149,0,0.04); }
@media (max-width: 900px) { .module-grid { grid-template-columns: 1fr; } .stock-mini-list { display: none; } }
```

- [ ] **Step 2: 构建确认无语法错误**

Run: `npm run build:renderer` → 成功

- [ ] **Step 3: CDP 视觉验证（参照之前验证过的稳定 CDP 流程）**

启动 app 带 debug port → 切 stocks → 筛选 → 点诊断 → 截图。确认：左列表 + 右报告布局、评级卡、评分条、模块卡渲染正常。（此步可手动让用户看，或 CDP 截图自查）

- [ ] **Step 4: 提交**

```bash
git add styles.css
git commit -m "style(stock): 个股诊断报告页样式 (评级卡/评分条/模块卡/左列表)"
```

---

## Task 8: 删旧版 StockDetailDrawer + 死 CSS 清理

**Files:**
- Delete: `src/renderer/stocks/StockDetailDrawer.jsx`
- Delete: `src/renderer/stocks/stockDetailStore.js`
- Delete: `tests/renderer/stocks/StockDetailDrawer.test.jsx`
- Delete: `tests/renderer/stocks/stockDetailStore.test.js`
- Modify: `src/renderer/stocks/StockLayout.jsx`（删 `<StockDetailDrawer/>` + 顶栏「AI 个股」按钮）
- Modify: `styles.css`（删 41 条死 CSS + stock-results-pad-drawer）

- [ ] **Step 1: 确认无其他文件引用旧 StockDetailDrawer/stockDetailStore**

Run: `grep -rn "StockDetailDrawer\|stockDetailStore\|detailOpen\|selectedStock" src/renderer/ --include="*.jsx" --include="*.js" | grep -v "StockDetailDrawer.jsx\|stockDetailStore.js"`
Expected: 只有 StockLayout.jsx 引用（行 47-54 按钮 + 行 80 渲染）。若有其他引用需先处理。

- [ ] **Step 2: StockLayout 删旧入口**

修改 `src/renderer/stocks/StockLayout.jsx`：
- 删 import StockDetailDrawer / stockDetailStore 相关
- 删顶栏「AI 个股」按钮（约行 47-54，`detailOpen.value = true` 那个）
- 删 `<StockDetailDrawer api={api} />`（约行 80）

- [ ] **Step 3: 删旧文件**

```bash
rm src/renderer/stocks/StockDetailDrawer.jsx
rm src/renderer/stocks/stockDetailStore.js
rm tests/renderer/stocks/StockDetailDrawer.test.jsx
rm tests/renderer/stocks/stockDetailStore.test.js
```

- [ ] **Step 4: 运行全量测试确认无残留引用**

Run: `npx vitest run tests/renderer/stocks/ tests/ai/stock-detail-advisor.test.js tests/stocks/diagnosis-scorer.test.js`
Expected: PASS（旧测试已删，新测试通过）

- [ ] **Step 5: 死 CSS 清理（按 dead-candidate-report 核对）**

Run: `cat docs/superpowers/plans/2026-06-28-styles-dead-candidate-report.md | grep -A1 "stock-" | head -60`
逐条核对报告里的 stock-* 死类，确认 JSX 不再用再删。**注意保留**：
- `stock-advise-chip`（AiAdviseDrawer 仍用）
- `stock-layout/header/btn/strategy/criteria/table`（选股主界面仍用）
- `ai-drawer-*`（AiAdviseDrawer 用 AIDrawerShell 仍用）

删：`stock-detail-overlay/drawer/header/title/section/chips/tab*`（旧抽屉）、`stock-modal*`（已删 AddStockModal）、`stock-search-list/item`（已删）、`stock-star/watchlist*/wl-*`（已删自选股）、`stock-results-pad-drawer`（让位逻辑）。

- [ ] **Step 6: 构建确认删 CSS 没破坏现有页面**

Run: `npm run build:renderer && npx vitest run tests/renderer/stocks/`
Expected: 成功

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "refactor(stock): 删旧版 StockDetailDrawer (637行) + stockDetailStore + 死 CSS 清理"
```

---

## Task 9: 联调 + CDP 视觉验证 + 收尾

- [ ] **Step 1: 全量测试**

Run: `npx vitest run tests/stocks/ tests/renderer/stocks/ tests/ai/stock-detail-advisor.test.js`
Expected: 全 PASS

- [ ] **Step 2: 构建 + 启动 app（debug port）**

```bash
npm run build:renderer
npx electron . --remote-debugging-port=9223 &
sleep 12
```

- [ ] **Step 3: CDP 走完整流程截图**

写 CDP 脚本：切 stocks nav → （若需先筛选则点筛选）→ 点表格某行「诊断」→ 截图。确认：
- 全屏诊断页显示
- 左列表有筛选结果
- 右报告：评级卡 + 评分条 + 模块卡
- 点左列表别的股 → 右报告切换

（参照 Task 7 Step 3 的 CDP 流程，复用 scripts/ 下已验证的模式）

- [ ] **Step 4: 修复发现的问题（若有）**

根据截图调整 CSS/逻辑。

- [ ] **Step 5: 清理临时 CDP 脚本**

```bash
rm -f scripts/cdp-*.mjs
```

- [ ] **Step 6: 最终提交**

```bash
git add -A
git commit -m "test(stock): 诊断页 CDP 视觉验证通过 + 收尾"
```

- [ ] **Step 7: 合并到 main（用户确认后）**

```bash
git checkout main
git merge feature/stock-diagnosis-redesign
```
