/**
 * src/main/football-value/parser.ts
 *
 * 纯函数：dcaribou R2 两份 CSV.gz → Player[]（Top 500 身价榜）。
 * 无网络依赖，可单测（喂 mock gz buffer）。
 *
 * 数据流：
 *   valuations.gz (50万行身价历史) → 取每人最新一条（date 最大）→ Map<player_id, {mv, club}>
 *   players.gz (3万+球员档案) → join Map → 算 age → 排序 Top 500
 *
 * CSV 解析需处理引号（name 含逗号如 "Smith, John"），naive split 会错位。
 * 用状态机解析（inQ 引号态切换），覆盖实测的 26/27 列不一致。
 */
"use strict";

import * as zlib from "zlib";
import { toPlayer } from "./types";

/** 位置归一：dcaribou 用 Attack/Defender/Midfield/Goalkeeper → TM 四类。 */
function normPositionDC(raw: any): string {
  const s = String(raw || "").toLowerCase();
  if (!s) return "MF";
  if (s.includes("goal") || s.includes("keep")) return "GK";
  if (s.includes("defend") || s.includes("back")) return "DF";
  if (s.includes("mid")) return "MF";
  if (s.includes("attack") || s.includes("wing") || s.includes("forward") || s.includes("striker")) return "FW";
  return "MF"; // 兜底
}

/**
 * 极简 CSV 解析（处理引号 + 引号内逗号/换行）。
 * 返回 string[][]（含 header 行）。
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQ = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        /* skip */
      } else {
        field += c;
      }
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * 解析 dcaribou 两份 CSV.gz → Player[]（Top 500 身价降序）。
 * @param valuationsCsvGz Buffer（player_valuations.csv.gz）
 * @param playersCsvGz Buffer（players.csv.gz）
 * @param opts { isSample?: boolean, limit?: number }
 * @returns {{ players: object[], ok: boolean, count: number }}
 */
export function parseTopPlayers(
  valuationsCsvGz: Buffer | string,
  playersCsvGz: Buffer | string,
  opts: any = {},
): any {
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 500;
  const errors: string[] = [];

  // 1) 解压 + 解析 valuations
  let valText: string;
  let plaText: string;
  try {
    const valBuf = Buffer.isBuffer(valuationsCsvGz)
      ? valuationsCsvGz
      : Buffer.from(valuationsCsvGz);
    valText = zlib.gunzipSync(valBuf).toString("utf8");
  } catch (e: any) {
    return { players: [], ok: false, count: 0, errors: ["valuations gunzip failed: " + (e && e.message)] };
  }
  try {
    const plaBuf = Buffer.isBuffer(playersCsvGz)
      ? playersCsvGz
      : Buffer.from(playersCsvGz);
    plaText = zlib.gunzipSync(plaBuf).toString("utf8");
  } catch (e: any) {
    return { players: [], ok: false, count: 0, errors: ["players gunzip failed: " + (e && e.message)] };
  }

  // 2) valuations: 取每人最新身价（date 最大，mv > 0）
  // 字段: player_id, date, market_value_in_eur, current_club_name, current_club_id, ...
  const valLines = valText.split("\n");
  if (valLines.length < 2) {
    return { players: [], ok: false, count: 0, errors: ["valuations empty"] };
  }
  const latestVal = new Map<string, { date: string; mv: number; club: string }>();
  for (let i = 1; i < valLines.length; i++) {
    const line = valLines[i];
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 4) continue;
    const pid = parts[0];
    const date = parts[1];
    const mv = Number(parts[2]);
    const club = parts[3];
    if (!pid || !Number.isFinite(mv) || mv <= 0) continue;
    const ex = latestVal.get(pid);
    if (!ex || date > ex.date) {
      latestVal.set(pid, { date, mv, club });
    }
  }

  // 3) players: join + 构造 Player
  const plaRows = parseCSV(plaText);
  if (plaRows.length < 2) {
    return { players: [], ok: false, count: 0, errors: ["players empty"] };
  }
  const header = plaRows[0];
  const idx: Record<string, number> = {};
  for (const k of [
    "player_id",
    "name",
    "position",
    "sub_position",
    "country_of_citizenship",
    "date_of_birth",
    "image_url",
    "current_club_id",
  ]) {
    idx[k] = header.indexOf(k);
  }

  const players: any[] = [];
  for (let i = 1; i < plaRows.length; i++) {
    const r = plaRows[i];
    const pid = idx.player_id >= 0 ? r[idx.player_id] : "";
    if (!pid) continue;
    const v = latestVal.get(pid);
    if (!v) continue; // 无身价记录，跳过

    const name = idx.name >= 0 ? r[idx.name] : "";
    if (!name) continue;
    const position = idx.position >= 0 ? r[idx.position] : "";
    const nationality = idx.country_of_citizenship >= 0 ? r[idx.country_of_citizenship] : "";
    const birth = idx.date_of_birth >= 0 ? r[idx.date_of_birth] : "";
    const image = idx.image_url >= 0 ? r[idx.image_url] : "";
    const club = v.club && v.club !== "Unknown" ? v.club : "";

    // 算 age（birth 形如 "1978-06-09 00:00:00"）
    let age: number | null = null;
    if (birth) {
      const bd = new Date(birth);
      if (!isNaN(bd.getTime())) {
        age = Math.floor((Date.now() - bd.getTime()) / (365.25 * 24 * 3600 * 1000));
        if (age < 10 || age > 60) age = null; // 异常值丢弃
      }
    }

    players.push(
      toPlayer({
        id: pid,
        name,
        position: normPositionDC(position),
        age,
        club,
        nationality,
        valueEur: v.mv,
        portraitUrl: image || null,
        isSample: Boolean(opts.isSample),
      }),
    );
  }

  // 4) 按身价降序 + 去重（同 id 保留身价最高）+ Top N
  players.sort((a, b) => (Number(b.valueEur) || 0) - (Number(a.valueEur) || 0));
  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const p of players) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    deduped.push(p);
    if (deduped.length >= limit) break;
  }

  return { players: deduped, ok: deduped.length > 0, count: deduped.length, errors };
}

module.exports = { parseTopPlayers };
