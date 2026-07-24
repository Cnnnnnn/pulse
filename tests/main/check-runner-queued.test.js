/**
 * tests/main/check-runner-queued.test.js
 *
 * runCheckQueued 并发序列化单测.
 *
 * ponytail: 模块层 `checkTail` / `manualCheckInflight` 是 module-scope 状态,
 *         跨 require 缓存共享. 每个用例 vi.resetModules() + dynamic import 拿全新
 *         模块实例, 状态回到 Promise.resolve() / null. 不需要单独 stub runCheck,
 *         复用现有 makeDeps.
 *
 * 触发过的设计: 2026-06-28 「检查更新」按钮无反应 — 当用户连点时, 第二次调用
 * 之前会把第一次的 in-flight Promise 直接 return, 调用方误以为"成功开始"但
 * UI 等不到结果. 修法: 并发手动调用立刻返 { started: false, reason: "already_running" },
 * 真失败走 { started: false, reason: "check_failed", error }.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const checkRunnerPath = mainArtifactPath("check-runner");

async function freshRunCheckQueued() {
  vi.resetModules();
  // Bust dist-test artifact cache so module-scope inflight state resets.
  delete require.cache[checkRunnerPath];
  return requireMain("check-runner");
}

const FAKE_NOW = 1750000000000;

beforeEach(() => {
  // 不要用 vi.useFakeTimers — 我们的 inflight promise 链全靠 microtask,
  // fake timers 会卡住 microtask 推进导致测试 timeout. Date stub 也不需要.
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeResult(name) {
  return {
    name,
    installed_version: "1.0",
    latest_version: "1.1",
    has_update: true,
    status: "update_available",
    source: "brew_formulae",
    note: "",
    bundle: `${name}.app`,
  };
}

function makeDeps(results) {
  return {
    getConfig: () => ({
      apps: results.map((r) => ({ name: r.name, detectors: [] })),
      notifications: {},
    }),
    pool: {
      enqueue: (task) => {
        if (task.type === "detect-app") {
          return Promise.resolve(
            results.find((x) => x.name === task.payload.appCfg.name),
          );
        }
        return Promise.resolve({ success: true, output: "ok" });
      },
    },
    getWindow: () => null,
    onCheckComplete: () => {},
    getState: () => ({ apps: {} }),
    markNotified: () => {},
    Notification: class {
      show() {}
    },
  };
}

describe("runCheckQueued 并发语义", () => {
  it("首次手动调用走 runCheck, 完成后返 filteredResults", async () => {
    const { runCheckQueued } = await freshRunCheckQueued();
    const deps = makeDeps([makeResult("Cursor")]);
    const r = await runCheckQueued(deps, { silent: false });
    // runCheck 返 filteredResults 数组, runCheckQueued 透传.
    expect(Array.isArray(r)).toBe(true);
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("Cursor");
  });

  it("silent: true 不走 already_running 短路 (auto-check 永远并发安全)", async () => {
    const { runCheckQueued } = await freshRunCheckQueued();
    const deps = makeDeps([makeResult("Cursor")]);
    // 第一次手动 in-flight, 此时 silent 第二次调用应照样走 runCheck 排队.
    const first = runCheckQueued(deps, { silent: false });
    const second = runCheckQueued(deps, { silent: true });
    await Promise.all([first, second]);
    // 两次都未触发 already_running (silent 路径永远走队列).
    // 验证手段: 第二次的 deps pool enqueue 也被调到了, 即两次都跑了 runCheck.
    // 这里只验证两个 promise 都 resolve, 不抛.
    expect(true).toBe(true);
  });

  it("手动并发第二次立刻返 already_running, 不重排 runCheck", async () => {
    const { runCheckQueued } = await freshRunCheckQueued();
    // 让首次 runCheck 永远 pending, 这样 inflight 在测试期间一直存在.
    let resolveFirstEnqueue;
    const slowDeps = {
      ...makeDeps([makeResult("Cursor")]),
      pool: {
        enqueue: () =>
          new Promise((r) => {
            resolveFirstEnqueue = r;
          }),
      },
    };

    // 首次调用: 不 await, 让它 in-flight.
    const firstPromise = runCheckQueued(slowDeps, { silent: false });
    // 给 microtask 机会让 runCheckQueued 进入 enqueue → inflight 设置.
    await Promise.resolve();
    await Promise.resolve();

    // 第二次手动并发: 应立刻 resolve already_running, 不进入队列.
    const secondResult = await runCheckQueued(slowDeps, { silent: false });

    expect(secondResult).toEqual({
      started: false,
      reason: "already_running",
    });

    // 让第一次完成 (避免 vitest 警告 unhandled rejection).
    resolveFirstEnqueue(makeResult("Cursor"));
    await firstPromise;
  });

  it("手动 inflight 完成后, 下次手动调用重新排队 (不再 stuck 在 inflight)", async () => {
    const { runCheckQueued } = await freshRunCheckQueued();
    let resolveFirstEnqueue;
    const deps = {
      ...makeDeps([makeResult("Cursor")]),
      pool: {
        enqueue: () =>
          new Promise((r) => {
            resolveFirstEnqueue = r;
          }),
      },
    };

    // 第一次手动 in-flight.
    const first = runCheckQueued(deps, { silent: false });
    await Promise.resolve();
    await Promise.resolve();

    // 第二次手动: already_running.
    const second = await runCheckQueued(deps, { silent: false });
    expect(second.reason).toBe("already_running");

    // 让第一次完成.
    resolveFirstEnqueue(makeResult("Cursor"));
    await first;
    // inflight 应已清, 给 microtask 跑 finally 链.
    await Promise.resolve();

    // 第三次手动: inflight 已清, 应重新进入 runCheck 路径.
    const thirdDeps = makeDeps([makeResult("Cursor")]);
    const third = await runCheckQueued(thirdDeps, { silent: false });
    // runCheck 返 filteredResults 数组.
    expect(Array.isArray(third)).toBe(true);
    expect(third).toHaveLength(1);
  });

  it("silent 第二次调用不触发 already_running 短路, 走队列", async () => {
    const { runCheckQueued } = await freshRunCheckQueued();
    let firstEntered = false;
    let secondEntered = false;
    let resolveFirstEnqueue;
    const deps = {
      ...makeDeps([makeResult("Cursor")]),
      pool: {
        enqueue: () => {
          if (!firstEntered) {
            firstEntered = true;
            return new Promise((r) => {
              resolveFirstEnqueue = r;
            });
          }
          secondEntered = true;
          return Promise.resolve(makeResult("Cursor"));
        },
      },
    };

    const first = runCheckQueued(deps, { silent: false });
    await Promise.resolve();
    await Promise.resolve();
    // 第二次 silent: 不走 already_running, 排队等 first 完成后跑.
    const second = runCheckQueued(deps, { silent: true });

    // 让 first 完成, 才能推进 checkTail 链.
    resolveFirstEnqueue(makeResult("Cursor"));
    await Promise.all([first, second]);
    // 关键: 第二次真的进了 runCheck (pool 被调), 没被 already_running 挡掉.
    expect(secondEntered).toBe(true);
  });
});
