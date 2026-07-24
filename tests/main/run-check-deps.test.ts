/**
 * tests/main/run-check-deps.test.js
 *
 * buildRunCheckDeps 单测. 验证:
 *   - getConfig 优先 ctx.getConfig, 否则从 ctx.runtimeConfigRef.current 派生
 *   - getWindow / onCheckComplete 默认 noop (callable 不抛)
 *   - getState / markNotified 包 try/catch, 内部 stateStore.load / markNotified 抛错时
 *     不传播 (返 null / noop)
 *   - 不传 ctx / 传空 ctx 时不崩, 返的 deps 可直接喂给 runCheck
 *
 * ponytail: 这是纯函数 + 边界检查, 不依赖 runCheck. 用 vi.mock 隔离 state-store.
 */

import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

describe("buildRunCheckDeps", () => {
  it("ctx.getConfig 优先, 每次 check 调一次返最新 cfg", () => {
    const { buildRunCheckDeps } = requireMain("run-check-deps");
    const getConfig = vi.fn(() => ({ apps: [] }));
    const ctx = {
      getConfig,
      pool: {},
      stateStore: { load: () => null, markNotified: () => {} },
    };
    const deps = buildRunCheckDeps(ctx);
    deps.getConfig();
    deps.getConfig();
    expect(getConfig).toHaveBeenCalledTimes(2);
  });

  it("无 ctx.getConfig 时从 ctx.runtimeConfigRef.current 派生", () => {
    const { buildRunCheckDeps } = requireMain("run-check-deps");
    let current = { apps: [{ name: "A" }] };
    const ctx = {
      runtimeConfigRef: {
        get current() {
          return current;
        },
      },
      pool: {},
      stateStore: { load: () => null, markNotified: () => {} },
    };
    const deps = buildRunCheckDeps(ctx);
    expect(deps.getConfig().apps[0].name).toBe("A");
    // 切换 ref 后再读, 应拿到最新值 (auto-check 需要).
    current = { apps: [{ name: "B" }] };
    expect(deps.getConfig().apps[0].name).toBe("B");
  });

  it("ctx 都没有 → 返空 cfg, 不崩", () => {
    const { buildRunCheckDeps } = requireMain("run-check-deps");
    const deps = buildRunCheckDeps({});
    expect(deps.getConfig()).toEqual({});
    expect(typeof deps.getWindow()).toBe("object"); // null
    expect(deps.onCheckComplete()).toBeUndefined();
  });

  it("完全没传 ctx → 不崩, 默认值兜底", () => {
    const { buildRunCheckDeps } = requireMain("run-check-deps");
    const deps = buildRunCheckDeps();
    expect(deps.getConfig()).toEqual({});
    expect(deps.getState()).toBeNull();
    expect(deps.markNotified(["x"])).toBeUndefined();
  });

  it("stateStore.load 抛错 → getState 返 null, 不传播", () => {
    const { buildRunCheckDeps } = requireMain("run-check-deps");
    const ctx = {
      pool: {},
      stateStore: {
        load: () => {
          throw new Error("disk gone");
        },
        markNotified: () => {},
      },
    };
    const deps = buildRunCheckDeps(ctx);
    expect(deps.getState()).toBeNull();
  });

  it("stateStore.markNotified 抛错 → 不传播 (no-op swallow)", () => {
    const { buildRunCheckDeps } = requireMain("run-check-deps");
    const ctx = {
      pool: {},
      stateStore: {
        load: () => null,
        markNotified: () => {
          throw new Error("readonly fs");
        },
      },
    };
    const deps = buildRunCheckDeps(ctx);
    expect(() => deps.markNotified(["a", "b"])).not.toThrow();
  });

  it("没传 stateStore → getState 返 null, markNotified 不抛", () => {
    const { buildRunCheckDeps } = requireMain("run-check-deps");
    const deps = buildRunCheckDeps({ pool: {} });
    expect(deps.getState()).toBeNull();
    expect(() => deps.markNotified(["x"])).not.toThrow();
  });

  it("ctx.getWindow 透传, 缺省返 () => null", () => {
    const { buildRunCheckDeps } = requireMain("run-check-deps");
    const win = { id: 1 };
    expect(buildRunCheckDeps({ getWindow: () => win }).getWindow()).toBe(win);
    expect(buildRunCheckDeps({}).getWindow()).toBeNull();
  });

  it("ctx.onCheckComplete 透传, 缺省 noop", () => {
    const { buildRunCheckDeps } = requireMain("run-check-deps");
    const cb = vi.fn();
    const deps = buildRunCheckDeps({ onCheckComplete: cb });
    deps.onCheckComplete([{ name: "X" }]);
    expect(cb).toHaveBeenCalledWith([{ name: "X" }]);
    // 缺省: 调不抛
    expect(() => buildRunCheckDeps({}).onCheckComplete([{}])).not.toThrow();
  });
});
