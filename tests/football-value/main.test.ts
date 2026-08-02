/**
 * tests/football-value/main.test.ts
 *
 * 主进程数据层测试：
 *   1) parser: dcaribou gz CSV → Player[]（join + 取最新身价 + 位置归一）
 *   2) types: normalizePosition / formatValueEur / toPlayer 安全默认
 *   3) cache: write/read 往返 + readLatestCache 排除今天
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
const { requireMain } = require("../_setup/require-main.cjs");

// 构造微型 dcaribou CSV.gz 测试夹具（valuations + players）
function gz(s: string): Buffer {
  return zlib.gzipSync(Buffer.from(s, "utf8"));
}

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
  // 微型 dcaribou CSV 夹具：2 球员 + 各自身价记录
  const VAL_CSV =
    "player_id,date,market_value_in_eur,current_club_name,current_club_id,player_club_domestic_competition_id\n" +
    "1,2025-12-09,180000000,Manchester City,281,GB1\n" +
    "1,2024-06-01,150000000,Manchester City,281,GB1\n" + // 旧记录，应被新记录覆盖
    "2,2025-12-12,160000000,Real Madrid,150,ES1\n";
  const PLA_CSV =
    "player_id,first_name,last_name,name,last_season,current_club_id,player_code,country_of_birth,city_of_birth,country_of_citizenship,date_of_birth,sub_position,position,foot,height_in_cm,contract_expiration_date,agent_name,image_url\n" +
    '1,Erling,Haaland,Erling Haaland,2025,281,erling-haaland,England,Leeds,Norway,2000-07-21 00:00:00,Centre-Forward,Attack,left,194,,Roc Nation,https://img.example/1.jpg\n' +
    '2,Jude,Bellingham,Jude Bellingham,2025,150,jude-bellingham,England,Stourbridge,England,2003-06-29 00:00:00,Attacking Midfield,Midfield,right,186,,IMG,https://img.example/2.jpg\n';

  it("解析 dcaribou gz CSV → Player[]（join + 取最新身价 + 位置归一）", () => {
    const { ok, players, count } = parseTopPlayers(gz(VAL_CSV), gz(PLA_CSV));
    expect(ok).toBe(true);
    expect(count).toBe(2);
    // 身价降序：Haaland 180m > Bellingham 160m
    expect(players[0]).toMatchObject({
      id: "1",
      name: "Erling Haaland",
      position: "FW",
      valueEur: 180000000,
      valueLabel: "€180m",
      nationality: "Norway",
      club: "Manchester City",
      portraitUrl: "https://img.example/1.jpg",
    });
    expect(players[1]).toMatchObject({
      id: "2",
      name: "Jude Bellingham",
      position: "MF",
      valueEur: 160000000,
    });
  });

  it("取每人最新身价（同球员多条记录 → date 最大那条）", () => {
    // Haaland 有 2024-06 (150m) 和 2025-12 (180m) → 应取 180m
    const { players } = parseTopPlayers(gz(VAL_CSV), gz(PLA_CSV));
    const haaland = players.find((p: any) => p.id === "1");
    expect(haaland.valueEur).toBe(180000000); // 不是 150m
  });

  it("引号内逗号不破坏 CSV 解析（name 含逗号场景）", () => {
    const plaWithComma =
      "player_id,name,position,country_of_citizenship,date_of_birth,image_url\n" +
      '1,"Smith, John",Attack,England,1990-01-01 00:00:00,img.jpg\n';
    const { players } = parseTopPlayers(
      gz("player_id,date,market_value_in_eur,current_club_name,current_club_id\n1,2025-01-01,50000000,Club,1\n"),
      gz(plaWithComma),
    );
    expect(players[0].name).toBe("Smith, John");
    expect(players[0].position).toBe("FW");
  });

  it("位置归一：dcaribou Attack/Defender/Midfield/Goalkeeper → 四类", () => {
    const pla =
      "player_id,name,position,country_of_citizenship,date_of_birth,image_url\n" +
      "1,P1,Attack,X,2000-01-01,\n2,P2,Defender,X,2000-01-01,\n3,P3,Midfield,X,2000-01-01,\n4,P4,Goalkeeper,X,2000-01-01,\n";
    const val =
      "player_id,date,market_value_in_eur,current_club_name,current_club_id\n" +
      "1,2025-01-01,50000000,C,1\n2,2025-01-01,40000000,C,1\n3,2025-01-01,30000000,C,1\n4,2025-01-01,20000000,C,1\n";
    const { players } = parseTopPlayers(gz(val), gz(pla));
    const pos = players.map((p: any) => p.position);
    expect(pos).toContain("FW");
    expect(pos).toContain("DF");
    expect(pos).toContain("MF");
    expect(pos).toContain("GK");
  });

  it("容错：空 / 损坏 gz 不炸", () => {
    expect(parseTopPlayers(gz(""), gz(PLA_CSV)).ok).toBe(false);
    expect(parseTopPlayers(gz(VAL_CSV), gz("")).ok).toBe(false);
    expect(parseTopPlayers(Buffer.from("not-gzip"), gz(PLA_CSV)).ok).toBe(false);
  });

  it("无身价记录的球员被跳过（join 内连接）", () => {
    const pla =
      "player_id,name,position,country_of_citizenship,date_of_birth,image_url\n" +
      "1,HasVal,Attack,X,2000-01-01,\n2,NoVal,Attack,X,2000-01-01,\n";
    const val = "player_id,date,market_value_in_eur,current_club_name,current_club_id\n1,2025-01-01,50000000,C,1\n";
    const { count, players } = parseTopPlayers(gz(val), gz(pla));
    expect(count).toBe(1);
    expect(players[0].name).toBe("HasVal");
  });

  it("limit 限制返回数 + 按身价降序", () => {
    const pla =
      "player_id,name,position,country_of_citizenship,date_of_birth,image_url\n" +
      "1,A,Attack,X,2000-01-01,\n2,B,Attack,X,2000-01-01,\n3,C,Attack,X,2000-01-01,\n";
    const val =
      "player_id,date,market_value_in_eur,current_club_name,current_club_id\n" +
      "1,2025-01-01,30000000,C,1\n2,2025-01-01,100000000,C,1\n3,2025-01-01,50000000,C,1\n";
    const { players, count } = parseTopPlayers(gz(val), gz(pla), { limit: 2 });
    expect(count).toBe(2);
    expect(players[0].valueEur).toBe(100000000); // B 最高
    expect(players[1].valueEur).toBe(50000000); // C 次之
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
