/**
 * tests/main/register-core-watchlist.test.js
 *
 * 2026-06-23: I2 v1 — IPC handler 单元测试
 *   - watchlist:list / add / remove
 *   - 覆盖: 正常路径 / 幂等 add / 异常路径 (save throw) / 非法 appName
 *
 * Mocking 策略 (跟 register-core-diagnostics.test.js 一致):
 *   - electron require.cache stub (vitest vi.mock('electron') 在 vite module
 *     graph 下不稳, 用 require.cache + vi.resetModules)
 *   - state-store mock via require.cache (control mockWatchlist directly)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

// ─── electron stub ───────────────────────────────────────────────
const handlers = new Map();
const mockHandle = vi.fn((name, fn) => handlers.set(name, fn));
const electronStub = {
  ipcMain: { handle: mockHandle },
  Notification: class {
    static isSupported() {
      return false;
    }
  },
};
const electronPath = require.resolve("electron");

// ─── state-store mock ───────────────────────────────────────────
let mockWatchlist = [];
let saveShouldThrow = false;
const stateStoreStub = {
  loadWatchlist: () => {
    if (loadShouldThrow) throw new Error("disk full");
    return mockWatchlist.map((w) => {
      if (w && w.type) return w;
      if (w && w.appName) {
        return {
          type: "app",
          ref: w.appName,
          addedAt: w.addedAt || 0,
          lastNotifiedVersion: w.lastNotifiedVersion ?? null,
        };
      }
      return w;
    });
  },
  saveWatchlist: (list) => {
    if (saveShouldThrow) throw new Error("disk full");
    mockWatchlist = list;
  },
  watchlistItemKey: (item) =>
    `${item && item.type ? item.type : "app"}:${item && (item.ref || item.appName) ? item.ref || item.appName : ""}`,
  // 其余 stub 调用 — register-core 其它 handler 不需要, 但 import 时会拿
  load: () => ({}),
  saveAll: () => ({}),
  markNotified: () => {},
};
let loadShouldThrow = false;
const stateStorePath = mainArtifactPath("state-store");

// ─── reset + re-register ────────────────────────────────────────
let registerCoreHandlers;
function freshRegister() {
  // 重置 handlers + 注入 stubs (mockWatchlist / flags 由 caller 控制)
  handlers.clear();
  mockHandle.mockClear();
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: electronStub,
  };
  require.cache[stateStorePath] = {
    id: stateStorePath,
    filename: stateStorePath,
    loaded: true,
    exports: stateStoreStub,
  };
  // 重置 register-core 模块缓存, 让它 fresh require
  delete require.cache[mainArtifactPath("ipc/register-core")];
  ({ registerCoreHandlers } = requireMain("ipc/register-core"));
  // 传 ctx with safeHandle (since register-core reads safeHandle from ctx, not electron)
  const mockSafeHandle = vi.fn((name, fn) => handlers.set(name, fn));
  registerCoreHandlers({ safeHandle: mockSafeHandle });
}

beforeEach(() => {
  mockWatchlist = [];
  saveShouldThrow = false;
  loadShouldThrow = false;
  freshRegister();
});

describe("watchlist IPC handlers", () => {
  it("watchlist:list — returns current list", () => {
    mockWatchlist = [
      { type: "app", ref: "VSCode", addedAt: 1, lastNotifiedVersion: null },
    ];
    freshRegister();
    const h = handlers.get("watchlist:list");
    expect(h).toBeDefined();
    const r = h({});
    expect(r).toMatchObject({ ok: true });
    expect(r.items[0].ref).toBe("VSCode");
  });

  it("watchlist:list — 空 → []", () => {
    const h = handlers.get("watchlist:list");
    const r = h({});
    expect(r).toEqual({ ok: true, items: [] });
  });

  it("watchlist:add — appends new entry with addedAt", () => {
    const h = handlers.get("watchlist:add");
    const r = h({}, { appName: "Slack" });
    expect(r).toMatchObject({ ok: true });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].type).toBe("app");
    expect(r.items[0].ref).toBe("Slack");
    expect(r.items[0].addedAt).toBeGreaterThan(0);
    expect(r.items[0].lastNotifiedVersion).toBeNull();
  });

  it("watchlist:add — fund code", () => {
    const h = handlers.get("watchlist:add");
    const r = h({}, { type: "fund", ref: "000001" });
    expect(r.ok).toBe(true);
    expect(r.items[0].type).toBe("fund");
    expect(r.items[0].lastNotifiedNav).toBeNull();
  });

  it("watchlist:add — keyword", () => {
    const h = handlers.get("watchlist:add");
    const r = h({}, { type: "keyword", ref: "苹果" });
    expect(r.ok).toBe(true);
    expect(r.items[0].type).toBe("keyword");
  });

  it("watchlist:add — 幂等 (同名 add 不重复)", () => {
    const h = handlers.get("watchlist:add");
    h({}, { appName: "VSCode" });
    const r2 = h({}, { appName: "VSCode" });
    expect(r2.ok).toBe(true);
    expect(r2.items).toHaveLength(1);
  });

  it("watchlist:add — 空字符串 → ok:false invalid_payload", () => {
    const h = handlers.get("watchlist:add");
    expect(h({}, { appName: "" })).toEqual({
      ok: false,
      reason: "invalid_payload",
    });
  });

  it("watchlist:add — null payload → ok:false invalid_payload", () => {
    const h = handlers.get("watchlist:add");
    expect(h({}, null)).toEqual({ ok: false, reason: "invalid_payload" });
  });

  it("watchlist:add — 非字符串 appName → ok:false", () => {
    const h = handlers.get("watchlist:add");
    expect(h({}, { appName: 42 })).toEqual({
      ok: false,
      reason: "invalid_payload",
    });
  });

  it("watchlist:remove — 过滤目标", () => {
    mockWatchlist = [
      { type: "app", ref: "VSCode", addedAt: 1, lastNotifiedVersion: null },
      { type: "app", ref: "Slack", addedAt: 2, lastNotifiedVersion: null },
    ];
    freshRegister();
    const h = handlers.get("watchlist:remove");
    const r = h({}, { appName: "VSCode" });
    expect(r.ok).toBe(true);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].ref).toBe("Slack");
  });

  it("watchlist:remove — 非法 payload → ok:false", () => {
    const h = handlers.get("watchlist:remove");
    expect(h({}, { appName: 42 })).toEqual({
      ok: false,
      reason: "invalid_payload",
    });
  });

  it("watchlist:remove — 不存在 → ok:true, items 空", () => {
    const h = handlers.get("watchlist:remove");
    const r = h({}, { appName: "NotPinned" });
    expect(r.ok).toBe(true);
    expect(r.items).toEqual([]);
  });

  it("watchlist:list — load 抛错 → ok:false, reason:load_failed", () => {
    loadShouldThrow = true;
    freshRegister();
    const h = handlers.get("watchlist:list");
    const r = h({});
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("load_failed");
  });

  it("watchlist:add — save 抛错 → ok:false, reason:save_failed", () => {
    saveShouldThrow = true;
    const h = handlers.get("watchlist:add");
    const r = h({}, { appName: "VSCode" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("save_failed");
  });

  it("watchlist:add — metal 合法 id", () => {
    const h = handlers.get("watchlist:add");
    const r = h({}, { type: "metal", ref: "XAU" });
    expect(r.ok).toBe(true);
    expect(r.items.some((w) => w.type === "metal" && w.ref === "XAU")).toBe(
      true,
    );
    expect(r.items.find((w) => w.ref === "XAU").lastNotifiedPrice).toBe(null);
  });

  it("watchlist:add — metal 非法 id → invalid_metal_id", () => {
    const h = handlers.get("watchlist:add");
    const r = h({}, { type: "metal", ref: "INVALID" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_metal_id");
  });
});
