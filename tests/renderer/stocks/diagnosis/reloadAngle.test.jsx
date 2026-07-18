// @vitest-environment happy-dom
// ponytail 2026-07-18 P0-1 polish #2: 验证 reloadAngle (stocks:angle-reload) 真数据重拉
//   替换 perAngleData[angleKey]. DataHealthPill failed → retry 按钮调这个.
//   跟 refreshAngle (LLM 重解读) 区别: 本函数让 pill 真正能从 failed → ok.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  diagnosisState,
  stockDiagnosisCode,
  refreshingAngles,
  failedAngles,
  reloadAngle,
} from "../../../../src/renderer/stocks/diagnosisStore.js";

afterEach(() => {
  diagnosisState.value = {
    code: null,
    perAngleData: {},
    aiResult: null,
    scores: null,
  };
  stockDiagnosisCode.value = null;
  refreshingAngles.value = new Set();
  failedAngles.value = new Set();
});

describe("reloadAngle — 单条 angle 数据重拉 (stocks:angle-reload IPC)", () => {
  beforeEach(() => {
    diagnosisState.value = {
      code: "002463",
      perAngleData: {
        profitability: {
          status: "failed",
          reason: "fetch_failed",
          error: "timeout",
          fetchedAt: 1000,
          failureStreakCount: 1,
        },
      },
      aiResult: null,
      scores: {},
    };
    stockDiagnosisCode.value = "002463";
  });

  it("ok 时: 替换 perAngleData[angleKey] (status → ok, data 在, failureStreakCount 归零)", async () => {
    const api = {
      stocksAngleReload: vi.fn(async ({ code, angleKey }) => ({
        ok: true,
        perAngle: {
          angleKey,
          status: "ok",
          data: { roe: 24, grossMargin: 0.45 },
          fetchedAt: 2000,
          lastSuccessAt: 2000,
          failureStreakCount: 0,
        },
      })),
    };
    await reloadAngle(api, "profitability");
    expect(api.stocksAngleReload).toHaveBeenCalledWith({
      code: "002463",
      angleKey: "profitability",
    });
    const pa = diagnosisState.value.perAngleData.profitability;
    expect(pa.status).toBe("ok");
    expect(pa.data).toEqual({ roe: 24, grossMargin: 0.45 });
    expect(pa.failureStreakCount).toBe(0);
  });

  it("ok 时: 移除 refreshingAngles (finally 清理)", async () => {
    const api = {
      stocksAngleReload: vi.fn(async () => ({
        ok: true,
        perAngle: { angleKey: "profitability", status: "ok", data: {}, fetchedAt: 2000, failureStreakCount: 0 },
      })),
    };
    await reloadAngle(api, "profitability");
    expect(refreshingAngles.value.has("profitability")).toBe(false);
  });

  it("后端返 ok=false (reason='exception') 时: 调 markAngleFailed → failedAngles 包含 angleKey", async () => {
    const api = {
      stocksAngleReload: vi.fn(async () => ({
        ok: false,
        reason: "exception",
        error: "network reset",
      })),
    };
    await reloadAngle(api, "profitability");
    expect(failedAngles.value.has("profitability")).toBe(true);
    // perAngleData 不变 (still the failed state from before)
    expect(diagnosisState.value.perAngleData.profitability.status).toBe("failed");
  });

  it("api throw 时: 也走 markAngleFailed (catch path)", async () => {
    const api = {
      stocksAngleReload: vi.fn(async () => {
        throw new Error("IPC timeout");
      }),
    };
    await reloadAngle(api, "profitability");
    expect(failedAngles.value.has("profitability")).toBe(true);
  });

  it("code 缺失时: 静默 return, 不调 IPC (StockDiagnosisPage 还没选股就 retry 边界)", async () => {
    diagnosisState.value = { ...diagnosisState.value, code: null };
    stockDiagnosisCode.value = null;
    const api = { stocksAngleReload: vi.fn() };
    await reloadAngle(api, "profitability");
    expect(api.stocksAngleReload).not.toHaveBeenCalled();
  });

  it("api 缺失时: 静默 return", async () => {
    await reloadAngle(null, "profitability");
    expect(refreshingAngles.value.has("profitability")).toBe(false);
  });

  it("onRefresh 透传 angleKey, 跟 9 张卡 makeRefresh(k) 语义一致", async () => {
    const api = {
      stocksAngleReload: vi.fn(async () => ({
        ok: true,
        perAngle: { angleKey: "valuation", status: "ok", data: {}, fetchedAt: 1, failureStreakCount: 0 },
      })),
    };
    await reloadAngle(api, "valuation");
    expect(api.stocksAngleReload.mock.calls[0][0].angleKey).toBe("valuation");
  });

  it("成功后 perAngleData[angleKey] 整个替换, 不影响其他 angle", async () => {
    diagnosisState.value = {
      ...diagnosisState.value,
      perAngleData: {
        profitability: { status: "failed", reason: "x", fetchedAt: 1, failureStreakCount: 1 },
        valuation: { status: "ok", data: { pe: 18 }, fetchedAt: 1, failureStreakCount: 0 },
      },
    };
    const api = {
      stocksAngleReload: vi.fn(async () => ({
        ok: true,
        perAngle: { angleKey: "profitability", status: "ok", data: { roe: 99 }, fetchedAt: 2, failureStreakCount: 0 },
      })),
    };
    await reloadAngle(api, "profitability");
    const p = diagnosisState.value.perAngleData;
    expect(p.profitability.status).toBe("ok");
    expect(p.profitability.data.roe).toBe(99);
    // valuation 完全不动
    expect(p.valuation.status).toBe("ok");
    expect(p.valuation.data.pe).toBe(18);
  });
});