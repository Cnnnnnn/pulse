import { describe, it, expect, beforeEach, vi } from "vitest";
import { signal } from "@preact/signals";
import {
  stockDiagnosisCode,
  stockActiveTab,
  openDiagnosis,
  closeDiagnosis,
  diagnosisState,
  loadDiagnosis,
  requestAiSummary,
} from "../../../src/renderer/stocks/diagnosisStore.js";

// closeDiagnosis 不再清 stockDiagnosisCode (保留当"最近分析过的股票"语义),
// 测试间手动归零避免互相污染.
beforeEach(() => {
  stockDiagnosisCode.value = null;
  stockActiveTab.value = "screen";
});

describe("diagnosisStore", () => {
  beforeEach(() => {
    closeDiagnosis();
  });

  it("stockDiagnosisCode 默认 null", () => {
    expect(stockDiagnosisCode.value).toBeNull();
  });
  it("stockActiveTab 默认 screen", () => {
    expect(stockActiveTab.value).toBe("screen");
  });
  it("openDiagnosis(api, code) 设 code + 切到 diagnosis tab", () => {
    openDiagnosis(null, "300750");
    expect(stockDiagnosisCode.value).toBe("300750");
    expect(stockActiveTab.value).toBe("diagnosis");
  });
  it("closeDiagnosis 切回 screen tab 且保留 stockDiagnosisCode", () => {
    openDiagnosis(null, "300750");
    closeDiagnosis();
    expect(stockActiveTab.value).toBe("screen");
    // 关键: code 不再被清, 保留当"当前分析股票"语义
    expect(stockDiagnosisCode.value).toBe("300750");
  });
  it("closeDiagnosis 重置 diagnosisState 回 idle", async () => {
    const api = {
      stocksDetailAngles: vi
        .fn()
        .mockResolvedValue({
          ok: true,
          data: {
            perAngle: { profitability: { status: "ok", data: { roe: 24 } } },
          },
        }),
      stocksDetailAnalyze: vi
        .fn()
        .mockResolvedValue({ ok: true, result: { summary: "测试" } }),
    };
    await loadDiagnosis(api, "300750");
    expect(diagnosisState.value.status).toBe("ready");
    closeDiagnosis();
    expect(diagnosisState.value.status).toBe("idle");
    expect(diagnosisState.value.scores).toBeNull();
    expect(diagnosisState.value.aiResult).toBeNull();
    expect(diagnosisState.value.error).toBeNull();
  });
});

describe("loadDiagnosis", () => {
  beforeEach(() => {
    closeDiagnosis();
  });

  it("成功: 拉 angles → 算分 (AI 不自动触发, aiStatus 保持 idle)", async () => {
    const api = {
      stocksDetailAngles: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          perAngle: {
            profitability: { status: "ok", data: { roe: 24 } },
            valuation: { status: "ok", data: { pe: 12 } },
          },
        },
      }),
      stocksDetailAnalyze: vi
        .fn()
        .mockResolvedValue({
          ok: true,
          result: { summary: "测试", signal: "neutral" },
        }),
    };
    await loadDiagnosis(api, "300750");
    expect(diagnosisState.value.status).toBe("ready");
    expect(diagnosisState.value.scores.overall).toBeGreaterThan(0);
    expect(diagnosisState.value.aiStatus).toBe("idle");
    expect(api.stocksDetailAnalyze).not.toHaveBeenCalled();
  });
  it("angles 失败 → status error", async () => {
    const api = {
      stocksDetailAngles: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: "fetch_failed" }),
    };
    await loadDiagnosis(api, "300750");
    expect(diagnosisState.value.status).toBe("error");
  });
});

describe("requestAiSummary (手动触发 AI 解读)", () => {
  beforeEach(() => {
    closeDiagnosis();
  });

  it("成功 → aiStatus ready + aiResult", async () => {
    const api = {
      stocksDetailAngles: vi
        .fn()
        .mockResolvedValue({
          ok: true,
          data: {
            perAngle: { profitability: { status: "ok", data: { roe: 24 } } },
          },
        }),
      stocksDetailAnalyze: vi
        .fn()
        .mockResolvedValue({
          ok: true,
          result: { summary: "AI 解读", signal: "neutral" },
        }),
    };
    await loadDiagnosis(api, "300750");
    await requestAiSummary(api, "300750");
    expect(diagnosisState.value.aiStatus).toBe("ready");
    expect(diagnosisState.value.aiResult.summary).toBe("AI 解读");
  });
  it("AI reject → aiStatus error", async () => {
    const api = {
      stocksDetailAngles: vi
        .fn()
        .mockResolvedValue({ ok: true, data: { perAngle: {} } }),
      stocksDetailAnalyze: vi.fn().mockRejectedValue(new Error("ai")),
    };
    await loadDiagnosis(api, "300750");
    await requestAiSummary(api, "300750");
    expect(diagnosisState.value.aiStatus).toBe("error");
  });
  it("openDiagnosis 走 _runDiagnosisFlow: angles 成功 → status ready", async () => {
    const api = {
      stocksDetailAngles: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          perAngle: {
            price_trend: {
              status: "ok",
              data: {
                closes: [1, 2, 3],
                change5d: 1,
                change20d: 2,
                change30d: 3,
              },
            },
            valuation: { status: "ok", data: { pe: 12 } },
            profitability: { status: "ok", data: { roe: 18 } },
            capital_flow: { status: "ok", data: { mainInflow5d: 100 } },
            tech_indicators: { status: "ok", data: { macd: 1, rsi: 50 } },
          },
        },
      }),
      stocksDetailAnalyze: vi
        .fn()
        .mockResolvedValue({
          ok: true,
          result: { summary: "AI ok", signal: "neutral" },
        }),
    };
    openDiagnosis(api, "300750");
    // openDiagnosis fire-and-forget, 等 microtask 跑完
    await new Promise((r) => setTimeout(r, 50));
    expect(diagnosisState.value.status).toBe("ready");
    expect(diagnosisState.value.scores.overall).toBeGreaterThan(0);
  });
  it("AI {ok:false} → aiStatus error", async () => {
    const api = {
      stocksDetailAngles: vi
        .fn()
        .mockResolvedValue({ ok: true, data: { perAngle: {} } }),
      stocksDetailAnalyze: vi.fn().mockResolvedValue({ ok: false }),
    };
    await loadDiagnosis(api, "300750");
    await requestAiSummary(api, "300750");
    expect(diagnosisState.value.aiStatus).toBe("error");
    expect(diagnosisState.value.aiResult).toBeNull();
  });
});
