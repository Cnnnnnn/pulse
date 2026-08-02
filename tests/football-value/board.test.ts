/**
 * tests/football-value/board.test.ts
 *
 * getFootballValueBoard 兜底链测试（dcaribou R2 主源）：
 *   1) httpClient 全失败 → sample 兜底（source=sample, isSample=true）
 *   2) httpClient 成功拉 gz CSV → live（写入缓存）
 *   3) httpClient 失败 → 回退已过期缓存（stale=true）
 *   4) force 重拉
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
const { requireMain } = require("../_setup/require-main.cjs");

const {
  getFootballValueBoard,
  CACHE_TTL_MS,
} = requireMain("football-value/index");
const { __resetForTest, __setCacheDirForTest } = requireMain("football-value/cache");

function gz(s: string): Buffer {
  return zlib.gzipSync(Buffer.from(s, "utf8"));
}

// 微型 dcaribou gz CSV：2 球员（A 100m > B 90m）
const VAL_GZ = gz(
  "player_id,date,market_value_in_eur,current_club_name,current_club_id,player_club_domestic_competition_id\n" +
  "1,2025-12-09,100000000,Club A,1,GB1\n" +
  "2,2025-12-09,90000000,Club B,2,GB1\n",
);
const PLA_GZ = gz(
  "player_id,first_name,last_name,name,last_season,current_club_id,player_code,country_of_birth,city_of_birth,country_of_citizenship,date_of_birth,sub_position,position,foot,height_in_cm,contract_expiration_date,agent_name,image_url\n" +
  "1,A,A,A,2025,1,a,EN,,EN,2000-01-01 00:00:00,Centre-Forward,Attack,right,180,,,img\n" +
  "2,B,B,B,2025,2,b,EN,,EN,2000-01-01 00:00:00,Central Midfield,Midfield,right,175,,img2\n",
);

function makeHttpClient(respond: (ctx: any) => any) {
  return {
    get: async (url: string, opts: any) => respond({ url, opts }),
  };
}

// 按 URL 返回对应 gz（valuations URL → VAL_GZ, players URL → PLA_GZ）
function gzHttpClient() {
  return makeHttpClient(({ url }: any) => {
    if (url.includes("player_valuations")) return { status: 200, body: VAL_GZ };
    if (url.includes("players")) return { status: 200, body: PLA_GZ };
    return { status: 404, body: "" };
  });
}

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

  it("httpClient 全失败 → sample 兜底，UI 不空白", async () => {
    const res = await getFootballValueBoard({
      httpClient: makeHttpClient(() => ({ status: 500, body: "" })),
    });
    expect(res.ok).toBe(true);
    expect(res.isSample).toBe(true);
    expect(res.source).toBe("sample");
    expect(res.players.length).toBeGreaterThan(0);
    expect(res.players[0].isSample).toBe(true);
  });

  it("httpClient 成功拉 gz → live，且写缓存", async () => {
    const res = await getFootballValueBoard({ httpClient: gzHttpClient() });
    expect(res.ok).toBe(true);
    expect(res.source).toBe("live");
    expect(res.players.length).toBe(2);
    expect(res.players[0].valueEur).toBe(100000000);
    expect(res.players[0].name).toBe("A");
    // 第二次命中缓存 → cache（不再 fetch）
    const cached = await getFootballValueBoard({
      httpClient: makeHttpClient(() => { throw new Error("no fetch"); }),
    });
    expect(cached.source).toBe("cache");
    expect(cached.players.length).toBe(2);
  });

  it("httpClient 失败 + force → 回退已过期缓存（stale=true）", async () => {
    const { writeCache, cacheKey } = requireMain("football-value/cache");
    writeCache(cacheKey("top"), {
      players: [{ id: "1", name: "Old", position: "FW", valueEur: 50000000 }],
    });
    const res = await getFootballValueBoard({
      force: true,
      httpClient: makeHttpClient(() => ({ status: 500, body: "" })),
    });
    expect(res.ok).toBe(true);
    expect(res.source).toBe("cache");
    expect(res.stale).toBe(true);
    expect(res.players[0].name).toBe("Old");
  });

  it("force 重拉覆盖缓存", async () => {
    const { writeCache, cacheKey } = requireMain("football-value/cache");
    writeCache(cacheKey("top"), { players: [{ id: "x", name: "stale-cache", position: "FW", valueEur: 1 }] });
    const res = await getFootballValueBoard({
      force: true,
      httpClient: gzHttpClient(),
    });
    expect(res.source).toBe("live");
    expect(res.players[0].name).toBe("A");
  });

  it("CACHE_TTL_MS = 3 天（手动 only + TTL 节流）", () => {
    expect(CACHE_TTL_MS).toBe(3 * 24 * 60 * 60 * 1000);
  });
});
