/**
 * tests/ai/stock-detail-advisor.test.js
 *
 * ponytail: vitest 1.6 的 vi.mock 只 hook ESM import, 不 hook CJS require.
 * advisor.js 是 CJS, 内部用 require(...). 改用 require.cache 注入模式
 * (见 tests/detectors/circuit-breaker-storage.test.js + stock-screener-advisor.test.js).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const stateStorePath = require.resolve("../../src/main/state-store.js");
const promptRegistryPath = require.resolve("../../src/ai/prompt-registry.js");
const sharedLlmPath = require.resolve("../../src/ai/shared-llm.js");
const stockAnglesPath = require.resolve("../../src/stocks/stock-detail-angles.js");
const advisorPath = require.resolve("../../src/ai/stock-detail-advisor.js");

// ponytail: 加载真 prompt-registry 仅供 mock 取 fewShot 用 — 单测不修改它,
// 但 buildAnalyzeMessages 的拼接逻辑需要真 fewShot 才能验证 system 段内容.
const _realPrompts = require(promptRegistryPath).DEFAULT_PROMPTS;

const mockChat = vi.fn();
const _mockState = { stockDetailCache: {}, apps: {} };

function reloadAdvisor() {
  delete require.cache[advisorPath];
  delete require.cache[stockAnglesPath];
  require.cache[sharedLlmPath] = {
    id: sharedLlmPath,
    filename: sharedLlmPath,
    loaded: true,
    exports: { chatCompletion: (...args) => mockChat(...args) },
  };
  require.cache[promptRegistryPath] = {
    id: promptRegistryPath,
    filename: promptRegistryPath,
    loaded: true,
    exports: {
      resolvePrompt: (key) => {
        const def = _realPrompts[key];
        return {
          system: `MOCK-SYS-${key}`,
          rules: `MOCK-RULES-${key}`,
          fewShot: def ? def.fewShot : "",
        };
      },
    },
  };
  require.cache[stateStorePath] = {
    id: stateStorePath,
    filename: stateStorePath,
    loaded: true,
    exports: {
      load: () => _mockState,
      patchState: (fn) => fn(_mockState),
    },
  };
  require.cache[stockAnglesPath] = {
    id: stockAnglesPath,
    filename: stockAnglesPath,
    loaded: true,
    exports: {
      ANGLE_DEFS: [
        { key: "price_trend", label: "价格趋势", group: "行情", promptHint: "近 30 日", dataShape: "PriceTrendData" },
        { key: "valuation", label: "估值水位", group: "财务", promptHint: "PE PB", dataShape: "ValuationData" },
        { key: "capital_flow", label: "资金流向", group: "资金", promptHint: "主力净流入", dataShape: "CapitalFlowData" },
        { key: "peer_compare", label: "同业对比", group: "财务", promptHint: "PE PB vs 行业中位", dataShape: "PeerCompareData" },
        { key: "moat_score", label: "护城河", group: "财务", promptHint: "3 维评分", dataShape: "MoatScoreData" },
      ],
      getAngle: (k) => {
        // ponytail: mock 包含 summarizeForAi, 让 buildAnalyzeMessages 走 C1 修复后的真链路
        // (而不是 JSON.stringify fallback). 真实函数体在 stock-detail-angles.js, 这里只返识别字符串.
        const summarizePriceTrend = (d) => d && Array.isArray(d.closes) ? `近 ${d.closes.length} 日 close` : null;
        const summarizeValuation = (d) => d && d.pe != null ? `动态 PE ${d.pe} 倍` : null;
        const summarizeCapitalFlow = (d) => d && d.mainNetInflow != null ? `主力净流入 ${d.mainNetInflow}` : null;
        const summarizePeerCompare = (d) => {
          if (!d || (d.pe == null && d.pb == null)) return null;
          const industry = d.industry ? `行业: ${d.industry}. ` : "";
          const pePart = d.pe != null && d.peIndustryMedian != null ? `PE ${d.pe} vs 行业中位 ${d.peIndustryMedian}` : "";
          return industry + pePart;
        };
        const summarizeMoatScore = (d) => d && d.score != null ? `护城河 ${d.score}/9` : null;
        const map = {
          price_trend: { key: "price_trend", label: "价格趋势", summarizeForAi: summarizePriceTrend },
          valuation: { key: "valuation", label: "估值水位", summarizeForAi: summarizeValuation },
          capital_flow: { key: "capital_flow", label: "资金流向", summarizeForAi: summarizeCapitalFlow },
          peer_compare: { key: "peer_compare", label: "同业对比", summarizeForAi: summarizePeerCompare },
          moat_score: { key: "moat_score", label: "护城河", summarizeForAi: summarizeMoatScore },
        };
        return map[k] || null;
      },
    },
  };
  return require(advisorPath);
}

let advisor = reloadAdvisor();

beforeEach(() => {
  mockChat.mockReset();
  _mockState.stockDetailCache = {};
  _mockState.apps = {};
});

const mkPerAngleData = (over = {}) => ({
  price_trend: { status: "ok", data: { closes: [100, 101, 102, 103, 105], change5d: 2.5, change20d: 8.0, amplitude: 5.2 } },
  valuation: { status: "ok", data: { pe: 28.5, pb: 8.2, pePercentile3y: 70 } },
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────
// aiStockDetailAnalyze
// ─────────────────────────────────────────────────────────────────────────

describe("aiStockDetailAnalyze", () => {
  it("returns invalid_args when code missing", async () => {
    const r = await advisor.aiStockDetailAnalyze({ angles: ["price_trend"], perAngleData: mkPerAngleData() });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_args");
  });

  it("cache hit: does not call chatCompletion", async () => {
    const key = advisor.adviseCacheKey({ code: "600519", angles: ["price_trend"], perAngleData: mkPerAngleData() });
    _mockState.stockDetailCache = {
      [key]: { result: { summary: "cached", perAngle: {}, risks: [], signal: "neutral" }, fetchedAt: Date.now() },
    };
    const r = await advisor.aiStockDetailAnalyze({ code: "600519", angles: ["price_trend"], perAngleData: mkPerAngleData() });
    expect(r.ok).toBe(true);
    expect(r.fromCache).toBe(true);
    expect(r.result.summary).toBe("cached");
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("cache miss + LLM success → calls chatCompletion, writes cache", async () => {
    mockChat.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        summary: "测试总结",
        perAngle: { price_trend: "近 30 日上行" },
        risks: ["估值偏高"],
        signal: "neutral",
      }),
    });
    const r = await advisor.aiStockDetailAnalyze({ code: "600519", angles: ["price_trend"], perAngleData: mkPerAngleData() });
    expect(r.ok).toBe(true);
    expect(r.fromCache).toBe(false);
    expect(r.result.summary).toBe("测试总结");
    expect(r.result.signal).toBe("neutral");
    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(Object.keys(_mockState.stockDetailCache)).toHaveLength(1);
  });

  it("LLM failure: returns reason from chatCompletion", async () => {
    mockChat.mockResolvedValue({ ok: false, reason: "budget_exceeded" });
    const r = await advisor.aiStockDetailAnalyze({ code: "600519", angles: ["price_trend"], perAngleData: mkPerAngleData() });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("budget_exceeded");
  });

  it("LLM returns broken JSON: returns parse_failed, does NOT write cache", async () => {
    mockChat.mockResolvedValue({ ok: true, text: "not json" });
    const r = await advisor.aiStockDetailAnalyze({ code: "600519", angles: ["price_trend"], perAngleData: mkPerAngleData() });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
    expect(Object.keys(_mockState.stockDetailCache)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// parseAndValidateAnalyze
// ─────────────────────────────────────────────────────────────────────────

describe("parseAndValidateAnalyze", () => {
  it("returns null on empty input", () => {
    expect(advisor.parseAndValidateAnalyze("")).toBe(null);
  });

  it("uses fallback summary when missing", () => {
    const out = advisor.parseAndValidateAnalyze(JSON.stringify({ perAngle: {}, risks: [], signal: "neutral" }));
    expect(typeof out.summary).toBe("string");
    expect(out.summary.length).toBeGreaterThan(0);
  });

  it("normalizes signal to whitelist", () => {
    const out = advisor.parseAndValidateAnalyze(JSON.stringify({ summary: "x", perAngle: {}, risks: [], signal: "BUY" }));
    expect(out.signal).toBe("neutral");
  });

  it("accepts valid signal values", () => {
    for (const s of ["positive", "neutral", "cautious"]) {
      const out = advisor.parseAndValidateAnalyze(JSON.stringify({ summary: "x", perAngle: {}, risks: [], signal: s }));
      expect(out.signal).toBe(s);
    }
  });

  it("truncates summary > 200 chars", () => {
    const long = "x".repeat(300);
    const out = advisor.parseAndValidateAnalyze(JSON.stringify({ summary: long, perAngle: {}, risks: [], signal: "neutral" }));
    expect(out.summary.length).toBeLessThanOrEqual(200);
  });

  it("rewrites forbidden summary keywords (买入/卖出/加仓/减仓)", () => {
    const out = advisor.parseAndValidateAnalyze(JSON.stringify({ summary: "强烈推荐买入", perAngle: {}, risks: [], signal: "positive" }));
    expect(out.summary).not.toMatch(/强烈推荐|买入/);
    expect(out.summary).toContain("当前市场呈现");
  });

  it("does NOT leak userId / watchlist / search history (PII safety)", () => {
    const out = advisor.parseAndValidateAnalyze(JSON.stringify({
      summary: "userId 123 看多 watchlist 查询",
      perAngle: {}, risks: [], signal: "neutral",
    }));
    expect(out.summary).not.toMatch(/userId|watchlist|searchHistory|search_history/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// buildAnalyzeMessages
// ─────────────────────────────────────────────────────────────────────────

describe("buildAnalyzeMessages", () => {
  it("throws on missing code", () => {
    expect(() => advisor.buildAnalyzeMessages({ angles: ["price_trend"], perAngleData: mkPerAngleData() })).toThrow();
  });

  it("returns system + user messages", () => {
    const msgs = advisor.buildAnalyzeMessages({ code: "600519", angles: ["price_trend"], perAngleData: mkPerAngleData() });
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
    expect(msgs[0].content).toContain("MOCK-SYS-stock_detail_analyze");
  });

  it("user message includes code + angle labels", () => {
    const msgs = advisor.buildAnalyzeMessages({ code: "600519", angles: ["price_trend", "valuation"], perAngleData: mkPerAngleData() });
    expect(msgs[1].content).toContain("600519");
    expect(msgs[1].content).toContain("价格趋势");
    expect(msgs[1].content).toContain("估值水位");
  });

  it("user message includes perAngleData values", () => {
    const msgs = advisor.buildAnalyzeMessages({ code: "600519", angles: ["valuation"], perAngleData: mkPerAngleData() });
    expect(msgs[1].content).toContain("28.5");
  });

  it("user message marks failed angles (no leakage of raw error)", () => {
    const pad = mkPerAngleData({ capital_flow: { status: "failed", reason: "fetch_failed" } });
    const msgs = advisor.buildAnalyzeMessages({ code: "600519", angles: ["price_trend", "capital_flow"], perAngleData: pad });
    expect(msgs[1].content).toMatch(/capital_flow.*数据缺失/);
  });

  it("buildAnalyzeMessages 把 fewShot 拼到 system 段", () => {
    // ponytail: T2 评审发现原 advisor 忽略 fewShot. 此 it 锁定新契约.
    const messages = advisor.buildAnalyzeMessages({
      code: "600519",
      angles: ["price_trend"],
      perAngleData: { price_trend: { status: "ok", data: { closes: [1, 2, 3] } } },
    });
    expect(messages).toHaveLength(2);
    const system = messages[0].content;
    // 包含 fewShot 的关键字符串 (来自 T1 测试同款关键字)
    expect(system).toContain("价格趋势");
    expect(system).toContain("暂无数据");
    expect(system).toContain("输入:");
    expect(system).toContain("输出:");
  });

  it("few-shot 第 3 个示例包含 peer_compare + moat_score angle, parseAndValidate 能正确解析 perAngle", () => {
    // ponytail: few-shot 加 1 个 6 angle 全选的示例, 让 LLM 学会引用同业/护城河数据
    const llmText = JSON.stringify({
      summary: "600519 同业对比 PE 偏贵 30%, 护城河 7/9 强, 综合偏贵但有龙头溢价.",
      perAngle: {
        price_trend: "30 日累计涨幅 5%",
        valuation: "PE 28.5 倍",
        profitability: "ROE 30%",
        peer_compare: "PE 28.5 vs 行业中位 22.0, 偏贵 30%",
        moat_score: "护城河 7/9 (毛利 3 + ROIC 3 + 营收 1)",
        capital_flow: "暂无数据",
      },
      risks: ["PE 偏贵 30% 估值修复空间有限"],
      signal: "neutral",
    });
    const parsed = advisor.parseAndValidateAnalyze(llmText);
    expect(parsed).not.toBeNull();
    expect(parsed.perAngle.peer_compare).toContain("偏贵");
    expect(parsed.perAngle.moat_score).toContain("7/9");
    expect(parsed.perAngle.capital_flow).toBe("暂无数据");
  });

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
    const parsed = advisor.parseAndValidateAnalyze(llmText);
    expect(parsed).not.toBeNull();
    expect(parsed.perAngle.capital_flow).toBe("暂无数据");
    expect(parsed.perAngle.news_buzz).toBe("暂无数据");
    expect(parsed.risks).toHaveLength(2);
    expect(parsed.signal).toBe("neutral");
  });

  it("new angles (peer_compare / moat_score) 走 summarizeForAi 而不是 JSON.stringify", () => {
    // ponytail: C1 修复锁定 — Stage 6 新增 2 个 angle 必须经 summarizeForAi 渲染到 user 段,
    //          否则 Task 3 评审修的 industry 前缀 / note 后缀是 dead code.
    const pad = {
      peer_compare: {
        status: "ok",
        data: {
          industry: "白酒", pe: 28.5, peIndustryMedian: 22.0, peRank: 18, peTotal: 52, peDeviationPct: 29.5,
          pb: 8.2, pbIndustryMedian: 6.0, pbRank: 22, pbTotal: 52, pbDeviationPct: 36.7,
        },
      },
      moat_score: {
        status: "ok",
        data: {
          score: 7,
          breakdown: { marginEdge: 3, roicEdge: 3, revenueStability: 1 },
          metrics: { grossMargin: 88.2, roic: 28.0, revenueCagr5y: 15.0 },
          note: "强护城河",
        },
      },
    };
    const messages = advisor.buildAnalyzeMessages({ code: "600519", angles: ["peer_compare", "moat_score"], perAngleData: pad });
    const userContent = messages[1].content;
    // 不应泄漏 raw JSON key (证明没走 JSON.stringify 分支)
    expect(userContent).not.toContain("peIndustryMedian");
    expect(userContent).not.toContain("revenueStability");
    // 应含 summarizeForAi 输出 (mock 里的识别串)
    expect(userContent).toContain("行业中位");
    expect(userContent).toContain("护城河");
    expect(userContent).toContain("7/9");
  });
});