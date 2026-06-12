/**
 * src/renderer/worldcup/player-cn.js
 *
 * 球员中文译名解析 (player-cn-map.js 查表)
 */

import { PLAYER_CN } from "./player-cn-map.js";

export function resolvePlayerCn(player) {
  if (!player) return "";
  if (player.cn) return player.cn;
  return PLAYER_CN[player.name] || "";
}

export function resolvePlayerCnByName(name) {
  if (!name || typeof name !== "string") return "";
  return PLAYER_CN[name] || "";
}

export function attachSquadCn(squad) {
  return (squad || []).map((p) => ({
    ...p,
    cn: resolvePlayerCn(p),
  }));
}
