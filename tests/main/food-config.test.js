/**
 * tests/main/food-config.test.js
 *
 * Task 1: 高德 API key 持久化 (safeStorage 封装) 单元测.
 * mock safeStorage 走 require.cache trick — 跟 plan §Task 1 一致.
 * (vitest 1.x 必须用 import, 不能用 require — 已从 plan 改写)
 */

import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// 替 safeStorage 用一个内存版 mock — 简化测
const fakeSafeStorage = {
  _store: {},
  isEncryptionAvailable: () => true,
  encryptString(key) { return Buffer.from("enc:" + key); },
  decryptString(buf) { return buf.toString().replace(/^enc:/, ""); },
};

// 把 userData 重定向到 tmp, 避免污染真实 ~/Library/Application Support/pulse
const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-food-config-test-"));
const fakeApp = {
  getPath: (name) => (name === "userData" ? tmpUserData : os.tmpdir()),
};

require.cache[require.resolve("electron")] = {
  id: require.resolve("electron"),
  filename: require.resolve("electron"),
  loaded: true,
  exports: { app: fakeApp, safeStorage: fakeSafeStorage },
};

const foodConfig = require("../../src/main/food/food-config");

describe("food-config", () => {
  beforeEach(() => { fakeSafeStorage._store = {}; });

  it("returns null when no key set", async () => {
    expect(await foodConfig.getAmapKey()).toBeNull();
  });

  it("stores and retrieves key", async () => {
    const r = await foodConfig.setAmapKey("test-key-abc");
    expect(r.ok).toBe(true);
    expect(await foodConfig.getAmapKey()).toBe("test-key-abc");
    expect(await foodConfig.hasAmapKey()).toBe(true);
  });

  it("rejects empty key", async () => {
    const r = await foodConfig.setAmapKey("");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("empty_key");
  });
});
