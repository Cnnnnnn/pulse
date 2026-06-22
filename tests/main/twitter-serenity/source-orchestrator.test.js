/**
 * tests/main/twitter-serenity/source-orchestrator.test.js
 *
 * Task 9: 镜像轮换 orchestrator. 验证 fallback / cooldown / degraded / health.
 */

import { describe, it, expect, vi } from "vitest";
import { createOrchestrator } from "../../../src/main/twitter-serenity/source-orchestrator.js";

function makeSource(id, behavior, priority = 1) {
  return {
    id,
    type: "nitter",
    url: `http://${id}`,
    priority,
    enabled: true,
    fetchUserTimeline: vi.fn(async () => {
      if (behavior === "fail") throw new Error(`${id} down`);
      return [{ id: `${id}-1`, text: "ok", author: { handle: "h" } }];
    }),
  };
}

describe("source-orchestrator", () => {
  it("首次 fetch 从第一个 (priority 最小) source 拿到数据", async () => {
    const orch = createOrchestrator({
      sources: [makeSource("a", "ok", 1), makeSource("b", "ok", 2)],
      cacheStore: { resetDegraded: vi.fn(), setDegraded: vi.fn() },
    });
    const r = await orch.fetch("aleabitoreddit");
    expect(r.ok).toBe(true);
    expect(r.tweets).toHaveLength(1);
    expect(r.successMirror).toBe("a");
  });

  it("第一个失败 → fallback 到第二个", async () => {
    const orch = createOrchestrator({
      sources: [makeSource("a", "fail", 1), makeSource("b", "ok", 2)],
      cacheStore: { resetDegraded: vi.fn(), setDegraded: vi.fn() },
    });
    const r = await orch.fetch("aleabitoreddit");
    expect(r.ok).toBe(true);
    expect(r.tweets).toHaveLength(1);
    expect(r.successMirror).toBe("b");
  });

  it("全失败 → setDegraded 被调 + 返回 degraded 视阈值而定", async () => {
    const setDegraded = vi.fn().mockReturnValue(1);
    const orch = createOrchestrator({
      sources: [makeSource("a", "fail", 1), makeSource("b", "fail", 2)],
      cacheStore: { setDegraded, resetDegraded: vi.fn() },
    });
    const r = await orch.fetch("aleabitoreddit");
    expect(r.ok).toBe(false);
    expect(r.tweets).toEqual([]);
    expect(setDegraded).toHaveBeenCalled();
    // failureCount=1 < threshold 3, degraded=false
    expect(r.degraded).toBe(false);
  });

  it("连续失败达 threshold (3) 后 onDegraded 触发一次", async () => {
    let degradedCalled = 0;
    // cacheStore.setDegraded() 不接收参数, 自身累加返回 count.
    // 用递增返回值模拟真实 cache-store 的 failureCount 累积.
    let failCount = 0;
    const setDegraded = vi.fn(() => {
      failCount += 1;
      return failCount;
    });
    const orch = createOrchestrator({
      sources: [makeSource("a", "fail", 1)],
      cacheStore: { setDegraded, resetDegraded: vi.fn() },
      onDegraded: () => {
        degradedCalled++;
      },
      degradedThreshold: 3,
      cooldownThreshold: 99, // 拉高, 避免 a 进入冷却影响 fetch 次数
    });
    const r1 = await orch.fetch("h");
    const r2 = await orch.fetch("h");
    const r3 = await orch.fetch("h");
    expect(r1.degraded).toBe(false);
    expect(r2.degraded).toBe(false);
    expect(r3.degraded).toBe(true);
    expect(degradedCalled).toBe(1);
  });

  it("成功后 cacheStore.resetDegraded 被调", async () => {
    const resetDegraded = vi.fn();
    const orch = createOrchestrator({
      sources: [makeSource("a", "ok", 1)],
      cacheStore: { setDegraded: vi.fn(), resetDegraded },
    });
    await orch.fetch("h");
    expect(resetDegraded).toHaveBeenCalled();
  });

  it("连续失败 ≥ cooldownThreshold 的 source 被冷却跳过", async () => {
    const a = makeSource("a", "fail", 1);
    const b = makeSource("b", "ok", 2);
    const orch = createOrchestrator({
      sources: [a, b],
      cacheStore: { setDegraded: vi.fn(), resetDegraded: vi.fn() },
      cooldownThreshold: 2,
      cooldownMs: 30 * 60 * 1000,
    });
    // 第 1 次: a 失败 (streak 1), fallback b 成功
    await orch.fetch("h");
    expect(a.fetchUserTimeline).toHaveBeenCalledTimes(1);
    expect(b.fetchUserTimeline).toHaveBeenCalledTimes(1);
    // 第 2 次: a 失败 (streak 2 → 进入冷却), fallback b 成功
    await orch.fetch("h");
    expect(a.fetchUserTimeline).toHaveBeenCalledTimes(2);
    expect(b.fetchUserTimeline).toHaveBeenCalledTimes(2);
    // 第 3 次: a 在冷却期被跳过, 直接走 b
    await orch.fetch("h");
    expect(a.fetchUserTimeline).toHaveBeenCalledTimes(2); // 没增加
    expect(b.fetchUserTimeline).toHaveBeenCalledTimes(3);
  });

  it("enabled=false 的 source 被跳过", async () => {
    const a = makeSource("a", "ok", 1);
    a.enabled = false;
    const b = makeSource("b", "ok", 2);
    const orch = createOrchestrator({
      sources: [a, b],
      cacheStore: { setDegraded: vi.fn(), resetDegraded: vi.fn() },
    });
    const r = await orch.fetch("h");
    expect(a.fetchUserTimeline).not.toHaveBeenCalled();
    expect(r.successMirror).toBe("b");
  });

  it("getHealth 返回每个 source 的 consecutiveFailures / lastSuccessAt", async () => {
    // a 失败 → fallback 到 b 成功. 所以 a consecutiveFailures=1, b=0
    const orch = createOrchestrator({
      sources: [makeSource("a", "fail", 1), makeSource("b", "ok", 2)],
      cacheStore: { setDegraded: vi.fn(), resetDegraded: vi.fn() },
    });
    await orch.fetch("h");
    const health = orch.getHealth();
    expect(health).toHaveLength(2);
    const a = health.find((s) => s.id === "a");
    const b = health.find((s) => s.id === "b");
    expect(a.consecutiveFailures).toBe(1);
    expect(b.consecutiveFailures).toBe(0);
    expect(b.lastSuccessAt).toBeGreaterThan(0);
  });
});
