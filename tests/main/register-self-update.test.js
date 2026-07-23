/**
 * tests/main/register-self-update.test.js
 *
 * P52 Task 3: register-self-update IPC. controller 注入测试.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const registerPath = require.resolve(
  "../../src/main/ipc/register-self-update.ts",
);

function loadHandlers(controller, safeHandle) {
  // reset module cache 让多次 load 拿到 fresh
  delete require.cache[registerPath];
  const { registerSelfUpdateHandlers } = require(registerPath);
  const handlers = {};
  const sh =
    safeHandle ||
    ((ch, fn) => {
      handlers[ch] = fn;
    });
  registerSelfUpdateHandlers({ safeHandle: sh, controller });
  return handlers;
}

describe("register-self-update IPC", () => {
  it("self-update:get-state 返当前 state", async () => {
    const controller = {
      getState: vi.fn(() => ({
        status: "downloaded",
        version: "2.47.0",
        readyToInstall: true,
        available: true,
      })),
    };
    const handlers = loadHandlers(controller);
    const r = await handlers["self-update:get-state"]({});
    expect(r.ok).toBe(true);
    expect(r.state.version).toBe("2.47.0");
    expect(r.state.readyToInstall).toBe(true);
  });

  it("self-update:check 调 controller.checkNow", async () => {
    const controller = { checkNow: vi.fn(async () => ({ ok: true })) };
    const handlers = loadHandlers(controller);
    const r = await handlers["self-update:check"]({});
    expect(r.ok).toBe(true);
    expect(controller.checkNow).toHaveBeenCalledTimes(1);
  });

  it("self-update:check 失败 → 返 ok=false + reason=threw", async () => {
    const controller = {
      checkNow: vi.fn(async () => {
        throw new Error("网络失败");
      }),
    };
    const handlers = loadHandlers(controller);
    const r = await handlers["self-update:check"]({});
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("threw");
  });

  it("self-update:install 调 controller.quitAndInstall", async () => {
    const controller = { quitAndInstall: vi.fn() };
    const handlers = loadHandlers(controller);
    const r = await handlers["self-update:install"]({});
    expect(r.ok).toBe(true);
    expect(controller.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it("无 controller → 不注册任何 handler (renderer 自然 fallback)", () => {
    const handlers = loadHandlers(null);
    expect(Object.keys(handlers)).toEqual([]);
  });

  it("controller 缺某个方法 → handler 注册但返 not-implemented", async () => {
    // 部分 controller: 只有 checkNow, 没有 getState / quitAndInstall
    const controller = { checkNow: vi.fn(async () => ({ ok: true })) };
    const handlers = loadHandlers(controller);
    expect(typeof handlers["self-update:check"]).toBe("function");
    // check 能调
    const r1 = await handlers["self-update:check"]({});
    expect(r1.ok).toBe(true);
    // get-state 缺方法 → not-implemented
    const r2 = await handlers["self-update:get-state"]({});
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe("not-implemented");
    // install 缺方法 → not-implemented
    const r3 = await handlers["self-update:install"]({});
    expect(r3.ok).toBe(false);
    expect(r3.reason).toBe("not-implemented");
  });

  it("get-state 抛 → 返 ok=false reason=threw", async () => {
    const controller = {
      getState: vi.fn(() => {
        throw new Error("boom");
      }),
    };
    const handlers = loadHandlers(controller);
    const r = await handlers["self-update:get-state"]({});
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("threw");
  });

  it("install 抛 → 返 ok=false reason=threw", async () => {
    const controller = {
      quitAndInstall: vi.fn(() => {
        throw new Error("gatekeeper 拦了");
      }),
    };
    const handlers = loadHandlers(controller);
    const r = await handlers["self-update:install"]({});
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("threw");
  });

  it("safeHandle 不是函数 → 静默 return, 不抛", () => {
    delete require.cache[registerPath];
    const { registerSelfUpdateHandlers } = require(registerPath);
    expect(() =>
      registerSelfUpdateHandlers({
        safeHandle: null,
        controller: { getState: () => ({}) },
      }),
    ).not.toThrow();
  });
});
