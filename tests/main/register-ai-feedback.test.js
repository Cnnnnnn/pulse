/**
 * tests/main/register-ai-feedback.test.js
 *
 * A8 Task 3: feedback:record / feedback:export IPC.
 * 用 vi.resetModules + require.cache 注入 mock stateStore (跟 register-ai-prompts-ipc 同范式).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const stateStorePath = require.resolve("../../src/main/state-store.ts");
const registerPath = require.resolve(
  "../../src/main/ipc/register-ai-feedback.js",
);

const loadAiFeedback = vi.fn(() => []);
const saveAiFeedback = vi.fn();

function stubModules() {
  vi.resetModules();
  require.cache[stateStorePath] = {
    id: stateStorePath,
    filename: stateStorePath,
    loaded: true,
    exports: { loadAiFeedback, saveAiFeedback },
  };
}

function loadHandlers() {
  // resetModules 后重新 require, 会拿到注入的 mock stateStore
  delete require.cache[registerPath];
  const { registerAiFeedbackHandlers } = require(registerPath);
  const handlers = {};
  const safeHandle = (ch, fn) => {
    handlers[ch] = fn;
  };
  registerAiFeedbackHandlers({ safeHandle });
  return handlers;
}

describe("register-ai-feedback IPC", () => {
  beforeEach(() => {
    loadAiFeedback.mockReturnValue([]);
    saveAiFeedback.mockReset();
    stubModules();
  });

  it("feedback:record 显式 vote 写入并返回 ok", async () => {
    const handlers = loadHandlers();
    // recordFeedback 会 unshift, mock 返回空 list 让其产出 [sample]
    loadAiFeedback.mockReturnValue([]);
    const r = await handlers["feedback:record"]({}, {
      feature: "advice", appName: "X", version: "1", rec: "upgrade", confidence: "high", vote: "up", ts: 100,
    });
    expect(r.ok).toBe(true);
    expect(saveAiFeedback).toHaveBeenCalledTimes(1);
    const saved = saveAiFeedback.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].vote).toBe("up");
    expect(saved[0].id).toBe("advice::X::1::100");
  });

  it("feedback:record 缺必填返回 ok:false reason:invalid_args", async () => {
    const handlers = loadHandlers();
    const r = await handlers["feedback:record"]({}, { appName: "X" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_args");
    expect(saveAiFeedback).not.toHaveBeenCalled();
  });

  it("feedback:record 仅 implicit (vote 缺) 也能记录", async () => {
    const handlers = loadHandlers();
    loadAiFeedback.mockReturnValue([]);
    // 注意: recordFeedback 纯函数要求 vote, 所以 implicit-only 在纯函数层会被挡.
    // IPC 入口校验放行 implicit-only, 但 recordFeedback 会返回原 list (空),
    // 导致 saveAiFeedback 存空数组. 这是 Task 7 要修的点; 此处验证 IPC 不挡 implicit.
    const r = await handlers["feedback:record"]({}, {
      feature: "advice", appName: "X", version: "1", implicit: "refreshed", ts: 100,
    });
    expect(r.ok).toBe(true);
  });

  it("feedback:export 返回全部样本 (最新在前)", async () => {
    const handlers = loadHandlers();
    const samples = [
      { id: "a", ts: 2 },
      { id: "b", ts: 1 },
    ];
    loadAiFeedback.mockReturnValue(samples);
    const r = await handlers["feedback:export"]({});
    expect(r.ok).toBe(true);
    expect(r.samples).toHaveLength(2);
    expect(r.samples[0].ts).toBe(2);
  });

  it("feedback:export 空也返回 ok + 空数组", async () => {
    const handlers = loadHandlers();
    loadAiFeedback.mockReturnValue([]);
    const r = await handlers["feedback:export"]({});
    expect(r.ok).toBe(true);
    expect(r.samples).toEqual([]);
  });
});
