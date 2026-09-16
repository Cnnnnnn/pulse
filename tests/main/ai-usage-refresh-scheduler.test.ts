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
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

const mockFetch = vi.fn();
const mockSetAiUsage = vi.fn();
const mockTrayMgr = { setAiUsage: mockSetAiUsage };

const registerAiUsagePath = mainArtifactPath("ipc/register-ai-usage");
const schedulerModulePath = mainArtifactPath("ai-usage-refresh-scheduler");

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

/**
 * 打桩 ai-usage-cache.createAiUsageCache. scheduler 现在只消费 getTraySummaryMap
 * (provider 列表由 ai-usage-cache.PROVIDERS 单点维护).
 */
function stubCache(summary: any) {
  const cache = requireMain("ai-usage-cache");
  const map = { minimax: summary, glm: summary, codex: summary };
  vi.spyOn(cache, "createAiUsageCache").mockReturnValue({
    getTraySummary: () => summary,
    getTraySummaryMap: () => map,
  });
}

describe("ai-usage-refresh-scheduler (Task B2.1)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockSetAiUsage.mockReset();
  });

  it("refreshOnce: 双 provider 各调一次 fetch + setAiUsage 用 cache summary", async () => {
    installStubs();
    mockFetch.mockResolvedValue({ ok: true, provider: "minimax", snapshot: { windows: { "5h": { usedPercent: 42 } } } });

    stubCache({ status: "ok", percent: 42, remainLabel: "2h", fetchedAt: Date.now() });

    const helper = createAiUsageRefreshScheduler({ trayMgr: mockTrayMgr, deps: {} });
    await helper.refreshOnce();

    expect(mockFetch).toHaveBeenCalledTimes(3);  // minimax + glm + codex
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

    stubCache({ status: "ok", percent: 30, remainLabel: "1h" });

    const helper = createAiUsageRefreshScheduler({ trayMgr: mockTrayMgr, deps: {} });
    await helper.refreshOnce();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockSetAiUsage).toHaveBeenCalledTimes(1);
  });

  it("refreshOnce: fetch 抛异常 → 不阻塞 setAiUsage", async () => {
    installStubs();
    mockFetch.mockRejectedValue(new Error("network fail"));

    stubCache({ status: "ok", percent: 50, remainLabel: "1h" });

    const helper = createAiUsageRefreshScheduler({ trayMgr: mockTrayMgr, deps: {} });
    await expect(helper.refreshOnce()).resolves.not.toThrow();
    expect(mockSetAiUsage).toHaveBeenCalledTimes(1);  // tray 仍推 (cache 返 last-known)
  });

  it("start/stop: setManagedInterval + clearManaged 控制 lifecycle", async () => {
    installStubs();
    stubCache({ status: "ok", percent: 50, remainLabel: "1h" });

    const helper = createAiUsageRefreshScheduler({ trayMgr: mockTrayMgr, deps: {} });
    const refreshSpy = vi.spyOn(helper, "refreshOnce").mockResolvedValue();

    // 真实短 interval（timer-registry 走 node:timers，fake timers 钩不住）
    // 默认 deferInitial=true → 首跑走 setImmediate
    helper.start({ intervalMs: 25 });
    await new Promise((r) => setImmediate(r));
    expect(refreshSpy).toHaveBeenCalledTimes(1); // 首跑
    await new Promise((r) => setTimeout(r, 80));
    expect(refreshSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    helper.stop();
    const n = refreshSpy.mock.calls.length;
    await new Promise((r) => setTimeout(r, 60));
    expect(refreshSpy.mock.calls.length).toBe(n); // 停止后不再调用
  });
});

/**
 * 登录态失效提醒 (§codex) —— 端到端接线验证.
 *
 * 纯决策逻辑单测在 tests/ai-usage/auth-watch.test.ts; 这里只证明
 * scheduler 真的把它接上了: 拿 fetch 结果 → 读 prefs → 发通知 → 落去重时间戳.
 */
