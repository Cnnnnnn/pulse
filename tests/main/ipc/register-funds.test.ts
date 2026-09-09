/**
 * tests/main/ipc/register-funds.test.ts
 *
 * 基金 IPC 契约：16 个 channel 注册齐全 + 关键 handler 返回形状。
 * 业务逻辑在 tests/main/fund-store.test.ts / funds/ 下。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mainArtifactPath } = require("../../_setup/require-main.cjs");

const loadAll = vi.fn(() => ({ holdings: [], deletedIds: [] }));
const add = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const restore = vi.fn();
const setNavSource = vi.fn();
const listHistory = vi.fn();
const searchFunds = vi.fn();
const fetchFundNavBatch = vi.fn();
const fetchFundNavHistory = vi.fn();
const fetchIndexHistory = vi.fn();
const pickEffectiveNavNumber = vi.fn();

const electronPath = require.resolve("electron");
const registerPath = mainArtifactPath("ipc/register-funds");
const fundStorePath = mainArtifactPath("funds/fund-store");
const fundHistoryPath = mainArtifactPath("funds/fund-history-store");
const fundSearchPath = require.resolve("../../../src/funds/fund-search.ts");
const fundFetcherPath = require.resolve("../../../src/funds/fund-fetcher.ts");
const fundNavMergePath = require.resolve("../../../src/funds/fund-nav-merge.ts");
const fundNavHistoryPath = require.resolve("../../../src/funds/fund-nav-history.ts");
const httpClientPath = mainArtifactPath("http-client");

const EXPECTED = [
  "funds:list",
  "funds:add",
  "funds:update",
  "funds:remove",
  "funds:restore",
  "funds:nav:fetch",
  "funds:nav:state",
  "funds:nav:fetch-codes",
  "funds:search",
  "funds:history:list",
  "funds:nav:history",
  "funds:index:history",
  "funds:set-nav-source",
  "funds:backfill",
  "funds:alert-prefs:get",
  "funds:alert-prefs:set",
];

function stub(p: string, exports: any) {
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}

function freshModule() {
  vi.resetModules();
  stub(electronPath, { ipcMain: { handle: vi.fn() } });
  stub(httpClientPath, { HttpClient: class {} });
  stub(fundStorePath, {
    loadAll,
    add,
    update,
    remove,
    restore,
    setNavSource,
    loadAlertPrefs: () => ({}),
    saveAlertPrefs: () => ({}),
  });
  stub(fundHistoryPath, {
    listHistory,
    appendSnapshot: vi.fn(),
  });
  // ESM-ish shared modules: tests resolve via require of dist-test when possible;
  // fund-search is renderer-shared pure — stub the path the CJS bundle will hit.
  try {
    stub(fundSearchPath, { searchFunds });
    stub(fundFetcherPath, { fetchFundNavBatch });
    stub(fundNavMergePath, { pickEffectiveNavNumber });
    stub(fundNavHistoryPath, { fetchFundNavHistory, fetchIndexHistory });
  } catch {
    /* paths may differ by build layout; registration test still runs */
  }
  return require(registerPath);
}

function collect() {
  const handlers: Record<string, (...a: any[]) => any> = {};
  const safeHandle = vi.fn((channel: string, fn: any, _opts?: any) => {
    handlers[channel] = fn;
  });
  const threwResponse = vi.fn((err: any, extra: any = {}) => ({
    ok: false,
    reason: "threw",
    error: String(err && err.message),
    ...extra,
  }));
  return { handlers, safeHandle, threwResponse };
}

describe("funds IPC contract", () => {
  let mod: any;

  beforeEach(() => {
    loadAll.mockClear();
    mod = freshModule();
  });

  afterEach(() => {
    for (const p of [
      electronPath,
      registerPath,
      fundStorePath,
      fundHistoryPath,
      httpClientPath,
    ]) delete require.cache[p];
  });

  it("注册全部 16 个 funds:* channel", () => {
    const { handlers, safeHandle, threwResponse } = collect();
    mod.registerFundsHandlers({
      safeHandle,
      threwResponse,
      fundScheduler: () => null,
    });
    for (const ch of EXPECTED) {
      expect(handlers[ch], ch).toBeDefined();
    }
    const registered = safeHandle.mock.calls.map((c: any[]) => c[0]);
    expect(registered.sort()).toEqual([...EXPECTED].sort());
  });

  it("funds:list 返回 loadAll 快照", async () => {
    loadAll.mockReturnValue({ holdings: [{ id: "f1" }], deletedIds: [] });
    const { handlers, safeHandle, threwResponse } = collect();
    mod.registerFundsHandlers({ safeHandle, threwResponse, fundScheduler: () => null });
    const r = await handlers["funds:list"]({});
    expect(r.ok).toBe(true);
    expect(r.holdings).toHaveLength(1);
  });

  it("funds:add 调 fundStore.add 并触发 scheduler.fetchNow", async () => {
    add.mockReturnValue({ holding: { id: "n1" }, all: { holdings: [{ id: "n1" }] } });
    const fetchNow = vi.fn().mockResolvedValue(undefined);
    const { handlers, safeHandle, threwResponse } = collect();
    mod.registerFundsHandlers({
      safeHandle,
      threwResponse,
      fundScheduler: () => ({ fetchNow }),
    });
    const r = await handlers["funds:add"]({}, { code: "000001", name: "测试" });
    expect(add).toHaveBeenCalled();
    expect(fetchNow).toHaveBeenCalled();
    expect(r.ok).toBe(true);
    expect(r.holding.id).toBe("n1");
  });

  it("funds:nav:state 返回当前净值拉取状态", async () => {
    const { handlers, safeHandle, threwResponse } = collect();
    mod.registerFundsHandlers({
      safeHandle,
      threwResponse,
      fundScheduler: () => ({
        getState: () => ({ running: false, lastFetchAt: 0 }),
      }),
    });
    const r = await handlers["funds:nav:state"]({});
    expect(r).toHaveProperty("ok");
  });
});
