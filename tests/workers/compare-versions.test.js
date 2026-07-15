/**
 * tests/workers/compare-versions.test.js
 *
 * compareVersions 的 semver pre-release 语义 (2026-07-15 补).
 * 之前只做数字段比较, 完全不识别 -beta/-rc/-alpha, 导致
 * "5.2.6-rc1 vs 5.2.6" 被当相等. 现在: 主体相等时比 pre-release,
 * 排序 alpha < beta/pre < rc < release. 同时保留 4 段 build 号归一.
 */
import { describe, it, expect } from "vitest";
import { compareVersions } from "../../src/workers/detector-chain.js";

describe("compareVersions — pre-release 语义", () => {
  it("主体相等无后缀 → 无更新", () => {
    expect(compareVersions("5.2.6", "5.2.6")).toEqual({
      hasUpdate: false,
      note: "",
    });
  });

  it("latest 主体更高 → 有更新", () => {
    expect(compareVersions("5.2.5", "5.2.6")).toEqual({
      hasUpdate: true,
      note: "",
    });
  });

  it("installed 主体更高 → installed_newer", () => {
    expect(compareVersions("5.2.7", "5.2.6")).toEqual({
      hasUpdate: false,
      note: "installed_newer",
    });
  });

  it("已装 release > 检测到 pre-release → installed_newer (你领先于旧预发布)", () => {
    expect(compareVersions("5.2.6", "5.2.6-rc1")).toEqual({
      hasUpdate: false,
      note: "installed_newer",
    });
  });

  it("已装 pre-release < 检测到 release → 有更新 (rc 落后于正式版)", () => {
    expect(compareVersions("5.2.6-rc1", "5.2.6")).toEqual({
      hasUpdate: true,
      note: "",
    });
  });

  it("beta < rc → 有更新 (rc 比 beta 新)", () => {
    expect(compareVersions("5.2.6-beta", "5.2.6-rc1")).toEqual({
      hasUpdate: true,
      note: "",
    });
  });

  it("rc 之间数字后缀: rc.1 < rc.2 → 有更新", () => {
    expect(compareVersions("5.2.6-rc.1", "5.2.6-rc.2")).toEqual({
      hasUpdate: true,
      note: "",
    });
  });

  it("alpha < beta → 有更新", () => {
    expect(compareVersions("5.2.6-alpha", "5.2.6-beta")).toEqual({
      hasUpdate: true,
      note: "",
    });
  });

  it("保留 4 段 build 号归一: 同主体, latest build 更高 → 有更新", () => {
    expect(compareVersions("5.2.6.100", "5.2.6.200")).toEqual({
      hasUpdate: true,
      note: "",
    });
  });

  it("保留 4 段 build 号归一: 同主体, installed build 更高 → installed_newer", () => {
    expect(compareVersions("5.2.6.200", "5.2.6.100")).toEqual({
      hasUpdate: false,
      note: "installed_newer",
    });
  });

  it("v 前缀被 cleanVersion 处理", () => {
    expect(compareVersions("v5.2.5", "5.2.6")).toEqual({
      hasUpdate: true,
      note: "",
    });
  });
});
