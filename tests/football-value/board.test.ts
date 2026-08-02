/**
 * tests/football-value/board.test.ts
 *
 * getFootballValueBoard 兜底链测试：
 *   1) 无 PARSE_BOT_API_KEY → sample 兜底（source=sample, isSample=true）
 *   2) 有 key + httpClient mock 成功 → live（写入缓存）
 *   3) httpClient 失败 → 回退最近快照（stale=true）
 *   4) force 重拉
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
const { requireMain } = require("../_setup/require-main.cjs");

const {
  getFootballValueBoard,
  CACHE_TTL_MS,
} = requireMain("football-value/index");
const { __resetForTest, __setCacheDirForTest } = requireMain("football-value/cache");

function makeHttpClient(respond: (opts: any) => any) {
  return {
    get: async (url: string, opts: any) => respond({ url, opts }),
  };
}

const LIVE_RAW = {
  players: [
    {
      id: "1",
      rank: 1,
      name: "A",
      position: "Attack",
      market_value_euros: 100000000,
    },
    {
      id: "2",
      rank: 2,
      name: "B",
      position: "Midfield",
      market_value_euros: 90000000,
    },
  ],
};

describe("football-value/board (getFootballValueBoard)", () => {
  let tmpDir;

  beforeEach(() => {
    __resetForTest();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "football-value-board-test-"));
    __setCacheDirForTest(tmpDir);
  });

  afterEach(() => {
    __resetForTest();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("无 key（apiKey 空 + env 无）→ sample 兜底，UI 不空白", async () => {
    const res = await getFootballValueBoard({ httpClient: makeHttpClient(() => { throw new Error("should not be called"); }) });
    expect(res.ok).toBe(true);
    expect(res.isSample).toBe(true);
    expect(res.source).toBe("sample");
    expect(res.players.length).toBeGreaterThan(0);
    expect(res.players[0].isSample).toBe(true);
  });

  it("有 key + httpClient 成功 → live，且写缓存", async () => {
    const res = await getFootballValueBoard({
      httpClient: makeHttpClient(({ opts }: any) => ({
        status: 200,
        body: JSON.stringify(LIVE_RAW),
      })),
      apiKey: "test-key",
    });
    expect(res.ok).toBe(true);
    expect(res.source).toBe("live");
    expect(res.players.length).toBe(2);
    expect(res.players[0].valueEur).toBe(100000000);
    // 第二次无 key 但命中缓存 → cache
    const cached = await getFootballValueBoard({ httpClient: makeHttpClient(() => { throw new Error("no fetch"); }) });
    expect(cached.source).toBe("cache");
    expect(cached.players.length).toBe(2);
  });

  it("httpClient 失败 + force → 回退已过期缓存（stale=true）", async () => {
    // 稳定 key 改造后：预置一份缓存，force 拉取失败时回退并标 stale
    const { writeCache, cacheKey } = requireMain("football-value/cache");
    writeCache(cacheKey("top"), {
      players: [{ id: "1", name: "Old", position: "FW", valueEur: 50000000 }],
    });
    const res = await getFootballValueBoard({
      force: true, // 绕过缓存命中判定，强制走 fetch（会失败）
      httpClient: makeHttpClient(() => ({ status: 500, body: "err" })),
      apiKey: "test-key",
    });
    expect(res.ok).toBe(true);
    expect(res.source).toBe("cache");
    expect(res.stale).toBe(true);
    expect(res.players[0].name).toBe("Old");
  });

  it("force 重拉覆盖缓存", async () => {
    // 预置旧缓存
    const { writeCache, cacheKey } = requireMain("football-value/cache");
    writeCache(cacheKey("top"), { players: [{ id: "x", name: "stale-cache", position: "FW", valueEur: 1 }] });
    const res = await getFootballValueBoard({
      force: true,
      httpClient: makeHttpClient(() => ({ status: 200, body: JSON.stringify(LIVE_RAW) })),
      apiKey: "test-key",
    });
    expect(res.source).toBe("live");
    expect(res.players[0].name).toBe("A");
  });

  it("CACHE_TTL_MS = 3 天（手动 only + TTL 节流）", () => {
    expect(CACHE_TTL_MS).toBe(3 * 24 * 60 * 60 * 1000);
  });
});
