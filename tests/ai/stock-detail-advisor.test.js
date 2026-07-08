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
const stockAnglesPath =
  require.resolve("../../src/stocks/stock-detail-angles.js");
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
        {
          key: "price_trend",
          label: "价格趋势",
          group: "行情",
          promptHint: "近 30 日",
          dataShape: "PriceTrendData",
        },
        {
          key: "valuation",
          label: "估值水位",
          group: "财务",
          promptHint: "PE PB",
          dataShape: "ValuationData",
        },
        {
          key: "capital_flow",
          label: "资金流向",
          group: "资金",
          promptHint: "主力净流入",
          dataShape: "CapitalFlowData",
        },
        {
          key: "peer_compare",
          label: "同业对比",
          group: "财务",
          promptHint: "PE PB vs 行业中位",
          dataShape: "PeerCompareData",
        },
        {
          key: "moat_score",
          label: "护城河",
          group: "财务",
          promptHint: "3 维评分",
          dataShape: "MoatScoreData",
        },
      ],
      getAngle: (k) => {
        // ponytail: mock 包含 summarizeForAi, 让 buildAnalyzeMessages 走 C1 修复后的真链路
        // (而不是 JSON.stringify fallback). 真实函数体在 stock-detail-angles.js, 这里只返识别字符串.
        const summarizePriceTrend = (d) =>
          d && Array.isArray(d.closes)
            ? `近 ${d.closes.length} 日 close`
            : null;
        const summarizeValuation = (d) =>
          d && d.pe != null ? `动态 PE ${d.pe} 倍` : null;
        const summarizeCapitalFlow = (d) =>
          d && d.mainNetInflow != null ? `主力净流入 ${d.mainNetInflow}` : null;
        const summarizePeerCompare = (d) => {
          if (!d || (d.pe == null && d.pb == null)) return null;
          const industry = d.industry ? `行业: ${d.industry}. ` : "";
          const pePart =
            d.pe != null && d.peIndustryMedian != null
              ? `PE ${d.pe} vs 行业中位 ${d.peIndustryMedian}`
              : "";
          return industry + pePart;
        };
        const summarizeMoatScore = (d) =>
          d && d.score != null ? `护城河 ${d.score}/9` : null;
        const map = {
          price_trend: {
            key: "price_trend",
            label: "价格趋势",
            summarizeForAi: summarizePriceTrend,
          },
          valuation: {
            key: "valuation",
            label: "估值水位",
            summarizeForAi: summarizeValuation,
          },
          capital_flow: {
            key: "capital_flow",
            label: "资金流向",
            summarizeForAi: summarizeCapitalFlow,
          },
          peer_compare: {
            key: "peer_compare",
            label: "同业对比",
            summarizeForAi: summarizePeerCompare,
          },
          moat_score: {
            key: "moat_score",
            label: "护城河",
            summarizeForAi: summarizeMoatScore,
          },
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
  price_trend: {
    status: "ok",
    data: {
      closes: [100, 101, 102, 103, 105],
      change5d: 2.5,
      change20d: 8.0,
      amplitude: 5.2,
    },
  },
  valuation: { status: "ok", data: { pe: 28.5, pb: 8.2, pePercentile3y: 70 } },
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────
// aiStockDetailAnalyze
// ─────────────────────────────────────────────────────────────────────────

describe("aiStockDetailAnalyze", () => {
  it("returns invalid_args when code missing", async () => {
    const r = await advisor.aiStockDetailAnalyze({
      angles: ["price_trend"],
      perAngleData: mkPerAngleData(),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_args");
  });

  it("cache hit: does not call chatCompletion", async () => {
    const key = advisor.adviseCacheKey({
      code: "600519",
      angles: ["price_trend"],
      perAngleData: mkPerAngleData(),
    });
    _mockState.stockDetailCache = {
      [key]: {
        result: {
          summary: "cached",
          perAngle: {},
          risks: [],
          signal: "neutral",
        },
        fetchedAt: Date.now(),
      },
    };
    const r = await advisor.aiStockDetailAnalyze({
      code: "600519",
      angles: ["price_trend"],
      perAngleData: mkPerAngleData(),
    });
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
    const r = await advisor.aiStockDetailAnalyze({
      code: "600519",
      angles: ["price_trend"],
      perAngleData: mkPerAngleData(),
    });
    expect(r.ok).toBe(true);
    expect(r.fromCache).toBe(false);
    expect(r.result.summary).toBe("测试总结");
    expect(r.result.signal).toBe("neutral");
    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(Object.keys(_mockState.stockDetailCache)).toHaveLength(1);
  });

  it("LLM failure: returns reason from chatCompletion", async () => {
    mockChat.mockResolvedValue({ ok: false, reason: "budget_exceeded" });
    const r = await advisor.aiStockDetailAnalyze({
      code: "600519",
      angles: ["price_trend"],
      perAngleData: mkPerAngleData(),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("budget_exceeded");
  });

  it("LLM returns broken JSON (3 attempts): 抠不到 prose → parse_failed, 不写缓存", async () => {
    // ponytail 2026-07-08 — retry 总数升到 3 (PARSE_RETRY_MAX=2). 全失败 + 无 prose → 报 parse_failed
    mockChat.mockResolvedValue({ ok: true, text: "not json" });
    const r = await advisor.aiStockDetailAnalyze({
      code: "600519",
      angles: ["price_trend"],
      perAngleData: mkPerAngleData(),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
    expect(mockChat).toHaveBeenCalledTimes(3); // 总 3 次
    expect(Object.keys(_mockState.stockDetailCache)).toHaveLength(0);
  });

  it("LLM returns broken JSON 但含 'summary: ...' prose → degraded ok=true", async () => {
    // ponytail 2026-07-08 — 兜底 prose 抽取: 全部 retry 失败后, 从 LLM 输出抠 summary 段
    //   至少展示一段文字 (degraded=true), 不直接报 parse_failed.
    mockChat.mockResolvedValue({
      ok: true,
      text:
        "I'm having trouble formatting JSON. Let me try again.\n\n" +
        "summary: 这只票技术面偏强, 短期有支撑, 中长期估值偏贵需要消化.\n\n" +
        "（以上是 AI 的分析, 仅供参考）",
    });
    const r = await advisor.aiStockDetailAnalyze({
      code: "600519",
      angles: ["price_trend"],
      perAngleData: mkPerAngleData(),
    });
    expect(r.ok).toBe(true);
    expect(r.degraded).toBe(true);
    expect(r.result.summary).toMatch(/技术面偏强/);
    // degraded 结果不写缓存 (避免污染下次), 但可以存新结果待 strict 重试
    expect(Object.keys(_mockState.stockDetailCache)).toHaveLength(0);
  });

  it("LLM 第 2 次重试成功 → ok=true, attempts=2, 写缓存", async () => {
    // ponytail 2026-07-08 — retry 链: 第 1 次 broken, 第 2 次正常, 走成功路径
    const goodResp = {
      ok: true,
      text: JSON.stringify({
        summary: "技术面偏强",
        highlights: [],
        blindspots: [],
        perAngle: {},
        risks: [],
        signal: "positive",
      }),
    };
    mockChat
      .mockResolvedValueOnce({ ok: true, text: "totally broken no json" })
      .mockResolvedValueOnce(goodResp);
    const r = await advisor.aiStockDetailAnalyze({
      code: "600519",
      angles: ["price_trend"],
      perAngleData: mkPerAngleData(),
    });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
    expect(mockChat).toHaveBeenCalledTimes(2);
    expect(Object.keys(_mockState.stockDetailCache)).toHaveLength(1);
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
    const out = advisor.parseAndValidateAnalyze(
      JSON.stringify({ perAngle: {}, risks: [], signal: "neutral" }),
    );
    expect(typeof out.summary).toBe("string");
    expect(out.summary.length).toBeGreaterThan(0);
  });

  it("normalizes signal to whitelist", () => {
    const out = advisor.parseAndValidateAnalyze(
      JSON.stringify({ summary: "x", perAngle: {}, risks: [], signal: "BUY" }),
    );
    expect(out.signal).toBe("neutral");
  });

  it("accepts valid signal values", () => {
    for (const s of ["positive", "neutral", "cautious"]) {
      const out = advisor.parseAndValidateAnalyze(
        JSON.stringify({ summary: "x", perAngle: {}, risks: [], signal: s }),
      );
      expect(out.signal).toBe(s);
    }
  });

  it("truncates summary > 200 chars", () => {
    const long = "x".repeat(300);
    const out = advisor.parseAndValidateAnalyze(
      JSON.stringify({
        summary: long,
        perAngle: {},
        risks: [],
        signal: "neutral",
      }),
    );
    expect(out.summary.length).toBeLessThanOrEqual(200);
  });

  it("rewrites forbidden summary keywords (买入/卖出/加仓/减仓)", () => {
    const out = advisor.parseAndValidateAnalyze(
      JSON.stringify({
        summary: "强烈推荐买入",
        perAngle: {},
        risks: [],
        signal: "positive",
      }),
    );
    expect(out.summary).not.toMatch(/强烈推荐|买入/);
    expect(out.summary).toContain("当前市场呈现");
  });

  it("does NOT leak userId / watchlist / search history (PII safety)", () => {
    const out = advisor.parseAndValidateAnalyze(
      JSON.stringify({
        summary: "userId 123 看多 watchlist 查询",
        perAngle: {},
        risks: [],
        signal: "neutral",
      }),
    );
    expect(out.summary).not.toMatch(
      /userId|watchlist|searchHistory|search_history/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// buildAnalyzeMessages
// ─────────────────────────────────────────────────────────────────────────

describe("buildAnalyzeMessages", () => {
  it("throws on missing code", () => {
    expect(() =>
      advisor.buildAnalyzeMessages({
        angles: ["price_trend"],
        perAngleData: mkPerAngleData(),
      }),
    ).toThrow();
  });

  it("returns system + user messages", () => {
    const msgs = advisor.buildAnalyzeMessages({
      code: "600519",
      angles: ["price_trend"],
      perAngleData: mkPerAngleData(),
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
    expect(msgs[0].content).toContain("MOCK-SYS-stock_detail_analyze");
  });

  it("user message includes code + angle labels", () => {
    const msgs = advisor.buildAnalyzeMessages({
      code: "600519",
      angles: ["price_trend", "valuation"],
      perAngleData: mkPerAngleData(),
    });
    expect(msgs[1].content).toContain("600519");
    expect(msgs[1].content).toContain("价格趋势");
    expect(msgs[1].content).toContain("估值水位");
  });

  it("user message includes perAngleData values", () => {
    const msgs = advisor.buildAnalyzeMessages({
      code: "600519",
      angles: ["valuation"],
      perAngleData: mkPerAngleData(),
    });
    expect(msgs[1].content).toContain("28.5");
  });

  it("user message marks failed angles (no leakage of raw error)", () => {
    const pad = mkPerAngleData({
      capital_flow: { status: "failed", reason: "fetch_failed" },
    });
    const msgs = advisor.buildAnalyzeMessages({
      code: "600519",
      angles: ["price_trend", "capital_flow"],
      perAngleData: pad,
    });
    expect(msgs[1].content).toMatch(/capital_flow.*数据缺失/);
  });

  it("buildAnalyzeMessages 把 fewShot 拼到 system 段", () => {
    // ponytail: T2 评审发现原 advisor 忽略 fewShot. 此 it 锁定新契约.
    // 2026-07-07: 改成"fewShot 已拼接" + "system 含 prompt 三段任一特征". 不再
    // 锁死 fewShot 字面细节 (例: "暂无数据" 改成 "数据缺失" 也不应破契约).
    const messages = advisor.buildAnalyzeMessages({
      code: "600519",
      angles: ["price_trend"],
      perAngleData: {
        price_trend: { status: "ok", data: { closes: [1, 2, 3] } },
      },
    });
    expect(messages).toHaveLength(2);
    const system = messages[0].content;
    // 1) fewShot 段必须非空 + 拼进 system — 通过 fewShot 特征的"输入/输出"对识别.
    expect(system).toMatch(/输入:[\s\S]*输出:/);
    // 2) fewShot 里挑 1 条只属于 few-shot、不在 system / rules 里复用的字面 — "护城河"
    // (3-6 angle 全选示例的特征词) — 既证明 fewShot 真的被拼进去, 又容忍改 few-shot
    // 细节不破契约.
    expect(system).toContain("护城河");
  });

  it("few-shot 第 3 个示例包含 peer_compare + moat_score angle, parseAndValidate 能正确解析 perAngle", () => {
    // ponytail: few-shot 加 1 个 6 angle 全选的示例, 让 LLM 学会引用同业/护城河数据
    const llmText = JSON.stringify({
      summary:
        "600519 同业对比 PE 偏贵 30%, 护城河 7/9 强, 综合偏贵但有龙头溢价.",
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
      summary:
        "沪电股份近 30 日累计涨幅 37.14% 表现强势, 短期加速 (5 日 +8.5%); 资金流向与新闻舆情数据缺失.",
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
          industry: "白酒",
          pe: 28.5,
          peIndustryMedian: 22.0,
          peRank: 18,
          peTotal: 52,
          peDeviationPct: 29.5,
          pb: 8.2,
          pbIndustryMedian: 6.0,
          pbRank: 22,
          pbTotal: 52,
          pbDeviationPct: 36.7,
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
    const messages = advisor.buildAnalyzeMessages({
      code: "600519",
      angles: ["peer_compare", "moat_score"],
      perAngleData: pad,
    });
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

// ─────────────────────────────────────────────────────────────────────────
// buildAnalyzeMessages scores 注入 (Task 2: AI 解读改造 — 角色转解说员)
// ponytail: scores 由规则算出 (Task 1 diagnosis-scorer), AI 只解读不打分.
//           测试沿用本文件 CJS require.cache 注入范式 (advisor.buildAnalyzeMessages).
// ─────────────────────────────────────────────────────────────────────────

describe("buildAnalyzeMessages scores 注入", () => {
  it("user 段含 scores 维度分 + rationale", () => {
    const messages = advisor.buildAnalyzeMessages({
      code: "300750",
      angles: ["profitability", "valuation"],
      perAngleData: {
        profitability: { status: "ok", data: { roe: 24 } },
        valuation: { status: "ok", data: { pe: 20 } },
      },
      scores: {
        overall: 7.5,
        dimensions: {
          fundamental: 8,
          valuation: 6,
          capital: null,
          tech: null,
          risk: 7,
        },
        rationale: ["PE 20，估值合理", "ROE 24%，盈利能力强"],
      },
    });
    const userText = messages[1].content;
    expect(userText).toContain("综合评级");
    expect(userText).toContain("7.5");
    expect(userText).toContain("PE 20");
  });
  it("scores 缺失时不崩 (向后兼容)", () => {
    const messages = advisor.buildAnalyzeMessages({
      code: "300750",
      angles: [],
      perAngleData: {},
    });
    expect(messages[1].content).toContain("300750");
  });

  it("overall=null + 部分维度缺失 → 渲染「数据不足」", () => {
    const messages = advisor.buildAnalyzeMessages({
      code: "300750",
      angles: [],
      perAngleData: {},
      scores: {
        overall: null,
        dimensions: {
          fundamental: 8,
          valuation: null,
          capital: null,
          tech: null,
          risk: null,
        },
        rationale: [],
      },
    });
    const userText = messages[1].content;
    expect(userText).toContain("数据不足"); // overall 显示数据不足
    expect(userText).toContain("基本面=8");
    expect(userText).toContain("估值=数据不足");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// P0-1: 对比基准块 — PE/PB/ROE 行业 + 历史分位进 user 段, 让 LLM 有数字锚点
// ─────────────────────────────────────────────────────────────────────────

describe("buildAnalyzeMessages P0-1 对比基准", () => {
  it("user 段含 PE/PB 这只 vs 历史 vs 行业 (peer_compare 块)", () => {
    const pad = {
      peer_compare: {
        status: "ok",
        data: {
          industry: "酒类",
          pe: 28.5,
          pePercentile: 35,
          peValuationStatus: "适中",
          pb: 9.2,
          pbPercentile: 28,
          pbValuationStatus: "偏低",
          roeIndustryMedian: 14.5,
          grossMarginIndustryMedian: 60.0,
        },
      },
      profitability: { status: "ok", data: { roe: 32.5 } },
      price_trend: {
        status: "ok",
        data: { closes: [100, 101, 102, 103, 105] },
      },
    };
    const messages = advisor.buildAnalyzeMessages({
      code: "600519",
      angles: ["profitability", "peer_compare"],
      perAngleData: pad,
    });
    const userText = messages[1].content;
    expect(userText).toContain("对比基准");
    expect(userText).toContain("PE: 28.5 倍");
    expect(userText).toContain("历史 35 分位");
    expect(userText).toContain("ROE 中位: 14.5%");
    expect(userText).toContain("毛利率中位: 60.0%");
  });

  it("user 段含数据缺口块 (capital_flow 失败时显式列出)", () => {
    const pad = {
      price_trend: { status: "ok", data: { closes: [100, 101] } },
      capital_flow: { status: "failed", reason: "fetch_failed" },
    };
    const messages = advisor.buildAnalyzeMessages({
      code: "600519",
      angles: ["price_trend", "capital_flow"],
      perAngleData: pad,
    });
    const userText = messages[1].content;
    expect(userText).toContain("数据缺口");
    expect(userText).toContain("资金流向");
  });

  it("无 peer + 无 perAngle 角度 → 缺对比基准块时不崩 (向后兼容)", () => {
    const pad = { profitability: { status: "ok", data: { roe: 24 } } };
    const messages = advisor.buildAnalyzeMessages({
      code: "300750",
      angles: ["profitability"],
      perAngleData: pad,
    });
    const userText = messages[1].content;
    expect(userText).toContain("300750");
    // 对比基准块可能没有 (没 peer_compare), 但不应当崩
    expect(typeof userText).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// P1-2: refreshAngleLocally — 本地快速重解读, 不调 LLM, 不读 store
// ─────────────────────────────────────────────────────────────────────────

describe("refreshAngleLocally", () => {
  const fullData = (over = {}) => ({
    price_trend: {
      status: "ok",
      data: { closes: [100, 102, 104, 106, 108] },
    },
    valuation: { status: "ok", data: { pe: 28.5, pb: 8.2 } },
    profitability: { status: "ok", data: { roe: 32.5 } },
    ...over,
  });

  it("score>=7 (偏强) 时给 positive tone, 含具体数字", () => {
    const out = advisor.refreshAngleLocally({
      angleKey: "profitability",
      perAngleData: fullData(),
      scores: { dimensions: { fundamental: 8 } },
      seed: 0,
    });
    expect(out).toBeTruthy();
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out).toMatch(/ROE|盈利/);
  });

  it("score<=3 (偏弱) 时给 cautious tone", () => {
    const out = advisor.refreshAngleLocally({
      angleKey: "valuation",
      perAngleData: fullData(),
      scores: { dimensions: { valuation: 2 } },
      seed: 0,
    });
    expect(out).toBeTruthy();
    expect(out).toMatch(/贵|弱/);
  });

  it("score 缺失 (null) → 返 null (UI 显示数据缺失)", () => {
    const out = advisor.refreshAngleLocally({
      angleKey: "valuation",
      perAngleData: fullData(),
      scores: { dimensions: { valuation: null } },
    });
    expect(out).toBeNull();
  });

  it("perAngleData 该 angle 拉取失败 → 返 null", () => {
    const out = advisor.refreshAngleLocally({
      angleKey: "capital_flow",
      perAngleData: {
        capital_flow: { status: "failed", reason: "fetch_failed" },
      },
      scores: { dimensions: { capital: 6 } },
    });
    expect(out).toBeNull();
  });

  it("未知 angle key → 返 null (不抛)", () => {
    const out = advisor.refreshAngleLocally({
      angleKey: "nope_xxx",
      perAngleData: fullData(),
      scores: { dimensions: {} },
    });
    expect(out).toBeNull();
  });

  it("不同 seed 抽到不同模板 (1 个 angle 多种说法)", () => {
    const scores = { dimensions: { fundamental: 8 } };
    const seen = new Set();
    for (let s = 0; s < 20; s++) {
      const out = advisor.refreshAngleLocally({
        angleKey: "profitability",
        perAngleData: fullData(),
        scores,
        seed: s,
      });
      if (out) seen.add(out);
    }
    // 至少 2 种不同模板 — 否则 seed 没生效, refresh 价值低
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});
