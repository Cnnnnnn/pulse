/**
 * tests/main/register-token-budget.test.js
 *
 * P71 Task 5: token-budget:get / token-budget:set IPC.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const stateStorePath = require.resolve("../../src/main/state-store.ts");
const registerPath = require.resolve(
  "../../src/main/ipc/register-token-budget.ts",
);

const loadTokenBudgetConfig = vi.fn(() => ({ dailyLimit: 0, mode: "warn" }));
const loadTokenSpend = vi.fn(() => ({}));
const saveTokenBudgetConfig = vi.fn();

function stubModules() {
  vi.resetModules();
  const real = require(stateStorePath);
  require.cache[stateStorePath] = {
    id: stateStorePath,
    filename: stateStorePath,
    loaded: true,
    exports: {
      ...real,
      loadTokenBudgetConfig,
      loadTokenSpend,
      saveTokenBudgetConfig,
    },
  };
}

function loadHandlers() {
  delete require.cache[registerPath];
  const { registerTokenBudgetHandlers } = require(registerPath);
  const handlers = {};
  const safeHandle = (ch, fn) => {
    handlers[ch] = fn;
  };
  registerTokenBudgetHandlers({ safeHandle });
  return handlers;
}

describe("register-token-budget IPC", () => {
  beforeEach(() => {
    loadTokenBudgetConfig.mockReturnValue({ dailyLimit: 0, mode: "warn" });
    loadTokenSpend.mockReturnValue({});
    saveTokenBudgetConfig.mockReset();
    stubModules();
  });

  it("token-budget:get 返回 config + todaySpend", async () => {
    const { todayKey } = require("../../src/main/token-budget");
    loadTokenBudgetConfig.mockReturnValue({ dailyLimit: 5000, mode: "warn" });
    loadTokenSpend.mockReturnValue({ [todayKey()]: 300 });
    const handlers = loadHandlers();

    const r = await handlers["token-budget:get"]({});
    expect(r.ok).toBe(true);
    expect(r.config.dailyLimit).toBe(5000);
    expect(r.config.mode).toBe("warn");
    expect(r.todaySpend).toBe(300);
  });

  it("token-budget:set 写入合法 config", async () => {
    const handlers = loadHandlers();
    const r = await handlers["token-budget:set"]({}, {
      dailyLimit: 9999,
      mode: "block",
    });
    expect(r.ok).toBe(true);
    expect(saveTokenBudgetConfig).toHaveBeenCalledWith({
      dailyLimit: 9999,
      mode: "block",
    });
  });

  it("token-budget:set 非法 mode → invalid_args", async () => {
    const handlers = loadHandlers();
    const r = await handlers["token-budget:set"]({}, {
      dailyLimit: 100,
      mode: "weird",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_args");
    expect(saveTokenBudgetConfig).not.toHaveBeenCalled();
  });

  it("token-budget:set 负数 dailyLimit → invalid_args", async () => {
    const handlers = loadHandlers();
    const r = await handlers["token-budget:set"]({}, {
      dailyLimit: -1,
      mode: "warn",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_args");
  });

  it("token-budget:set dailyLimit=0 合法 (表示不限制)", async () => {
    const handlers = loadHandlers();
    const r = await handlers["token-budget:set"]({}, {
      dailyLimit: 0,
      mode: "warn",
    });
    expect(r.ok).toBe(true);
  });
});
