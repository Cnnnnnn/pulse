import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let tmpFile;
beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `pulse-ss-wxh-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
});
afterEach(() => {
  try { fs.unlinkSync(tmpFile); } catch { /* noop */ }
});

const { initStateStorePaths, loadWechatHotRead, saveWechatHotRead, saveOne } = await import(
  "../../src/main/state-store.ts"
);

beforeEach(() => {
  initStateStorePaths({ statePath: tmpFile });
});

describe("state-store wechat_hot read (I6 v2)", () => {
  it("loadWechatHotRead 无字段 → {}", () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ v: 1, apps: {} }));
    expect(loadWechatHotRead(tmpFile)).toEqual({});
  });

  it("saveWechatHotRead 写入 + loadWechatHotRead 读回", () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ v: 1, apps: { A: { installed: "1" } } }));
    saveWechatHotRead({ "词X": 12345 }, tmpFile);
    expect(loadWechatHotRead(tmpFile)).toEqual({ "词X": 12345 });
    // 其它字段保留
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.apps.A.installed).toBe("1");
  });

  it("forward compat: saveOne 保留 wechat_hot (PRESERVE_FIELDS)", () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ v: 1, apps: {}, wechat_hot: { readIds: { "保留词": 1 } } })
    );
    // saveOne 模拟其它模块写 state, 应保留 wechat_hot
    saveOne({ name: "Z", installed_version: "2.0", has_update: false }, tmpFile);
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.wechat_hot.readIds["保留词"]).toBe(1);
  });
});
