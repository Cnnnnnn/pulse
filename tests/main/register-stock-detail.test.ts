import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  mainArtifactPath,
  stocksArtifactPath,
  aiArtifactPath,
} = require("../_setup/require-main.cjs");

const registerPath = mainArtifactPath("ipc/register-stock-detail");
const fetcherPath = stocksArtifactPath("stock-detail-fetcher");
const advisorPath = aiArtifactPath("stock-detail-advisor");
const chromiumPath = mainArtifactPath("chromium-http-client");

const fetchAll = vi.fn(async () => ({
  fulfilledCount: 1,
  totalCount: 1,
  perAngle: {
    valuation: { status: "ok", data: { pe: 10 } },
  },
}));
const fetchSingle = vi.fn(async (_http, _code, angleKey) => ({
  status: "ok",
  angleKey,
  data: { pe: 8 },
  fetchedAt: Date.now(),
  lastSuccessAt: Date.now(),
  failureStreakCount: 0,
}));

function stubModules() {
  vi.resetModules();
  require.cache[fetcherPath] = {
    id: fetcherPath,
    filename: fetcherPath,
    loaded: true,
    exports: {
      fetchStockDetailAngles: fetchAll,
      fetchSingleAngle: fetchSingle,
    },
  };
  require.cache[advisorPath] = {
    id: advisorPath,
    filename: advisorPath,
    loaded: true,
    exports: {
      aiStockDetailAnalyze: vi.fn(),
      refreshAngleLocally: vi.fn(),
    },
  };
  require.cache[chromiumPath] = {
    id: chromiumPath,
    filename: chromiumPath,
    loaded: true,
    exports: {
      createStockHttpClient: () => ({ get: vi.fn() }),
    },
  };
  delete require.cache[registerPath];
}

function loadHandlers() {
  const { registerStockDetailHandlers } = require(registerPath);
  const handlers = {};
  const safeHandle = (channel, fn, options = {}) => {
    handlers[channel] = async (...args) => {
      try {
        return await fn(...args);
      } catch (err) {
        return options.onError ? options.onError(err) : { ok: false, reason: "threw" };
      }
    };
  };
  registerStockDetailHandlers({
    safeHandle,
    threwResponse: (err) => ({ ok: false, error: err && err.message }),
  });
  return handlers;
}

describe("register-stock-detail IPC", () => {
  beforeEach(() => {
    fetchAll.mockClear();
    fetchSingle.mockClear();
    stubModules();
  });

  it("单角度成功重拉后使该股票的整组详情缓存失效", async () => {
    const handlers = loadHandlers();
    const payload = { code: "600519", angles: ["valuation"] };

    const first = await handlers["stocks:detail-angles"]({}, payload);
    expect(first.fromCache).toBe(false);
    await handlers["stocks:detail-angles"]({}, payload);
    expect(fetchAll).toHaveBeenCalledTimes(1);

    const reload = await handlers["stocks:angle-reload"]({}, {
      code: "600519",
      angleKey: "valuation",
    });
    expect(reload.ok).toBe(true);

    const afterReload = await handlers["stocks:detail-angles"]({}, payload);
    expect(afterReload.fromCache).toBe(false);
    expect(fetchAll).toHaveBeenCalledTimes(2);
  });

  it("单角度重拉失败时返回 ok:false，避免 renderer 把失败数据当成功", async () => {
    fetchSingle.mockResolvedValueOnce({
      status: "failed",
      angleKey: "valuation",
      reason: "fetch_failed",
      error: "timeout",
    });
    const handlers = loadHandlers();

    const result = await handlers["stocks:angle-reload"]({}, {
      code: "600519",
      angleKey: "valuation",
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("fetch_failed");
    expect(result.error).toBe("timeout");
    expect(result.perAngle.status).toBe("failed");
  });
});
