/**
 * tests/main/ai-usage-refresh-scheduler.test.js
 *
 * v2.22 Task B2.1: 测 30min AI 用量 tray 自动刷新的:
 *   - 构造 fetch cycle (parallel call minimax + glm)
 *   - 成功时 push setAiUsage 到 tray
 *   - 失败时只 warn, 不抛 (timer 不能死)
 *   - 缺 apiKey (api_key_missing) 视为 soft-fail (skip provider, 不阻塞 glm)
 *
 * 注: vite module graph 下静态 vi.mock('...') 对 CJS require 路径不稳
 * (跟 tests/main/tray-debounce.test.js 同样的坑, 见那里注释).
 * 用 require.cache stub + vi.resetModules 模式.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
const mockSetAiUsage = vi.fn();
const mockTrayMgr = { setAiUsage: mockSetAiUsage };

const registerAiUsagePath = require.resolve("../../src/main/ipc/register-ai-usage.js");
const schedulerModulePath = require.resolve("../../src/main/ai-usage-refresh-scheduler.js");

let createAiUsageRefreshScheduler;

function installStubs() {
  vi.resetModules();
  // Stub register-ai-usage with our _internals.fetch mock
  require.cache[registerAiUsagePath] = {
    id: registerAiUsagePath,
    filename: registerAiUsagePath,
    loaded: true,
    exports: {
      _internals: { fetch: mockFetch },
      registerAiUsageHandlers: () => {},
      KNOWN_PROVIDERS: ["minimax", "glm"],
    },
  };
  // Re-require scheduler under test (will pick up stubbed register-ai-usage)
  const mod = require(schedulerModulePath);
  createAiUsageRefreshScheduler = mod.createAiUsageRefreshScheduler;
}

describe("ai-usage-refresh-scheduler (Task B2.1)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockSetAiUsage.mockReset();
  });

  it("refreshOnce: 双 provider 各调一次 fetch + setAiUsage 用 cache summary", async () => {
    installStubs();
    mockFetch.mockResolvedValue({ ok: true, provider: "minimax", snapshot: { windows: { "5h": { usedPercent: 42 } } } });

    const cache = require("../../src/main/ai-usage-cache");
    vi.spyOn(cache, "createAiUsageCache").mockReturnValue({
      getTraySummary: () => ({ status: "ok", percent: 42, remainLabel: "2h", fetchedAt: Date.now() }),
    });

    const helper = createAiUsageRefreshScheduler({ trayMgr: mockTrayMgr, deps: {} });
    await helper.refreshOnce();

    expect(mockFetch).toHaveBeenCalledTimes(2);  // minimax + glm
    expect(mockSetAiUsage).toHaveBeenCalledTimes(1);
    const trayCall = mockSetAiUsage.mock.calls[0][0];
    expect(trayCall.minimax).toMatchObject({ status: "ok" });
    expect(trayCall.glm).toMatchObject({ status: "ok" });
  });

  it("refreshOnce: 单 provider 失败 (api_key_missing) → setAiUsage 仍调 (其它 provider 仍推)", async () => {
    installStubs();
    mockFetch.mockImplementation(async ({ opts }) => {
      if (opts.provider === "minimax") return { ok: false, provider: "minimax", reason: "api_key_missing" };
      return { ok: true, provider: "glm", snapshot: { windows: { "5h": { usedPercent: 30 } } } };
    });

    const cache = require("../../src/main/ai-usage-cache");
    vi.spyOn(cache, "createAiUsageCache").mockReturnValue({
      getTraySummary: () => ({ status: "ok", percent: 30, remainLabel: "1h" }),
    });

    const helper = createAiUsageRefreshScheduler({ trayMgr: mockTrayMgr, deps: {} });
    await helper.refreshOnce();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockSetAiUsage).toHaveBeenCalledTimes(1);
  });

  it("refreshOnce: fetch 抛异常 → 不阻塞 setAiUsage", async () => {
    installStubs();
    mockFetch.mockRejectedValue(new Error("network fail"));

    const cache = require("../../src/main/ai-usage-cache");
    vi.spyOn(cache, "createAiUsageCache").mockReturnValue({
      getTraySummary: () => ({ status: "ok", percent: 50, remainLabel: "1h" }),
    });

    const helper = createAiUsageRefreshScheduler({ trayMgr: mockTrayMgr, deps: {} });
    await expect(helper.refreshOnce()).resolves.not.toThrow();
    expect(mockSetAiUsage).toHaveBeenCalledTimes(1);  // tray 仍推 (cache 返 last-known)
  });

  it("start/stop: setInterval + clearInterval 控制 lifecycle", async () => {
    installStubs();
    vi.useFakeTimers();
    const cache = require("../../src/main/ai-usage-cache");
    vi.spyOn(cache, "createAiUsageCache").mockReturnValue({
      getTraySummary: () => ({ status: "ok", percent: 50, remainLabel: "1h" }),
    });

    const helper = createAiUsageRefreshScheduler({ trayMgr: mockTrayMgr, deps: {} });
    const refreshSpy = vi.spyOn(helper, "refreshOnce").mockResolvedValue();

    helper.start({ intervalMs: 1000 });
    // 立即 fire 1 次 + 2500ms 内 setInterval 1000ms 周期 fire 2 次 → 3 次
    vi.advanceTimersByTime(2500);
    expect(refreshSpy).toHaveBeenCalledTimes(3);

    helper.stop();
    vi.advanceTimersByTime(3000);
    expect(refreshSpy).toHaveBeenCalledTimes(3);  // 停止后不再调用

    vi.useRealTimers();
  });
});
