/**
 * tests/main/register-config-portability.test.js
 *
 * P61 Task 2: config:export / import-load / import-apply IPC.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const stateStorePath = require.resolve("../../src/main/state-store.ts");
const registerPath = require.resolve(
  "../../src/main/ipc/register-config-portability.ts",
);

const load = vi.fn(() => null);
const saveWatchlist = vi.fn();
const saveAiPrompts = vi.fn();
const patchState = vi.fn();

function stubModules() {
  vi.resetModules();
  const real = require(stateStorePath);
  require.cache[stateStorePath] = {
    id: stateStorePath,
    filename: stateStorePath,
    loaded: true,
    exports: { ...real, load, saveWatchlist, saveAiPrompts, patchState },
  };
}

function loadHandlers(dialogMock) {
  delete require.cache[registerPath];
  const { registerConfigPortabilityHandlers } = require(registerPath);
  const handlers = {};
  const safeHandle = (ch, fn) => {
    handlers[ch] = fn;
  };
  registerConfigPortabilityHandlers({ safeHandle, dialog: dialogMock });
  return handlers;
}

describe("register-config-portability IPC", () => {
  beforeEach(() => {
    load.mockReturnValue(null);
    saveWatchlist.mockReset();
    saveAiPrompts.mockReset();
    patchState.mockReset();
    stubModules();
  });

  describe("config:export", () => {
    it("写 Desktop 并返回 path", async () => {
      load.mockReturnValue({
        watchlist: [{ type: "app", ref: "X" }],
        reminders: [],
        funds: null,
        ai_prompts: null,
      });
      const handlers = loadHandlers(null);
      const r = await handlers["config:export"]({}, "2.46.0");
      expect(r.ok).toBe(true);
      expect(r.path).toMatch(/pulse-config-.*\.json$/);
      // 清理
      try { fs.unlinkSync(r.path); } catch {}
    });

    it("state 为 null 也能导出 (字段全 null)", async () => {
      load.mockReturnValue(null);
      const handlers = loadHandlers(null);
      const r = await handlers["config:export"]({}, "1.0");
      expect(r.ok).toBe(true);
      try { fs.unlinkSync(r.path); } catch {}
    });
  });

  describe("config:import-load", () => {
    it("用户取消选文件 → ok:false reason:cancelled", async () => {
      const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: true })) };
      const handlers = loadHandlers(dialog);
      const r = await handlers["config:import-load"]({});
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("cancelled");
    });

    it("读合法文件 → 返回 diff + fields + filePath", async () => {
      const tmp = path.join(os.tmpdir(), `p61-${Date.now()}.json`);
      fs.writeFileSync(tmp, JSON.stringify({
        schemaVersion: 1,
        fields: {
          watchlist: [{ type: "app", ref: "Y" }],
          reminders: null,
          funds: null,
          ai_prompts: null,
        },
      }));
      const dialog = {
        showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [tmp] })),
      };
      load.mockReturnValue({ watchlist: [], reminders: null, funds: null, ai_prompts: null });
      const handlers = loadHandlers(dialog);
      const r = await handlers["config:import-load"]({});
      expect(r.ok).toBe(true);
      expect(Array.isArray(r.diff)).toBe(true);
      expect(r.fields.watchlist).toEqual([{ type: "app", ref: "Y" }]);
      expect(r.filePath).toBe(tmp);
      fs.unlinkSync(tmp);
    });

    it("非法 schema → 透传 reason", async () => {
      const tmp = path.join(os.tmpdir(), `p61-bad-${Date.now()}.json`);
      fs.writeFileSync(tmp, JSON.stringify({ schemaVersion: 99, fields: {} }));
      const dialog = {
        showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [tmp] })),
      };
      const handlers = loadHandlers(dialog);
      const r = await handlers["config:import-load"]({});
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("bad_schema");
      fs.unlinkSync(tmp);
    });

    it("无 dialog → no_dialog", async () => {
      const handlers = loadHandlers(null);
      const r = await handlers["config:import-load"]({});
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("no_dialog");
    });
  });

  describe("config:import-apply", () => {
    it("空选中 → ok:false reason:no_selection", async () => {
      const handlers = loadHandlers(null);
      const r = await handlers["config:import-apply"]({}, { fields: {} });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("no_selection");
    });

    it("选中 watchlist → 调用 saveWatchlist", async () => {
      const handlers = loadHandlers(null);
      const r = await handlers["config:import-apply"]({}, {
        fields: { watchlist: [{ type: "app", ref: "Z" }] },
      });
      expect(r.ok).toBe(true);
      expect(r.applied).toContain("watchlist");
      expect(saveWatchlist).toHaveBeenCalledWith([{ type: "app", ref: "Z" }]);
    });

    it("选中 reminders/funds → 走 patchState (绕开 reminders.js 竞态, 完整恢复 funds)", async () => {
      const handlers = loadHandlers(null);
      const r = await handlers["config:import-apply"]({}, {
        fields: {
          reminders: [{ id: "r1" }],
          funds: { holdings: [{ code: "1" }], navSource: "eastmoney" },
        },
      });
      expect(r.ok).toBe(true);
      expect(r.applied).toEqual(expect.arrayContaining(["reminders", "funds"]));
      // patchState 应被调用两次 (reminders + funds)
      expect(patchState.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("选中 ai_prompts → 调用 saveAiPrompts", async () => {
      const handlers = loadHandlers(null);
      const r = await handlers["config:import-apply"]({}, {
        fields: { ai_prompts: { digest: { system: "s" } } },
      });
      expect(r.ok).toBe(true);
      expect(saveAiPrompts).toHaveBeenCalled();
    });
  });
});
