/**
 * tests/main/ipc/register-vault.test.ts
 *
 * 密钥库 IPC 契约：channel 注册齐全 + 参数校验 + 返回形状。
 * 业务逻辑（加密/Keychain）在 tests/main/vault/secret-vault.test.ts。
 *
 * 沿用 register-open-url 的 require.cache stub 模式。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { requireMain, mainArtifactPath } = require("../../_setup/require-main.cjs");

const listEntries = vi.fn();
const setEntry = vi.fn();
const deleteEntry = vi.fn();
const revealEntry = vi.fn();
const copyEntry = vi.fn();
const exportVaultToFile = vi.fn();
const loadVaultImportFile = vi.fn();
const applyVaultImport = vi.fn();
const checkVaultExpiry = vi.fn();

const electronPath = require.resolve("electron");
const registerPath = mainArtifactPath("ipc/register-vault");
const secretVaultPath = mainArtifactPath("vault/secret-vault");
const portabilityPath = mainArtifactPath("vault/vault-portability");
const expiryPath = mainArtifactPath("vault/expiry-watch");
const timerPath = mainArtifactPath("timer-registry");
const watchlistPath = mainArtifactPath("watchlist");

const EXPECTED_CHANNELS = [
  "vault:list",
  "vault:set",
  "vault:delete",
  "vault:reveal",
  "vault:copy",
  "vault:export",
  "vault:import-load",
  "vault:import-apply",
];

function freshModule() {
  vi.resetModules();
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: { app: {}, dialog: {} },
  };
  require.cache[secretVaultPath] = {
    id: secretVaultPath,
    filename: secretVaultPath,
    loaded: true,
    exports: { listEntries, setEntry, deleteEntry, revealEntry, copyEntry },
  };
  require.cache[portabilityPath] = {
    id: portabilityPath,
    filename: portabilityPath,
    loaded: true,
    exports: { exportVaultToFile, loadVaultImportFile, applyVaultImport },
  };
  require.cache[expiryPath] = {
    id: expiryPath,
    filename: expiryPath,
    loaded: true,
    exports: { checkVaultExpiry },
  };
  require.cache[timerPath] = {
    id: timerPath,
    filename: timerPath,
    loaded: true,
    exports: { setManagedInterval: vi.fn(), clearManaged: vi.fn() },
  };
  require.cache[watchlistPath] = {
    id: watchlistPath,
    filename: watchlistPath,
    loaded: true,
    exports: { makeWatchlistSendNotification: () => vi.fn() },
  };
  return require(registerPath);
}

function collectHandlers() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const safeHandle = vi.fn((channel: string, fn: any) => {
    handlers[channel] = fn;
  });
  return { handlers, safeHandle };
}

describe("vault IPC contract", () => {
  let mod: any;

  beforeEach(() => {
    listEntries.mockReset();
    setEntry.mockReset();
    deleteEntry.mockReset();
    revealEntry.mockReset();
    copyEntry.mockReset();
    exportVaultToFile.mockReset();
    loadVaultImportFile.mockReset();
    applyVaultImport.mockReset();
    checkVaultExpiry.mockReset();
    mod = freshModule();
  });

  afterEach(() => {
    for (const p of [
      electronPath,
      registerPath,
      secretVaultPath,
      portabilityPath,
      expiryPath,
      timerPath,
      watchlistPath,
    ]) {
      delete require.cache[p];
    }
  });

  it("无 safeHandle 时不注册任何 channel", () => {
    expect(() => mod.registerVaultHandlers({})).not.toThrow();
  });

  it("注册全部 vault:* channel", () => {
    const { handlers, safeHandle } = collectHandlers();
    mod.registerVaultHandlers({ safeHandle }, { expiryWatch: false });
    for (const ch of EXPECTED_CHANNELS) {
      expect(safeHandle, `missing ${ch}`).toHaveBeenCalledWith(ch, expect.any(Function));
      expect(handlers[ch]).toBeDefined();
    }
  });

  it("vault:list 透传 listEntries 结果", async () => {
    listEntries.mockResolvedValue({ ok: true, entries: [] });
    const { handlers, safeHandle } = collectHandlers();
    mod.registerVaultHandlers({ safeHandle }, { expiryWatch: false });
    const r = await handlers["vault:list"]({});
    expect(listEntries).toHaveBeenCalled();
    expect(r).toEqual({ ok: true, entries: [] });
  });

  it("vault:set 非法 payload → invalid_payload", async () => {
    const { handlers, safeHandle } = collectHandlers();
    mod.registerVaultHandlers({ safeHandle }, { expiryWatch: false });
    const r = await handlers["vault:set"]({}, null);
    expect(r).toEqual({ ok: false, reason: "invalid_payload" });
    expect(setEntry).not.toHaveBeenCalled();
  });

  it("vault:set 合法 payload 交给 setEntry", async () => {
    setEntry.mockResolvedValue({ ok: true, id: "a1" });
    const { handlers, safeHandle } = collectHandlers();
    mod.registerVaultHandlers({ safeHandle }, { expiryWatch: false });
    const payload = { id: "a1", name: "hf", value: "tok", category: "token" };
    const r = await handlers["vault:set"]({}, payload);
    expect(setEntry).toHaveBeenCalledWith(payload);
    expect(r).toEqual({ ok: true, id: "a1" });
  });

  it("vault:delete / reveal / copy 透传 id", async () => {
    deleteEntry.mockResolvedValue({ ok: true });
    revealEntry.mockResolvedValue({ ok: true, value: "secret" });
    copyEntry.mockResolvedValue({ ok: true });
    const { handlers, safeHandle } = collectHandlers();
    mod.registerVaultHandlers({ safeHandle }, { expiryWatch: false });

    await handlers["vault:delete"]({}, "id-1");
    expect(deleteEntry).toHaveBeenCalledWith("id-1");

    await handlers["vault:reveal"]({}, "id-2");
    expect(revealEntry).toHaveBeenCalledWith("id-2");

    await handlers["vault:copy"]({}, "id-3", "Value");
    expect(copyEntry).toHaveBeenCalledWith("id-3", "Value");
  });

  it("vault:export / import-load 走 dialog 依赖", async () => {
    exportVaultToFile.mockResolvedValue({ ok: true, path: "/tmp/v.json" });
    loadVaultImportFile.mockResolvedValue({ ok: true, importId: "imp-1", preview: [] });
    const dialog = { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() };
    const { handlers, safeHandle } = collectHandlers();
    mod.registerVaultHandlers({ safeHandle, dialog }, { expiryWatch: false });

    const exp = await handlers["vault:export"]({});
    expect(exportVaultToFile).toHaveBeenCalledWith(dialog);
    expect(exp).toEqual({ ok: true, path: "/tmp/v.json" });

    const load = await handlers["vault:import-load"]({});
    expect(loadVaultImportFile).toHaveBeenCalledWith(dialog);
    expect(load.importId).toBe("imp-1");
  });

  it("vault:import-apply 透传 importId", async () => {
    applyVaultImport.mockResolvedValue({ ok: true, imported: 2 });
    const { handlers, safeHandle } = collectHandlers();
    mod.registerVaultHandlers({ safeHandle }, { expiryWatch: false });
    const r = await handlers["vault:import-apply"]({}, "imp-9");
    expect(applyVaultImport).toHaveBeenCalledWith("imp-9");
    expect(r).toEqual({ ok: true, imported: 2 });
  });

  it("expiryWatch:false 时不挂 setManagedInterval", () => {
    const setManagedInterval = require.cache[timerPath].exports.setManagedInterval;
    setManagedInterval.mockClear();
    const { safeHandle } = collectHandlers();
    mod.registerVaultHandlers({ safeHandle }, { expiryWatch: false });
    expect(setManagedInterval).not.toHaveBeenCalled();
  });
});
