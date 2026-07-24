/**
 * tests/ai-leaderboard/cache.test.js
 *
 * 磁盘缓存 gzip 行为：
 *   1) writeCache → readCache 往返（数据等价）
 *   2) 旧 .json 文件存在 → readCache 命中并 lazy 升级到 .json.gz
 *   3) 内存缓存优先级 > 磁盘（改写磁盘文件不影响 readCache 结果）
 *   4) 写盘落地的真是 gzip bytes（不是明文 JSON）
 *
 * 测试通过 __setCacheDirForTest() 把 _cacheDir 指向 os.tmpdir() 下的一次性
 * mkdtemp 目录 — 永远不会触碰真实 userData。__resetForTest() 在每个用例
 * 开头清空内存缓存 + 复位缓存目录惰性标志，保证用例间无状态泄漏。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

const {
  cacheKey,
  readCache,
  writeCache,
  isStale,
  __resetForTest,
  __setCacheDirForTest,
} = requireMain("ai-leaderboard/cache");
const PLAIN_SUFFIX = ".json";
const GZ_SUFFIX = ".json.gz";

describe("cache.js: gzip 往返 + 兼容升级", () => {
  let tmpDir;

  beforeEach(() => {
    __resetForTest();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-lb-cache-test-"));
    __setCacheDirForTest(tmpDir);
  });

  afterEach(() => {
    __resetForTest();
    // 清理一次性 tmp 目录（best-effort，不影响断言）
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("writeCache → readCache 往返一致，且落盘为 .json.gz", () => {
    const key = cacheKey("arena", "text");
    const sample = { models: [{ id: "gpt-4o", score: 1400 }], note: "中文样本 — 测试 UTF-8" };
    writeCache(key, sample);

    const out = readCache(key);
    expect(out).not.toBeNull();
    expect(out.data).toEqual(sample);
    expect(typeof out.fetchedAt).toBe("number");
    expect(isStale(out.fetchedAt, 24 * 60 * 60 * 1000)).toBe(false);

    // 落盘文件后缀必须是 .json.gz，旧 .json 不应存在
    const encoded = encodeURIComponent(key);
    expect(fs.existsSync(path.join(tmpDir, encoded + GZ_SUFFIX))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, encoded + PLAIN_SUFFIX))).toBe(false);
  });

  it("落盘内容是真正的 gzip bytes（gunzip 还原 = JSON.stringify(entry)）", () => {
    const key = cacheKey("artificial-analysis", "llms");
    writeCache(key, { hello: "world" });

    const file = path.join(tmpDir, encodeURIComponent(key) + GZ_SUFFIX);
    const compressed = fs.readFileSync(file);
    // gzip magic number 0x1f 0x8b
    expect(compressed[0]).toBe(0x1f);
    expect(compressed[1]).toBe(0x8b);

    const json = zlib.gunzipSync(compressed).toString("utf8");
    const parsed = JSON.parse(json);
    expect(parsed.data).toEqual({ hello: "world" });
    expect(typeof parsed.fetchedAt).toBe("number");
  });

  it("旧 .json 存在 → readCache 命中并 lazy 升级到 .json.gz，旧文件被删除", () => {
    const key = cacheKey("openrouter", "catalog");
    const encoded = encodeURIComponent(key);
    const plainFile = path.join(tmpDir, encoded + PLAIN_SUFFIX);
    const gzFile = path.join(tmpDir, encoded + GZ_SUFFIX);

    // 模拟旧版本留下的明文 .json
    const legacyEntry = { data: { models: ["legacy"] }, fetchedAt: 1700000000000 };
    fs.writeFileSync(plainFile, JSON.stringify(legacyEntry), "utf8");
    expect(fs.existsSync(plainFile)).toBe(true);
    expect(fs.existsSync(gzFile)).toBe(false);

    const out = readCache(key);
    expect(out).not.toBeNull();
    expect(out.data).toEqual({ models: ["legacy"] });
    expect(out.fetchedAt).toBe(1700000000000);

    // 升级后: 旧 .json 已删, .json.gz 已写
    expect(fs.existsSync(plainFile)).toBe(false);
    expect(fs.existsSync(gzFile)).toBe(true);

    // 升级后的 gz 内容再次 gunzip 也能还原
    const restored = JSON.parse(zlib.gunzipSync(fs.readFileSync(gzFile)).toString("utf8"));
    expect(restored).toEqual(legacyEntry);
  });

  it("内存缓存优先级 > 磁盘：写盘后篡改磁盘文件，readCache 仍返回内存值", () => {
    const key = cacheKey("livebench", "all");
    const inMemData = { v: "memory" };
    writeCache(key, inMemData);

    // 篡改磁盘文件（写入完全不同的内容）— 模拟磁盘脏数据
    const file = path.join(tmpDir, encodeURIComponent(key) + GZ_SUFFIX);
    const tamperedEntry = { data: { v: "tampered-on-disk" }, fetchedAt: 1 };
    fs.writeFileSync(
      file,
      zlib.gzipSync(Buffer.from(JSON.stringify(tamperedEntry), "utf8"))
    );

    const out = readCache(key);
    // 命中 _memCache，应返回写入时的内存值，而不是磁盘上被篡改的值
    expect(out.data).toEqual(inMemData);
    expect(out.fetchedAt).not.toBe(1);
  });

  it("__resetForTest 后：磁盘文件存在时 readCache 仍能命中并升级", () => {
    // 第一阶段：写入
    const key = cacheKey("arena", "all");
    writeCache(key, { a: 1 });

    // 第二阶段：清空内存（模拟新进程），重设 tmpDir；再读
    __resetForTest();
    __setCacheDirForTest(tmpDir);
    const out = readCache(key);
    expect(out).not.toBeNull();
    expect(out.data).toEqual({ a: 1 });
  });
});
