import { describe, it, expect, beforeEach, vi } from "vitest";
import { signal } from "@preact/signals";
import { stockDiagnosisCode, openDiagnosis, closeDiagnosis, diagnosisState, loadDiagnosis } from "../../../src/renderer/stocks/diagnosisStore.js";

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
  it("closeDiagnosis 重置 diagnosisState 回 idle", async () => {
    const api = {
      stocksDetailAngles: vi.fn().mockResolvedValue({ ok: true, data: { profitability: { status: "ok", data: { roe: 24 } } } }),
      stocksDetailAnalyze: vi.fn().mockResolvedValue({ ok: true, result: { summary: "测试" } }),
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
  it("AI 返回 {ok:false} → 数据仍 ready, error=ai_failed", async () => {
    const api = {
      stocksDetailAngles: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      stocksDetailAnalyze: vi.fn().mockResolvedValue({ ok: false }),
    };
    await loadDiagnosis(api, "300750");
    expect(diagnosisState.value.status).toBe("ready");
    expect(diagnosisState.value.error).toBe("ai_failed");
    expect(diagnosisState.value.aiResult).toBeNull();
  });
});
