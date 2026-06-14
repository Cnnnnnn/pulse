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

describe("error-guard suppressed errors (v2.16)", () => {
  let sendToRenderer;
  let origUncaught;
  let origRejection;

  beforeEach(() => {
    sendToRenderer = vi.fn();
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

  it("EPIPE (有 code) → 不推 renderer, 但仍去重", () => {
    installErrorGuard(sendToRenderer);
    const fn = getListener("uncaughtException");
    const err = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    fn(err);
    fn(err);
    expect(sendToRenderer).not.toHaveBeenCalled();
  });

  it("write EPIPE (无 code, node internal 错误) → 也不推", () => {
    installErrorGuard(sendToRenderer);
    const fn = getListener("uncaughtException");
    // 真实场景: node:internal/console/constructor 抛的错没 code 字段
    const err = new Error("write EPIPE");
    fn(err);
    expect(sendToRenderer).not.toHaveBeenCalled();
  });

  it("ERR_STREAM_DESTROYED / ERR_IPC_CHANNEL_CLOSED → 也不推", () => {
    installErrorGuard(sendToRenderer);
    const fn = getListener("uncaughtException");
    fn(Object.assign(new Error("x"), { code: "ERR_STREAM_DESTROYED" }));
    fn(Object.assign(new Error("y"), { code: "ERR_IPC_CHANNEL_CLOSED" }));
    expect(sendToRenderer).not.toHaveBeenCalled();
  });

  it("非 suppressed 错误仍正常推 (回归测试)", () => {
    installErrorGuard(sendToRenderer);
    const fn = getListener("uncaughtException");
    fn(new Error("real bug"));
    expect(sendToRenderer).toHaveBeenCalledTimes(1);
    expect(sendToRenderer.mock.calls[0][0]).toBe("main:error");
  });

  it("unhandledRejection 路径上 EPIPE 也被过滤", () => {
    installErrorGuard(sendToRenderer);
    const fn = getListener("unhandledRejection");
    const err = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    fn(err);
    expect(sendToRenderer).not.toHaveBeenCalled();
  });
});
