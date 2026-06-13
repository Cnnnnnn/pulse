/**
 * tests/main/error-guard.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installErrorGuard } from "../../src/main/error-guard.js";

describe("error-guard", () => {
  let sendToRenderer;
  let origUncaught;
  let origRejection;
  let listeners;

  beforeEach(() => {
    sendToRenderer = vi.fn();
    listeners = { uncaughtException: [], unhandledRejection: [] };
    origUncaught = process.listeners("uncaughtException");
    origRejection = process.listeners("unhandledRejection");
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");
  });

  afterEach(() => {
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");
    for (const fn of origUncaught) process.on("uncaughtException", fn);
    for (const fn of origRejection) process.on("unhandledRejection", fn);
  });

  function getListener(name) {
    const list = process.listeners(name);
    return list[list.length - 1];
  }

  it("installErrorGuard 注册两个监听器", () => {
    installErrorGuard(sendToRenderer);
    expect(process.listenerCount("uncaughtException")).toBeGreaterThanOrEqual(
      1,
    );
    expect(process.listenerCount("unhandledRejection")).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("uncaughtException → sendToRenderer 收到 main:error", () => {
    installErrorGuard(sendToRenderer);
    const fn = getListener("uncaughtException");
    const err = new Error("boom");
    fn(err);
    expect(sendToRenderer).toHaveBeenCalledTimes(1);
    const [channel, payload] = sendToRenderer.mock.calls[0];
    expect(channel).toBe("main:error");
    expect(payload.message).toBe("boom");
    expect(payload.kind).toBe("uncaughtException");
  });

  it("unhandledRejection → 包装成 Error 再报", () => {
    installErrorGuard(sendToRenderer);
    const fn = getListener("unhandledRejection");
    fn("string reason");
    expect(sendToRenderer).toHaveBeenCalledTimes(1);
    const payload = sendToRenderer.mock.calls[0][1];
    expect(payload.message).toBe("string reason");
    expect(payload.kind).toBe("unhandledRejection");
  });

  it("同一对象只报一次 (去重)", () => {
    installErrorGuard(sendToRenderer);
    const fn = getListener("uncaughtException");
    const err = new Error("once");
    fn(err);
    fn(err);
    expect(sendToRenderer).toHaveBeenCalledTimes(1);
  });

  it("sendToRenderer 缺省时不抛", () => {
    installErrorGuard();
    const fn = getListener("uncaughtException");
    expect(() => fn(new Error("no renderer"))).not.toThrow();
  });

  it("sendToRenderer 抛错时不影响兜底", () => {
    const badSender = vi.fn(() => {
      throw new Error("renderer ipc broken");
    });
    installErrorGuard(badSender);
    const fn = getListener("uncaughtException");
    expect(() => fn(new Error("orig"))).not.toThrow();
    expect(badSender).toHaveBeenCalled();
  });
});
