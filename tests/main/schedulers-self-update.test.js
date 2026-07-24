/**
 * tests/main/schedulers-self-update.test.js
 *
 * P52 Task 2 smoke test: startSelfUpdateTimer + makeSelfUpdateController.
 * 用 mock autoUpdater 验证:
 *   - controller.checkNow → autoUpdater.checkForUpdates
 *   - controller.quitAndInstall → autoUpdater.quitAndInstall
 *   - autoUpdater 事件 → state 转换 (走 reduceUpdateState)
 *   - 不传 autoUpdater + require 失败 → 降级, 不抛
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

// 屏蔽 electron.app.once — schedulers.js 在 test 环境调用 app.once
// 我们的 require chain 真实跑会拿真 electron. stub 掉:
const electronMock = {
  app: {
    once: () => {},
    whenReady: () => ({ then: () => {} }),
  },
};
require.cache[require.resolve("electron")] = {
  id: "electron",
  filename: "electron",
  loaded: true,
  exports: electronMock,
};

const {
  startSelfUpdateTimer,
  makeSelfUpdateController,
} = requireMain("bootstrap/schedulers");

function makeMockAutoUpdater() {
  const handlers = {};
  return {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(async () => {}),
    quitAndInstall: vi.fn(),
    on(event, fn) {
      handlers[event] = fn;
    },
    emit(event, payload) {
      if (handlers[event]) handlers[event](payload);
    },
    _handlers: handlers,
  };
}

describe("makeSelfUpdateController", () => {
  it("初始 state = idle, available=false", () => {
    const c = makeSelfUpdateController({});
    expect(c.getState().status).toBe("idle");
    expect(c.getState().available).toBe(false);
  });

  it("无 autoUpdater → checkNow 返 no-autoUpdater, 不抛", async () => {
    const c = makeSelfUpdateController({});
    const r = await c.checkNow();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no-autoUpdater");
  });

  it("autoUpdater 事件 → state 正确转换", () => {
    const au = makeMockAutoUpdater();
    const c = makeSelfUpdateController({ autoUpdater: au });

    au.emit("checking-for-update");
    expect(c.getState().status).toBe("checking");

    au.emit("update-available", { version: "2.47.0", releaseNotes: "fix" });
    expect(c.getState().status).toBe("available");
    expect(c.getState().available).toBe(true);
    expect(c.getState().version).toBe("2.47.0");

    au.emit("download-progress", { percent: 42.7 });
    expect(c.getState().status).toBe("downloading");
    expect(c.getState().downloadPercent).toBe(43); // 四舍五入

    au.emit("update-downloaded");
    expect(c.getState().status).toBe("downloaded");
    expect(c.getState().readyToInstall).toBe(true);
    expect(c.getState().downloadPercent).toBe(100);
  });

  it("checkNow → autoUpdater.checkForUpdates 被调, ok=true", async () => {
    const au = makeMockAutoUpdater();
    const c = makeSelfUpdateController({ autoUpdater: au });
    const r = await c.checkNow();
    expect(r.ok).toBe(true);
    expect(au.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("checkNow 抛 → dispatch ERROR, 返 ok=false", async () => {
    const au = makeMockAutoUpdater();
    au.checkForUpdates.mockRejectedValue(new Error("网络失败"));
    const c = makeSelfUpdateController({ autoUpdater: au });
    const r = await c.checkNow();
    expect(r.ok).toBe(false);
    expect(c.getState().status).toBe("error");
    expect(c.getState().error).toBe("网络失败");
  });

  it("quitAndInstall → autoUpdater.quitAndInstall 被调", () => {
    const au = makeMockAutoUpdater();
    const c = makeSelfUpdateController({ autoUpdater: au });
    c.quitAndInstall();
    expect(au.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it("半自动档: autoDownload=true, autoInstallOnAppQuit=false 被设置", () => {
    const au = makeMockAutoUpdater();
    makeSelfUpdateController({ autoUpdater: au });
    expect(au.autoDownload).toBe(true);
    expect(au.autoInstallOnAppQuit).toBe(false);
  });

  it("error 事件 → state.error 记录 message", () => {
    const au = makeMockAutoUpdater();
    const c = makeSelfUpdateController({ autoUpdater: au });
    au.emit("error", new Error("network timeout"));
    expect(c.getState().status).toBe("error");
    expect(c.getState().error).toBe("network timeout");
  });
});

describe("startSelfUpdateTimer", () => {
  it("返 { stop, triggerNow, controller }", () => {
    const au = makeMockAutoUpdater();
    const handle = startSelfUpdateTimer({ autoUpdater: au });
    expect(handle).not.toBeNull();
    expect(typeof handle.stop).toBe("function");
    expect(typeof handle.triggerNow).toBe("function");
    expect(handle.controller.getState().status).toBe("idle");
    handle.stop();
  });

  it("triggerNow → controller.checkNow 调 autoUpdater", async () => {
    const au = makeMockAutoUpdater();
    const handle = startSelfUpdateTimer({ autoUpdater: au });
    const r = await handle.triggerNow();
    expect(r.ok).toBe(true);
    expect(au.checkForUpdates).toHaveBeenCalled();
    handle.stop();
  });

  it("autoUpdater 事件经过 controller 同步更新 state", () => {
    const au = makeMockAutoUpdater();
    const handle = startSelfUpdateTimer({ autoUpdater: au });
    au.emit("update-available", { version: "2.47.0" });
    expect(handle.controller.getState().version).toBe("2.47.0");
    handle.stop();
  });

  it("stop 不抛", () => {
    const au = makeMockAutoUpdater();
    const handle = startSelfUpdateTimer({ autoUpdater: au });
    expect(() => handle.stop()).not.toThrow();
    expect(() => handle.stop()).not.toThrow(); // 双 stop 也 OK
  });
});

describe("startSelfUpdateTimer idle gate (P52 §增量自更新)", () => {
  it("triggerNow 不受 idle gate 影响 (用户手动触发)", async () => {
    const au = makeMockAutoUpdater();
    const handle = startSelfUpdateTimer({
      autoUpdater: au,
      // 即便 powerIdleState='active', 手动 trigger 也要跑
      getPowerIdleState: () => "active",
    });
    const r = await handle.triggerNow();
    expect(r.ok).toBe(true);
    expect(au.checkForUpdates).toHaveBeenCalled();
    handle.stop();
  });

  it("接受 getPowerIdleState / logSkip / minBootAgeMs 选项且不抛", () => {
    const au = makeMockAutoUpdater();
    const skipped = [];
    expect(() =>
      startSelfUpdateTimer({
        autoUpdater: au,
        intervalMs: 50,
        minBootAgeMs: 0,
        getPowerIdleState: () => "idle",
        logSkip: (reason) => skipped.push(reason),
      }),
    ).not.toThrow();
    // 手动 trigger 验证 controller 仍工作
  });

  it("getPowerIdleState throw → startSelfUpdateTimer 仍能 triggerNow (defensive)", async () => {
    const au = makeMockAutoUpdater();
    const handle = startSelfUpdateTimer({
      autoUpdater: au,
      // boot < 5min, powerMonitor 抛错 → 安全降级, 不影响手动 trigger
      getPowerIdleState: () => {
        throw new Error("powerMonitor unavailable");
      },
    });
    const r = await handle.triggerNow();
    expect(r.ok).toBe(true);
    expect(au.checkForUpdates).toHaveBeenCalled();
    handle.stop();
  });
});