describe("ai-usage-refresh-scheduler — 登录态失效提醒", () => {
  const shownNotifications: any[] = [];

  function installElectronStub() {
    const electronPath = require.resolve("electron");
    class FakeNotification {
      constructor(opts: any) {
        this.opts = opts;
      }
      opts: any;
      show() {
        shownNotifications.push(this.opts);
      }
      static isSupported() {
        return true;
      }
    }
    require.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: { Notification: FakeNotification },
    };
  }

  function makeAlertDeps(overrides: any = {}) {
    return {
      providers: ["minimax", "glm", "codex"],
      loadAlertPrefs: vi.fn(() => ({ authWarned: {} })),
      saveAlertPrefs: vi.fn(),
      loadHistoryProvider: vi.fn(() => ({ days: [] })),
      ...overrides,
    };
  }

  /**
   * 必须连 scheduler 实例一起重载 —— 否则 electron 在首个用例加载时就被记住了,
   * 后装的 stub 不生效, "没发通知" 的断言会退化成"因为崩了"而假绿.
   */
  function freshSchedulerWithElectronStub() {
    installElectronStub();
    delete require.cache[schedulerModulePath];
    installStubs();
  }

  /** codex 失效、其它正常; 且 codex 历史上成功过 (有快照). */
  function stubCodexFailure(reason = "token_expired") {
    freshSchedulerWithElectronStub();
    mockFetch.mockImplementation(async ({ opts }: any) => {
      if (opts.provider === "codex") {
        return { ok: false, provider: "codex", reason };
      }
      return { ok: true, provider: opts.provider, snapshot: { windows: { "5h": { usedPercent: 10 } } } };
    });
    stubCache({ status: "ok", percent: 10, remainLabel: "1h" });
    return {
      stateStore: {
        loadSnapshotProvider: (pid: string) =>
          pid === "codex" ? { windows: { monthly: { usedPercent: 74 } } } : null,
      },
    };
  }

  beforeEach(() => {
    shownNotifications.length = 0;
  });

  it("codex token 过期 → 发一条通知 + 记下去重时间戳", async () => {
    const deps = stubCodexFailure("token_expired");
    const alertDeps = makeAlertDeps();
    const helper = createAiUsageRefreshScheduler({
      trayMgr: mockTrayMgr,
      deps,
      alertDeps,
      sendToRenderer: vi.fn(),
    });

    await helper.refreshOnce();

    expect(shownNotifications.length).toBe(1);
    expect(shownNotifications[0].title).toContain("Codex");
    expect(shownNotifications[0].body).toContain("codex login");
    expect(alertDeps.saveAlertPrefs).toHaveBeenCalledTimes(1);
    const patch = alertDeps.saveAlertPrefs.mock.calls[0][0];
    expect(typeof patch.authWarned.codex).toBe("number");
  });

  it("从没成功过 (无历史快照) → 不打扰", async () => {
    freshSchedulerWithElectronStub();
    mockFetch.mockResolvedValue({ ok: false, provider: "codex", reason: "token_expired" });
    stubCache({ status: "ok", percent: 10, remainLabel: "1h" });
    const alertDeps = makeAlertDeps();
    const helper = createAiUsageRefreshScheduler({
      trayMgr: mockTrayMgr,
      deps: { stateStore: { loadSnapshotProvider: () => null } },
      alertDeps,
      sendToRenderer: vi.fn(),
    });

    await helper.refreshOnce();

    expect(shownNotifications.length).toBe(0);
    expect(alertDeps.saveAlertPrefs).not.toHaveBeenCalled();
  });

  it("3 天内已提醒过 → 不再重复 (30min 一轮不能刷屏)", async () => {
    const deps = stubCodexFailure("auth_401");
    const alertDeps = makeAlertDeps({
      loadAlertPrefs: () => ({ authWarned: { codex: Date.now() - 60_000 } }),
    });
    const helper = createAiUsageRefreshScheduler({
      trayMgr: mockTrayMgr,
      deps,
      alertDeps,
      sendToRenderer: vi.fn(),
    });

    await helper.refreshOnce();

    expect(shownNotifications.length).toBe(0);
    expect(alertDeps.saveAlertPrefs).not.toHaveBeenCalled();
  });

  it("静默时段 → 不发通知, 且不记已提醒 (否则用户永远等不到)", async () => {
    const deps = stubCodexFailure("token_expired");
    const alertDeps = makeAlertDeps();
    const helper = createAiUsageRefreshScheduler({
      trayMgr: mockTrayMgr,
      deps,
      alertDeps,
      sendToRenderer: vi.fn(),
      getConfig: () => ({
        notifications: { quiet_hours_start: "00:00", quiet_hours_end: "23:59" },
      }),
    });

    await helper.refreshOnce();

    expect(shownNotifications.length).toBe(0);
    expect(alertDeps.saveAlertPrefs).not.toHaveBeenCalled();
  });

  it("codex 恢复正常 → 清掉记录 (下次再失效能重新提醒)", async () => {
    freshSchedulerWithElectronStub();
    mockFetch.mockResolvedValue({ ok: true, provider: "codex", snapshot: { windows: {} } });
    stubCache({ status: "ok", percent: 10, remainLabel: "1h" });
    const alertDeps = makeAlertDeps({
      loadAlertPrefs: () => ({ authWarned: { codex: 123 } }),
    });
    const helper = createAiUsageRefreshScheduler({
      trayMgr: mockTrayMgr,
      deps: { stateStore: { loadSnapshotProvider: () => ({ windows: {} }) } },
      alertDeps,
      sendToRenderer: vi.fn(),
    });

    await helper.refreshOnce();

    expect(shownNotifications.length).toBe(0);
    const patch = alertDeps.saveAlertPrefs.mock.calls[0][0];
    expect(patch.authWarned).toEqual({});
  });
});
