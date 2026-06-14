/**
 * tests/renderer/check-store.test.js
 *
 * check-store 行为 — TDD lock:
 * - startCheck 后, 任何先前 init 过的 app phase signal (但不在新 appNames 里)
 *   应被清回 "idle" (或删除), 不应留在 "pending" 状态, 否则 stale UI 显示 loading.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

async function freshModule() {
  vi.resetModules();
  return await import("../../src/renderer/store/check-store.js");
}

beforeEach(() => {
  vi.resetModules();
});

describe("check-store stale phase signal cleanup", () => {
  it("app not in next startCheck resets to idle (not stuck pending)", async () => {
    const m = await freshModule();
    const { startCheck, getAppPhaseSignal, appPhases, getAppPhase } = m;

    // 1. 第一次 check 3 个 app, 全部 done
    startCheck(["A", "B", "C"]);
    expect(getAppPhaseSignal("A").value).toBe("pending");
    expect(getAppPhaseSignal("B").value).toBe("pending");
    expect(getAppPhaseSignal("C").value).toBe("pending");
    // 模拟都跑完
    const sigA = getAppPhaseSignal("A");
    sigA.value = "done";

    // 2. 第二次 check 只 1 个 app (B) — 比如用户禁用/卸载了 A, C
    startCheck(["B"]);

    // B: pending (新 check 启动)
    expect(getAppPhaseSignal("B").value).toBe("pending");
    // A, C: 应该被清回 "idle" (或被删除), 绝不能停留在 "done" 或 "pending"
    // 当前实现: A 还是 "done" (因为没被 startCheck loop 改), 但 line 75-77 是
    //   for (const sig of appPhaseSignals.values()) sig.value = "pending";
    //   这会把 A 改成 "pending" — 跟新 phases 脱节, 显示 stale loading.
    expect(getAppPhaseSignal("A").value).not.toBe("pending");
    expect(getAppPhaseSignal("C").value).not.toBe("pending");
  });

  it("appPhases.value only contains new appNames after startCheck", async () => {
    const m = await freshModule();
    const { startCheck, appPhases } = m;
    startCheck(["A", "B"]);
    expect([...appPhases.value.keys()].sort()).toEqual(["A", "B"]);
    startCheck(["C"]);
    expect([...appPhases.value.keys()]).toEqual(["C"]);
  });

  it("getAppPhase reads current session's phase for apps in this check", async () => {
    const m = await freshModule();
    const { startCheck, getAppPhase } = m;
    startCheck(["A"]);
    expect(getAppPhase("A")).toBe("pending");
    expect(getAppPhase("NotInCheck")).toBe("idle");
  });

  it("startCheck assigns fresh session id", async () => {
    const m = await freshModule();
    const { startCheck, checkSession } = m;
    const id1 = startCheck(["A"]);
    const id2 = startCheck(["A"]);
    expect(id1).not.toBe(id2);
    expect(checkSession.value.id).toBe(id2);
    expect(checkSession.value.phase).toBe("running");
  });

  it("startCheck resets finishedAt, error, appOrder", async () => {
    const m = await freshModule();
    const { startCheck, finishCheck, setError, checkSession } = m;
    startCheck(["A"]);
    setError("boom");
    expect(checkSession.value.error).toBe("boom");
    expect(checkSession.value.phase).toBe("error");
    startCheck(["A", "B"]);
    expect(checkSession.value.error).toBe(null);
    expect(checkSession.value.finishedAt).toBe(null);
    expect(checkSession.value.phase).toBe("running");
    expect(checkSession.value.appOrder).toEqual(["A", "B"]);
  });

  it("applyProgress with stale sessionId is ignored", async () => {
    const m = await freshModule();
    const { startCheck, applyProgress, getAppPhaseSignal } = m;
    const id1 = startCheck(["A"]);
    const id2 = startCheck(["A"]);
    // 用 id1 推 progress → 应当被丢弃
    applyProgress({ name: "A", status: "ok", version: "1.0" }, id1);
    // B 仍应是 pending (没被推进)
    expect(getAppPhaseSignal("A").value).toBe("pending");
  });

  it("applyProgress advances phase and stores result", async () => {
    const m = await freshModule();
    const { startCheck, applyProgress, getAppPhaseSignal, results } = m;
    const sid = startCheck(["A"]);
    applyProgress({ name: "A", status: "ok", version: "1.0" }, sid);
    expect(getAppPhaseSignal("A").value).toBe("done");
    expect(results.value.get("A").version).toBe("1.0");
  });

  it("applyProgress on error result sets phase=error", async () => {
    const m = await freshModule();
    const { startCheck, applyProgress, getAppPhaseSignal } = m;
    const sid = startCheck(["A"]);
    applyProgress({ name: "A", status: "error", error: "boom" }, sid);
    expect(getAppPhaseSignal("A").value).toBe("error");
  });

  it("markAppDetecting advances pending → detecting", async () => {
    const m = await freshModule();
    const { startCheck, markAppDetecting, getAppPhaseSignal } = m;
    const sid = startCheck(["A"]);
    markAppDetecting("A", sid);
    expect(getAppPhaseSignal("A").value).toBe("detecting");
  });

  it("finishCheck sets phase=done, finishedAt", async () => {
    const m = await freshModule();
    const { startCheck, finishCheck, checkSession } = m;
    startCheck(["A"]);
    finishCheck();
    expect(checkSession.value.phase).toBe("done");
    expect(typeof checkSession.value.finishedAt).toBe("number");
  });

  it("finishCheck on already-done session is a no-op", async () => {
    const m = await freshModule();
    const { startCheck, finishCheck, checkSession } = m;
    startCheck(["A"]);
    finishCheck();
    const t1 = checkSession.value.finishedAt;
    finishCheck();
    expect(checkSession.value.finishedAt).toBe(t1);
  });

  it("applyCachedResults fills in results + phases for known apps", async () => {
    const m = await freshModule();
    const { applyCachedResults, getResultSignal, getAppPhaseSignal } = m;
    applyCachedResults({
      apps: {
        X: { name: "X", status: "ok", version: "1.0" },
        Y: { name: "Y", status: "ok", version: "2.0" },
      },
    });
    expect(getResultSignal("X").value.version).toBe("1.0");
    expect(getAppPhaseSignal("X").value).toBe("done");
    expect(getResultSignal("Y").value.version).toBe("2.0");
  });
});
