/**
 * tests/main/state-store-ai-feedback.test.js
 *
 * A8 Task 2: state-store aiFeedback 字段读写.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
const require = createRequire(import.meta.url);
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const stateStore = requireMain("state-store");

function tmpStatePath() {
  return path.join(os.tmpdir(), `pulse-test-fb-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

describe("state-store aiFeedback", () => {
  let p;
  beforeEach(() => { p = tmpStatePath(); });
  afterEach(() => { try { fs.unlinkSync(p); } catch {} });

  it("loadAiFeedback 无文件返回空数组", () => {
    expect(stateStore.loadAiFeedback(p)).toEqual([]);
  });

  it("saveAiFeedback + loadAiFeedback 往返", () => {
    const samples = [
      { id: "advice::X::1::100", feature: "advice", appName: "X", version: "1", rec: "upgrade", confidence: "high", vote: "up", implicit: null, ts: 100 },
    ];
    stateStore.saveAiFeedback(samples, p);
    const loaded = stateStore.loadAiFeedback(p);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("advice::X::1::100");
  });

  it("saveAiFeedback 不破坏其它字段", () => {
    // 用最小合法 state (带 apps) 初始化, 不走 saveAll (它期望 results 数组)
    fs.writeFileSync(p, JSON.stringify({ v: 1, apps: { VSCode: {} } }));
    stateStore.saveAiFeedback([{ id: "k1", feature: "summary", appName: "Y", vote: "down", ts: 5 }], p);
    const loaded = stateStore.load(p);
    expect(loaded.apps).toBeDefined();
    expect(loaded.aiFeedback).toHaveLength(1);
  });

  it("saveAiFeedback 非数组忽略不崩", () => {
    fs.writeFileSync(p, JSON.stringify({ v: 1, apps: {} }));
    stateStore.saveAiFeedback("not-an-array", p);
    expect(stateStore.loadAiFeedback(p)).toEqual([]);
  });
});
