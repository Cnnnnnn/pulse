/**
 * tests/main/ipc/register-concerts.test.ts
 *
 * 演出票 IPC 契约：6 个 channel + load/refresh 基本形状。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mainArtifactPath } = require("../../_setup/require-main.cjs");

const loadSnapshot = vi.fn();
const refresh = vi.fn();
const addWatch = vi.fn();
const removeWatch = vi.fn();
const setWatchedTiers = vi.fn();
const listTiers = vi.fn();

const electronPath = require.resolve("electron");
const registerPath = mainArtifactPath("ipc/register-concerts");
const cachePath = mainArtifactPath("concerts/cache");
const watchPath = mainArtifactPath("concerts/watch-store");
const piaoniuPath = mainArtifactPath("concerts/fetcher-piaoniu");
const moreticketsPath = mainArtifactPath("concerts/fetcher-moretickets");
const motianlunPath = mainArtifactPath("concerts/fetcher-motianlun");
const alertsPath = mainArtifactPath("concerts/price-alerts");
const statePath = mainArtifactPath("state-store");
const logPath = mainArtifactPath("log");
const timerPath = mainArtifactPath("timer-registry");
const httpClientPath = mainArtifactPath("http-client");

const EXPECTED = [
  "concerts:load",
  "concerts:refresh",
  "concerts:add",
  "concerts:remove",
  "concerts:setWatchedTiers",
  "concerts:tiers",
];

function stub(p: string, exports: any) {
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}

function freshModule() {
  vi.resetModules();
  stub(electronPath, { app: { getPath: () => "/tmp" }, Notification: { isSupported: () => false } });
  stub(logPath, {
    mainLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() },
    createLogger: () => ({}),
  });
  stub(timerPath, { setManagedInterval: vi.fn(() => 1), clearManaged: vi.fn() });
  stub(statePath, { load: () => ({ apps: {} }), patchState: vi.fn() });
  stub(httpClientPath, { HttpClient: class {} });
  stub(piaoniuPath, {
    fetchPiaoniuActivity: vi.fn(),
    fetchPiaoniuTiers: vi.fn(),
  });
  stub(moreticketsPath, { fetchMoreticketsTour: vi.fn() });
  stub(motianlunPath, { fetchMotianlunShow: vi.fn() });
  stub(alertsPath, {
    detectConcertPriceDrops: vi.fn(() => []),
    formatConcertDropNotification: vi.fn(() => []),
  });
  stub(cachePath, {
    createConcertsCache: () => ({
      load: loadSnapshot,
      refresh,
      addAndFetch: vi.fn(),
      syncWatches: vi.fn(),
      ttl: () => 120000,
      emptySnapshot: { ok: true, watches: [], sessions: [] },
    }),
    createFilePersist: () => ({ read: () => null, write: vi.fn() }),
  });
  stub(watchPath, {
    createConcertWatchlist: () => ({
      list: () => [],
      add: addWatch,
      remove: removeWatch,
      setWatchedTiers,
      getTiers: listTiers,
    }),
  });
  return require(registerPath);
}

function collect() {
  const handlers: Record<string, (...a: any[]) => any> = {};
  const safeHandle = vi.fn((channel: string, fn: any) => {
    handlers[channel] = fn;
  });
  return { handlers, safeHandle };
}

describe("concerts IPC contract", () => {
  let mod: any;

  beforeEach(() => {
    mod = freshModule();
  });

  afterEach(() => {
    for (const p of [
      electronPath,
      registerPath,
      cachePath,
      watchPath,
      piaoniuPath,
      moreticketsPath,
      motianlunPath,
      alertsPath,
      statePath,
      logPath,
      timerPath,
      httpClientPath,
    ]) delete require.cache[p];
  });

  it("注册全部 concerts:* channel", () => {
    const { handlers, safeHandle } = collect();
    mod.registerConcertsHandlers({
      safeHandle,
      sendToRenderer: vi.fn(),
      getConfig: () => ({}),
    });
    for (const ch of EXPECTED) {
      expect(safeHandle, `missing ${ch}`).toHaveBeenCalledWith(ch, expect.any(Function));
      expect(handlers[ch], ch).toBeDefined();
    }
  });

  it("UPDATED_CHANNEL 为 concerts:updated", () => {
    expect(mod.UPDATED_CHANNEL).toBe("concerts:updated");
  });

  it("concerts:load 返回 cache.load 快照", async () => {
    loadSnapshot.mockReturnValue({ ok: true, watches: [{ id: "w1" }], sessions: [] });
    const { handlers, safeHandle } = collect();
    mod.registerConcertsHandlers({
      safeHandle,
      sendToRenderer: vi.fn(),
      getConfig: () => ({}),
    });
    const r = await handlers["concerts:load"]({});
    expect(r.ok).toBe(true);
    expect(r.watches).toHaveLength(1);
  });
});
