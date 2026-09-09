/**
 * tests/main/cache-gc.test.ts
 *
 * userData 缓存统一 GC：超龄 Chromium 缓存删、死目录删、新文件留、
 * 用户数据路径不动。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
const { requireMain } = require("../_setup/require-main.cjs");

const { runCacheGc, DEAD_DIRS, CHROMIUM_CACHE_MAX_AGE_DAYS } = requireMain(
  "cache-gc",
);

let tmp: string;

function writeAged(fp: string, ageDays: number, content = "x".repeat(100)) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, content);
  const t = Date.now() - ageDays * 86400_000;
  fs.utimesSync(fp, t / 1000, t / 1000);
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-cache-gc-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("runCacheGc", () => {
  it("删除超龄 Chromium Cache 文件，保留新鲜文件", () => {
    writeAged(path.join(tmp, "Cache", "old_blob"), 30);
    writeAged(path.join(tmp, "Cache", "fresh_blob"), 1);
    const r = runCacheGc({ userData: tmp });
    expect(fs.existsSync(path.join(tmp, "Cache", "old_blob"))).toBe(false);
    expect(fs.existsSync(path.join(tmp, "Cache", "fresh_blob"))).toBe(true);
    expect(r.removedFiles).toBeGreaterThanOrEqual(1);
    expect(r.freedBytes).toBeGreaterThan(0);
  });

  it("删除已下线模块死目录 football-value-cache", () => {
    writeAged(path.join(tmp, "football-value-cache", "junk.json"), 1);
    const r = runCacheGc({ userData: tmp });
    expect(fs.existsSync(path.join(tmp, "football-value-cache"))).toBe(false);
    expect(r.removedDirs).toBeGreaterThanOrEqual(1);
    expect(DEAD_DIRS).toContain("football-value-cache");
  });

  it("不碰 state.json / vault / finance_news.json", () => {
    const state = path.join(tmp, "state.json");
    const vault = path.join(tmp, "vault", "secrets-index.json");
    const fin = path.join(tmp, "finance_news.json");
    writeAged(state, 90, "{}");
    writeAged(vault, 90, "{}");
    writeAged(fin, 90, "{}");
    runCacheGc({ userData: tmp });
    expect(fs.existsSync(state)).toBe(true);
    expect(fs.existsSync(vault)).toBe(true);
    expect(fs.existsSync(fin)).toBe(true);
  });

  it("userData 不存在 → skipped 不抛", () => {
    const r = runCacheGc({ userData: path.join(tmp, "nope") });
    expect(r.skipped).toContain("userData_missing");
    expect(r.removedFiles).toBe(0);
  });

  it("leaderboard cache 超龄文件兜底删除", () => {
    writeAged(
      path.join(tmp, "ai-leaderboard-cache", "old.json.gz"),
      CHROMIUM_CACHE_MAX_AGE_DAYS + 20,
    );
    writeAged(path.join(tmp, "ai-leaderboard-cache", "fresh.json.gz"), 1);
    const r = runCacheGc({ userData: tmp });
    expect(
      fs.existsSync(path.join(tmp, "ai-leaderboard-cache", "old.json.gz")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(tmp, "ai-leaderboard-cache", "fresh.json.gz")),
    ).toBe(true);
    expect(r.removedFiles).toBeGreaterThanOrEqual(1);
  });
});
