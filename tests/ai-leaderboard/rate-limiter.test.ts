import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const {
  AA_DAILY_LIMIT,
  acquire,
  budget,
  remaining,
  resetLimiter,
  __reloadForTest,
} = requireMain("ai-leaderboard/rate-limiter");
const { __setCacheDirForTest, __resetForTest: resetCacheDir } = requireMain("ai-leaderboard/cache");

describe("rate-limiter: budget()", () => {
  beforeEach(() => resetLimiter());

  it("初始状态：AA 预算 0 used / 1000 limit / 1000 remaining / dayResetsAt 是 ISO / lastAcquireAt null", () => {
    const snapshot = budget("artificial-analysis");

    expect(snapshot.used).toBe(0);
    expect(snapshot.limit).toBe(1000);
    expect(snapshot.remaining).toBe(1000);
    expect(new Date(snapshot.dayResetsAt).toISOString()).toBe(snapshot.dayResetsAt);
    expect(snapshot.lastAcquireAt).toBeNull();
  });

  it("acquire AA 一次后 used=1 / remaining=999 / lastAcquireAt 是 ISO", () => {
    expect(acquire("artificial-analysis")).toBe(true);

    const snapshot = budget("artificial-analysis");
    expect(snapshot.used).toBe(1);
    expect(snapshot.remaining).toBe(999);
    expect(new Date(snapshot.lastAcquireAt).toISOString()).toBe(snapshot.lastAcquireAt);
  });

  it("non-AA source：used=0 / limit=Infinity / remaining=Infinity / dayResetsAt=null / lastAcquireAt=null", () => {
    expect(budget("openrouter")).toEqual({
      used: 0,
      limit: Infinity,
      remaining: Infinity,
      dayResetsAt: null,
      lastAcquireAt: null,
    });
  });
});

describe("rate-limiter: 跨日 / 极限 / remaining 等价", () => {
  beforeEach(() => {
    resetLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("跨 UTC 日界：23:59:59 用 2 次，第二天 00:00:01 自动归零", () => {
    vi.setSystemTime(new Date("2026-07-21T23:59:59Z"));

    expect(acquire("artificial-analysis")).toBe(true);
    expect(acquire("artificial-analysis")).toBe(true);
    expect(budget("artificial-analysis").used).toBe(2);

    vi.setSystemTime(new Date("2026-07-22T00:00:01Z"));

    const snapshot = budget("artificial-analysis");
    expect(snapshot.used).toBe(0);
    expect(snapshot.lastAcquireAt).toBeNull();
  });

  it("用满 AA_DAILY_LIMIT 后 acquire 返 false", () => {
    vi.setSystemTime(new Date("2026-07-21T12:00:00Z"));

    for (let i = 0; i < AA_DAILY_LIMIT; i++) {
      expect(acquire("artificial-analysis")).toBe(true);
    }

    expect(acquire("artificial-analysis")).toBe(false);

    const snapshot = budget("artificial-analysis");
    expect(snapshot.used).toBe(AA_DAILY_LIMIT);
    expect(snapshot.remaining).toBe(0);
  });

  it("remaining('artificial-analysis') ≡ budget('artificial-analysis').remaining", () => {
    expect(remaining("artificial-analysis")).toBe(
      budget("artificial-analysis").remaining,
    );

    acquire("artificial-analysis");
    acquire("artificial-analysis");

    expect(remaining("artificial-analysis")).toBe(
      budget("artificial-analysis").remaining,
    );
  });
});

describe("rate-limiter: AA 令牌持久化（防重启超配）", () => {
  let tmpDir: string;

  beforeEach(() => {
    resetLimiter();
    resetCacheDir();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-rate-"));
    __setCacheDirForTest(tmpDir);
  });

  afterEach(() => {
    resetCacheDir();
    resetLimiter();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("acquire 后当日计数落盘 aa-rate.json", () => {
    acquire("artificial-analysis");
    acquire("artificial-analysis");
    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, "aa-rate.json"), "utf8"));
    expect(raw.used).toBe(2);
    expect(raw.day).toBe(new Date().toISOString().slice(0, 10));
  });

  it("模拟进程重启（__reloadForTest）→ 从磁盘恢复当日已用", () => {
    acquire("artificial-analysis");
    __reloadForTest();
    expect(remaining("artificial-analysis")).toBe(AA_DAILY_LIMIT - 1);
  });

  it("跨日的持久化文件不生效（按 UTC 日重置）", () => {
    fs.writeFileSync(
      path.join(tmpDir, "aa-rate.json"),
      JSON.stringify({ day: "2000-01-01", used: 999 }),
    );
    __reloadForTest();
    expect(remaining("artificial-analysis")).toBe(AA_DAILY_LIMIT);
  });
});
