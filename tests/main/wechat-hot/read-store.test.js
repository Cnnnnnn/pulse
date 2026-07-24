import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../../_setup/require-main.cjs");

const { loadReadIds, markItemRead } = await Promise.resolve(requireMain("wechat-hot/read-store"));

let tmpFile;
beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `pulse-wxh-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
});
afterEach(() => {
  try { fs.unlinkSync(tmpFile); } catch { /* noop */ }
});

function writeFile(obj) {
  fs.writeFileSync(tmpFile, JSON.stringify(obj), "utf-8");
}

describe("wechat-hot read-store (I6 v2)", () => {
  it("loadReadIds 无 wechat_hot 字段 → {}", () => {
    writeFile({ v: 1, apps: {} });
    expect(loadReadIds(tmpFile)).toEqual({});
  });

  it("loadReadIds 有 wechat_hot.readIds → 返回该 map", () => {
    writeFile({ v: 1, apps: {}, wechat_hot: { readIds: { "热词A": 1000 } } });
    expect(loadReadIds(tmpFile)).toEqual({ "热词A": 1000 });
  });

  it("markItemRead 写 readIds[title] = now 并保留其它字段", () => {
    writeFile({ v: 1, apps: { X: { installed: "1.0" } }, mutes: {} });
    const r = markItemRead("新热词", tmpFile);
    expect(r.ok).toBe(true);
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.wechat_hot.readIds["新热词"]).toBeGreaterThan(0);
    // 其它字段保留
    expect(after.apps.X.installed).toBe("1.0");
  });

  it("markItemRead 重复标记 → 更新 readAt, 幂等", () => {
    writeFile({ v: 1, apps: {}, wechat_hot: { readIds: { "词": 100 } } });
    const r = markItemRead("词", tmpFile);
    expect(r.ok).toBe(true);
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.wechat_hot.readIds["词"]).not.toBe(100); // 已更新
  });

  it("markItemRead 保留已有 readIds (不覆盖)", () => {
    writeFile({ v: 1, apps: {}, wechat_hot: { readIds: { "旧词": 50 } } });
    markItemRead("新词", tmpFile);
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.wechat_hot.readIds["旧词"]).toBe(50);
    expect(after.wechat_hot.readIds["新词"]).toBeGreaterThan(0);
  });
});
