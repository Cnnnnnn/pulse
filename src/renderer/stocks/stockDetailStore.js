/**
 * src/renderer/stocks/stockDetailStore.js
 *
 * 阶段四: 个股 AI 分析 renderer signals. 对照 stockStore.js.
 */
import { signal } from "@preact/signals";

export const codeInput = signal("");
export const selectedStock = signal(null);
export const selectedAngles = signal(
  new Set(["price_trend", "volume_turnover"]),
);
export const perAngleData = signal({});
export const aiResult = signal({
  status: "idle",
  result: null,
  fromCache: false,
  reason: null,
  error: null,
});
export const detailOpen = signal(false);

export function toggleAngle(key) {
  const next = new Set(selectedAngles.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  selectedAngles.value = next;
}

export function selectStock(stock, api) {
  selectedStock.value = stock;
  perAngleData.value = {};
  aiResult.value = {
    status: "idle",
    result: null,
    fromCache: false,
    reason: null,
    error: null,
  };
  // ponytail: 选完股票后立即对默认勾选 angles 拉数据, 用户不必再手动点 chip.
  // 静默 fire-and-forget; 失败在 chip 上显示红感叹号, 不阻塞.
  if (api && stock && stock.code) {
    for (const angle of selectedAngles.value) {
      void loadAngleData(api, stock.code, angle);
    }
  }
}

export async function loadAngleData(api, code, angle) {
  if (!api || !api.stocksDetailAngles) return;
  perAngleData.value = {
    ...perAngleData.value,
    [angle]: { status: "loading", data: null },
  };
  try {
    const r = await api.stocksDetailAngles({ code, angles: [angle] });
    if (r && r.ok) {
      perAngleData.value = {
        ...perAngleData.value,
        [angle]: r.data.perAngle[angle],
      };
    } else {
      perAngleData.value = {
        ...perAngleData.value,
        [angle]: {
          status: "failed",
          reason: (r && r.reason) || "unknown",
          error: (r && r.error) || null,
        },
      };
    }
  } catch (e) {
    perAngleData.value = {
      ...perAngleData.value,
      [angle]: {
        status: "failed",
        reason: "exception",
        error: e && e.message ? e.message : String(e),
      },
    };
  }
}

export async function requestAiDetail(api, payload) {
  if (!api || !api.stocksDetailAnalyze) {
    aiResult.value = {
      status: "error",
      result: null,
      fromCache: false,
      reason: "no_api",
      error: "api 不可用",
    };
    return;
  }
  aiResult.value = {
    ...aiResult.value,
    status: "loading",
    reason: null,
    error: null,
  };
  try {
    const r = await api.stocksDetailAnalyze(payload);
    if (r && r.ok) {
      aiResult.value = {
        status: "ready",
        result: r.result,
        fromCache: !!r.fromCache,
        reason: null,
        error: null,
      };
    } else {
      aiResult.value = {
        status: "error",
        result: null,
        fromCache: false,
        reason: (r && r.reason) || "unknown",
        error: (r && r.error) || null,
      };
    }
  } catch (e) {
    aiResult.value = {
      status: "error",
      result: null,
      fromCache: false,
      reason: "exception",
      error: e && e.message ? e.message : String(e),
    };
  }
}

export function resetDetail() {
  codeInput.value = "";
  selectedStock.value = null;
  selectedAngles.value = new Set(["price_trend", "volume_turnover"]);
  perAngleData.value = {};
  aiResult.value = {
    status: "idle",
    result: null,
    fromCache: false,
    reason: null,
    error: null,
  };
}
