/**
 * tests/main/state-store-token-spend.test.js
 *
 * P71 Task 2: state-store tokenSpend + tokenBudgetConfig 读写.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
const require = createRequire(import.meta.url);
const stateStore = require("../../src/main/state-store");

function tmpStatePath() {
  return path.join(
    os.tmpdir(),
    `pulse-test-tb-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
}

describe("state-store tokenSpend", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
  });
  afterEach(() => {
    try {
      fs.unlinkSync(p);
    } catch {}
  });

  it("loadTokenSpend 无文件返回 {}", () => {
    expect(stateStore.loadTokenSpend(p)).toEqual({});
  });
  it("saveTokenSpend + load 往返", () => {
    stateStore.saveTokenSpend({ "2026-06-25": 100 }, p);
    expect(stateStore.loadTokenSpend(p)).toEqual({ "2026-06-25": 100 });
  });

  it("loadTokenBudgetConfig 无文件返回默认值", () => {
    const cfg = stateStore.loadTokenBudgetConfig(p);
    expect(cfg.dailyLimit).toBe(0);
    expect(cfg.mode).toBe("warn");
  });
  it("saveTokenBudgetConfig + load 往返", () => {
    stateStore.saveTokenBudgetConfig({ dailyLimit: 50000, mode: "block" }, p);
    expect(stateStore.loadTokenBudgetConfig(p)).toEqual({
      dailyLimit: 50000,
      mode: "block",
    });
  });
  it("loadTokenBudgetConfig 非法 mode 回落默认 warn (dailyLimit 保留)", () => {
    // 先用合法路径写一个 block config, 再手动覆盖 mode 为非法值
    stateStore.saveTokenBudgetConfig({ dailyLimit: 100, mode: "block" }, p);
    // load 出完整 state, 改坏 mode, 写回
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    raw.tokenBudgetConfig = { dailyLimit: 100, mode: "weird" };
    fs.writeFileSync(p, JSON.stringify(raw));
    const cfg = stateStore.loadTokenBudgetConfig(p);
    expect(cfg.mode).toBe("warn");
    expect(cfg.dailyLimit).toBe(100);
  });
});
