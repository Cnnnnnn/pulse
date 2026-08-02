/**
 * src/main/football-value/parser.ts
 *
 * 纯函数：parse.bot get_top_market_values 原始 JSON → Player[]。
 * 无网络依赖，可单测。
 *
 * parse.bot 响应结构（见 https://parse.bot 文档）：
 *   { players: [{ id, rank, name, position, age, nationality, club_id, club,
 *                 market_value, market_value_euros, portrait_url, profile_url }],
 *     total_players: number }
 */
"use strict";

import { toPlayer } from "./types";

/**
 * 解析 parse.bot Top 身价榜原始响应。
 * 兼容两种响应壳：
 *   - { players: [...] }（文档形式）
 *   - { status:"success", data: { total_players, players: [...] } }（实测形式，2026-08-02）
 * @param raw 原始 JSON（任意，容错）
 * @param opts { isSample?: boolean }
 * @returns {{ players: object[], ok: boolean, count: number }}
 */
export function parseTopPlayers(raw: any, opts: any = {}): any {
  const data = raw && typeof raw === "object" && raw.data && typeof raw.data === "object"
    ? raw.data
    : raw;
  const playersRaw = Array.isArray(data?.players) ? data.players : [];
  const players: any[] = [];
  // ponyfill: parse.bot 分页复读同一页 → 同一球员返回多份（仅 rank 递增）。
  // 去重键优先 id；缺 id 退化到归一 name，避免 id 缺失时全量塌成一条。
  const seen = new Set<string>();
  for (const p of playersRaw) {
    if (!p || typeof p !== "object") continue;
    const id = p.id != null ? String(p.id) : "";
    if (!id && !p.name) continue;

    const dedupKey = id || `name:${String(p.name).trim().toLowerCase()}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const valueEur =
      Number.isFinite(Number(p.market_value_euros)) && Number(p.market_value_euros) > 0
        ? Number(p.market_value_euros)
        : Number.isFinite(Number(p.valueEur)) && Number(p.valueEur) > 0
        ? Number(p.valueEur)
        : 0;
    players.push(
      toPlayer({
        id,
        rank: Number(p.rank) || 0,
        name: p.name,
        position: p.position,
        age: p.age,
        club: p.club,
        nationality: p.nationality,
        valueEur,
        portraitUrl: p.portrait_url || null,
        isSample: Boolean(opts.isSample),
      }),
    );
  }
  return { players, ok: players.length > 0, count: players.length };
}

module.exports = { parseTopPlayers };
