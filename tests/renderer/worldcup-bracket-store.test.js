// @vitest-environment happy-dom
import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";

describe("bracketStore computeBracket throttling", () => {
  let computeCalls;
  let loadCalls;

  beforeEach(async () => {
    // 每个 test 重新 import 以重置模块级 lastAutoComputeAt
    vi.resetModules();
    computeCalls = 0;
    loadCalls = 0;
    global.window = {
      api: {
        worldcupComputeBracket: vi.fn(async () => {
          computeCalls += 1;
          return { ok: true, snapshot: { version: 1, computedAt: Date.now() } };
        }),
        worldcupLoadBracket: vi.fn(async () => {
          loadCalls += 1;
          return { ok: true, snapshot: null };
        }),
      },
    };
  });

  afterEach(() => {
    delete global.window;
  });

  test("first compute call hits IPC", async () => {
    const { computeBracket } = await import("../../src/renderer/worldcup/bracketStore.js");
    const ok = await computeBracket();
    expect(ok).toBe(true);
    expect(computeCalls).toBe(1);
  });

  test("second call within 30s is throttled (returns false, no IPC)", async () => {
    const { computeBracket } = await import("../../src/renderer/worldcup/bracketStore.js");
    await computeBracket();
    expect(computeCalls).toBe(1);
    const ok2 = await computeBracket();
    expect(ok2).toBe(false);
    expect(computeCalls).toBe(1); // 没增加
  });

  test("force=true bypasses throttle", async () => {
    const { computeBracket } = await import("../../src/renderer/worldcup/bracketStore.js");
    await computeBracket();
    expect(computeCalls).toBe(1);
    const ok2 = await computeBracket({ force: true });
    expect(ok2).toBe(true);
    expect(computeCalls).toBe(2);
  });

  test("after 30s the next compute is allowed again", async () => {
    const { computeBracket } = await import("../../src/renderer/worldcup/bracketStore.js");
    await computeBracket();
    expect(computeCalls).toBe(1);
    // 模拟时间快进 31s
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31_000);
    const ok2 = await computeBracket();
    vi.useRealTimers();
    expect(ok2).toBe(true);
    expect(computeCalls).toBe(2);
  });

  test("loadBracket does not touch compute IPC", async () => {
    const { loadBracket } = await import("../../src/renderer/worldcup/bracketStore.js");
    await loadBracket();
    expect(loadCalls).toBe(1);
    expect(computeCalls).toBe(0);
  });
});
