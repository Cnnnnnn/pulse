/**
 * tests/main/self-updater.test.js
 *
 * P52 Task 1: self-updater 纯函数状态机 + compareVersions.
 * 接线层 (electron-updater require + 事件订阅) 走 smoke test, 不在本文件.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  INITIAL_UPDATE_STATE,
  reduceUpdateState,
  compareVersions,
} = require("../../src/main/self-updater.js");

describe("compareVersions", () => {
  it("新版本 > 当前 → 1 (hasUpdate)", () => {
    expect(compareVersions("2.47.0", "2.46.0")).toBe(1);
  });
  it("相同版本 → 0", () => {
    expect(compareVersions("2.46.0", "2.46.0")).toBe(0);
  });
  it("旧版本 < 当前 → -1", () => {
    expect(compareVersions("2.45.0", "2.46.0")).toBe(-1);
  });
  it("含预发布标签也正确比较 (主版本高就算新)", () => {
    expect(compareVersions("2.47.0-beta", "2.46.0")).toBe(1);
    expect(compareVersions("2.47.0-rc.1", "2.46.0")).toBe(1);
  });
  it("缺段位补 0 (2.47 vs 2.47.0)", () => {
    expect(compareVersions("2.47", "2.47.0")).toBe(0);
    expect(compareVersions("2.47.1", "2.47")).toBe(1);
  });
  it("null / undefined / 非字符串 → 0 (防御)", () => {
    expect(compareVersions(null, "2.46.0")).toBe(-1); // null → 0 < 2.46.0
    expect(compareVersions("2.46.0", null)).toBe(1);
    expect(compareVersions(undefined, undefined)).toBe(0);
  });
});

describe("reduceUpdateState", () => {
  it("初始状态 idle, 无可用更新", () => {
    expect(INITIAL_UPDATE_STATE.status).toBe("idle");
    expect(INITIAL_UPDATE_STATE.available).toBe(false);
    expect(INITIAL_UPDATE_STATE.readyToInstall).toBe(false);
  });

  it("UPDATE_AVAILABLE → available + 记录 version/releaseNotes", () => {
    const next = reduceUpdateState(INITIAL_UPDATE_STATE, {
      type: "UPDATE_AVAILABLE",
      version: "2.47.0",
      releaseNotes: "修复",
    });
    expect(next.status).toBe("available");
    expect(next.available).toBe(true);
    expect(next.version).toBe("2.47.0");
    expect(next.releaseNotes).toBe("修复");
    expect(typeof next.lastCheckedAt).toBe("number");
  });

  it("UPDATE_NOT_AVAILABLE → idle + 清空 available/version, 保留 lastCheckedAt", () => {
    const s = { status: "available", available: true, version: "2.47.0" };
    const next = reduceUpdateState(s, { type: "UPDATE_NOT_AVAILABLE" });
    expect(next.available).toBe(false);
    expect(next.version).toBeNull();
    expect(next.status).toBe("idle");
    expect(typeof next.lastCheckedAt).toBe("number");
  });

  it("DOWNLOAD_PROGRESS → downloading + 记录 percent", () => {
    const next = reduceUpdateState(
      { status: "available", available: true, version: "2.47.0" },
      { type: "DOWNLOAD_PROGRESS", percent: 45 },
    );
    expect(next.status).toBe("downloading");
    expect(next.downloadPercent).toBe(45);
  });

  it("UPDATE_DOWNLOADED → downloaded + readyToInstall + percent=100", () => {
    const next = reduceUpdateState(
      { status: "downloading", available: true, version: "2.47.0" },
      { type: "UPDATE_DOWNLOADED" },
    );
    expect(next.status).toBe("downloaded");
    expect(next.readyToInstall).toBe(true);
    expect(next.downloadPercent).toBe(100);
  });

  it("ERROR → error + 记录 message", () => {
    const next = reduceUpdateState(INITIAL_UPDATE_STATE, {
      type: "ERROR",
      message: "网络失败",
    });
    expect(next.status).toBe("error");
    expect(next.error).toBe("网络失败");
  });

  it("CHECKING_FOR_UPDATE → checking", () => {
    const next = reduceUpdateState(INITIAL_UPDATE_STATE, {
      type: "CHECKING",
    });
    expect(next.status).toBe("checking");
  });

  it("未知 type → 返 state 不变 (防御)", () => {
    const s = { status: "available", available: true };
    const next = reduceUpdateState(s, { type: "FOOBAR" });
    expect(next).toBe(s);
  });

  it("DOWNLOAD_PROGRESS percent 非数字 → 保持上一次的 percent", () => {
    const s = { status: "downloading", downloadPercent: 30 };
    const next = reduceUpdateState(s, {
      type: "DOWNLOAD_PROGRESS",
      percent: "not a number",
    });
    expect(next.downloadPercent).toBe(30);
  });

  it("纯函数: 不 mutate 输入 state", () => {
    const s = { ...INITIAL_UPDATE_STATE };
    const before = JSON.stringify(s);
    reduceUpdateState(s, { type: "CHECKING" });
    expect(JSON.stringify(s)).toBe(before);
  });
});
