/**
 * src/renderer/worldcup/player-cn.js
 *
 * 球员中文译名解析 (player-cn-map.js 查表)
 */

import { PLAYER_CN } from "./player-cn-map.ts";

export function resolvePlayerCn(player: any) {
  if (!player) return "";
  if (player.cn) return player.cn;
  return PLAYER_CN[player.name] || "";
}

export function resolvePlayerCnByName(name: any) {
  if (!name || typeof name !== "string") return "";
  return PLAYER_CN[name] || "";
}

export function attachSquadCn(squad: any) {
  return (squad || []).map((p: any) => ({
    ...p,
    cn: resolvePlayerCn(p),
  }));
}
