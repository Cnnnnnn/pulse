/**
 * tests/football-value/main.test.ts
 *
 * 主进程数据层测试：
 *   1) parser: parse.bot 原始响应 → Player[]（位置归一化 / 身价解析）
 *   2) types: normalizePosition / formatValueEur / toPlayer 安全默认
 *   3) cache: write/read 往返 + readLatestCache 排除今天
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
const { requireMain } = require("../_setup/require-main.cjs");

const {
  parseTopPlayers,
} = requireMain("football-value/parser");
const {
  normalizePosition,
  formatValueEur,
  toPlayer,
} = requireMain("football-value/types");
const {
  cacheKey,
  readCache,
  readLatestCache,
  writeCache,
  __resetForTest,
  __setCacheDirForTest,
} = requireMain("football-value/cache");

describe("football-value/parser", () => {
  it("解析 parse.bot 原始响应 → Player[]（含位置/身价归一化）", () => {
    const raw = {
      players: [
        {
          id: "418560",
          rank: 1,
          name: "Erling Haaland",
          position: "Attack",
          age: 26,
          club: "Manchester City",
          nationality: "Norway",
          market_value_euros: 180000000,
        },
        {
          id: "624855",
          rank: 2,
          name: "Jude Bellingham",
          position: "Midfield",
          age: 23,
          club: "Real Madrid",
          nationality: "England",
          market_value_euros: 180000000,
        },
      ],
      total_players: 2,
    };
    const { ok, players, count } = parseTopPlayers(raw);
    expect(ok).toBe(true);
    expect(count).toBe(2);
    expect(players[0]).toMatchObject({
      id: "418560",
      name: "Erling Haaland",
      position: "FW",
      valueEur: 180000000,
      valueLabel: "€180m",
    });
    expect(players[1].position).toBe("MF");
  });

  it("兼容 parse.bot 实测响应壳 { status, data: { players } }", () => {
    const raw = {
      status: "success",
      data: {
        total_players: 1,
        players: [
          {
            rank: 1,
            name: "Désiré Doué",
            id: "914562",
            position: "Right Winger",
            age: 21,
            nationality: "France, Cote d'Ivoire",
            club: "Paris Saint-Germain",
            market_value: "€120.00m",
            market_value_euros: 120000000,
            portrait_url: "https://img.example/914562.jpg",
          },
        ],
      },
    };
    const { ok, players, count } = parseTopPlayers(raw);
    expect(ok).toBe(true);
    expect(count).toBe(1);
    expect(players[0]).toMatchObject({
      id: "914562",
      name: "Désiré Doué",
      position: "FW", // Right Winger → FW
      valueEur: 120000000,
      valueLabel: "€120m",
      portraitUrl: "https://img.example/914562.jpg",
    });
  });

  it("真实位置值全部正确归类", () => {
    const map = {
      "Right Winger": "FW",
      "Centre-Forward": "FW",
      "Attacking Midfield": "MF",
      "Central Midfield": "MF",
      "Left Winger": "FW",
      "Defensive Midfield": "MF",
      "Centre-Back": "DF",
      "Left-Back": "DF",
      "Right-Back": "DF",
      Goalkeeper: "GK",
    };
    for (const [raw, expected] of Object.entries(map)) {
      expect(normalizePosition(raw)).toBe(expected);
    }
  });

  it("容错：空 / 缺字段不炸", () => {
    expect(parseTopPlayers(null).ok).toBe(false);
    expect(parseTopPlayers({ players: [] }).ok).toBe(false);
    expect(parseTopPlayers({ players: [null, { name: "X" }] }).count).toBe(1);
  });

  it("上游重复返回同一球员（分页复读）→ 按 id 去重，保留首次(最小 rank)", () => {
    const raw = {
      players: [
        { id: "1", rank: 1, name: "Yamal", position: "Right Winger", age: 19, club: "FC Barcelona", nationality: "Spain", market_value_euros: 220000000 },
        { id: "2", rank: 2, name: "Haaland", position: "Attack", age: 26, club: "Manchester City", nationality: "Norway", market_value_euros: 220000000 },
        { id: "1", rank: 101, name: "Yamal", position: "Right Winger", age: 19, club: "FC Barcelona", nationality: "Spain", market_value_euros: 220000000 },
        { id: "2", rank: 102, name: "Haaland", position: "Attack", age: 26, club: "Manchester City", nationality: "Norway", market_value_euros: 220000000 },
        { id: "1", rank: 201, name: "Yamal", position: "Right Winger", age: 19, club: "FC Barcelona", nationality: "Spain", market_value_euros: 220000000 },
      ],
    };
    const { ok, players, count } = parseTopPlayers(raw);
    expect(ok).toBe(true);
    expect(count).toBe(2);
    expect(players.map((p: any) => p.id)).toEqual(["1", "2"]);
    // 保留首次出现（rank=1/2，非 101/102/201）
    expect(players[0].rank).toBe(1);
    expect(players[1].rank).toBe(2);
  });

  it("去重退化：无 id 时按归一 name 去重（大小写不敏感）", () => {
    const raw = {
      players: [
        { rank: 1, name: "Player A", position: "FW", market_value_euros: 50000000 },
        { rank: 2, name: "Player B", position: "MF", market_value_euros: 40000000 },
        { rank: 3, name: "player a", position: "FW", market_value_euros: 55000000 },
        { rank: 4, name: "Player B", position: "MF", market_value_euros: 40000000 },
      ],
    };
    const { count, players } = parseTopPlayers(raw);
    // "player a" 与 "Player A" 大小写不敏感去重 → 视为同一人；"Player B" 重复也去重
    expect(count).toBe(2);
    expect(players.map((p: any) => p.name)).toEqual(["Player A", "Player B"]);
    // 保留首次出现（rank=1 和 rank=2）
    expect(players[0].rank).toBe(1);
    expect(players[1].rank).toBe(2);
  });
});

describe("football-value/types", () => {
  it("normalizePosition 覆盖常见写法", () => {
    expect(normalizePosition("Goalkeeper")).toBe("GK");
    expect(normalizePosition("Defender")).toBe("DF");
    expect(normalizePosition("Centre-Back")).toBe("DF");
    expect(normalizePosition("Attacking Midfield")).toBe("MF");
    expect(normalizePosition("Striker")).toBe("FW");
    expect(normalizePosition(null)).toBeNull();
  });

  it("formatValueEur 分档", () => {
    expect(formatValueEur(180000000)).toBe("€180m");
    expect(formatValueEur(1500000000)).toBe("€1.5bn");
    expect(formatValueEur(500000)).toBe("€500k");
    expect(formatValueEur(0)).toBe("—");
    expect(formatValueEur(NaN)).toBe("—");
  });

  it("toPlayer 安全默认", () => {
    const p = toPlayer({ id: "1", name: "A", position: "FW" });
    expect(p.valueEur).toBe(0);
    expect(p.valueLabel).toBe("—");
    expect(p.rank).toBe(0);
    expect(p.isSample).toBe(false);
  });
});

describe("football-value/cache", () => {
  let tmpDir;

  beforeEach(() => {
    __resetForTest();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "football-value-cache-test-"));
    __setCacheDirForTest(tmpDir);
  });

  afterEach(() => {
    __resetForTest();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("writeCache → readCache 往返一致", () => {
    const key = cacheKey("top");
    writeCache(key, { players: [{ id: "1", name: "A" }] });
    const out = readCache(key);
    expect(out).not.toBeNull();
    expect(out.data.players[0].name).toBe("A");
    expect(typeof out.fetchedAt).toBe("number");
  });

  it("cacheKey 稳定（无日期）—— 3 天 TTL 节流手动刷新的基座", () => {
    // 稳定 key：date 入参被忽略，跨日复用同一份缓存
    expect(cacheKey("top")).toBe(cacheKey("top", "2000-01-01"));
    expect(cacheKey("top")).toBe("football-value:top:v2");
  });

  it("readLatestCache 返回稳定 key 唯一条目（涨跌基线已弃用）", () => {
    writeCache(cacheKey("top"), { players: [{ id: "1", valueEur: 200 }] });
    const out = readLatestCache("top");
    expect(out).not.toBeNull();
    expect(out.data.players[0].valueEur).toBe(200);
  });
});
