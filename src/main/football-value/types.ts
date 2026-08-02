/**
 * src/main/football-value/types.ts
 *
 * 模块级常量 + 基础构造（单一真源）。
 * 只放纯数据/纯函数（不引入任何网络/electron 依赖），保证可单测。
 *
 * 对齐 ai-leaderboard/types.ts 范式：renderer 侧有一份 mirror
 * （src/renderer/football-value/types.ts），字节可能漂移——保持字段简单以降低漂移风险。
 */
"use strict";

/** 数据来源标记。 */
export const SOURCE: Record<string, string> = { LIVE: "live", SAMPLE: "sample", CACHE: "cache" };

/** 位置归一化映射：原始 position（dcaribou Attack/Defender/Midfield/Goalkeeper）→ 标准四类。 */
export const POSITION_META: Record<string, any> = {
  GK: { label: "门将", order: 0 },
  DF: { label: "后卫", order: 1 },
  MF: { label: "中场", order: 2 },
  FW: { label: "前锋", order: 3 },
};

/** 位置别名 → 归一键（覆盖 Transfermarkt 中英文常见写法）。 */
export const POSITION_ALIASES: Record<string, string> = {
  goalkeeper: "GK",
  portier: "GK",
  keeper: "GK",
  gk: "GK",
  "defence": "DF",
  "defender": "DF",
  "defense": "DF",
  "defenseman": "DF",
  "defender centre": "DF",
  "centre back": "DF",
  "centre-back": "DF",
  "center back": "DF",
  "center-back": "DF",
  "df": "DF",
  "midfield": "MF",
  "midfielder": "MF",
  "central midfield": "MF",
  "central midfielder": "MF",
  "attacking midfield": "MF",
  "attacking midfielder": "MF",
  "defensive midfield": "MF",
  "defensive midfielder": "MF",
  "mf": "MF",
  "attack": "FW",
  "attacker": "FW",
  "striker": "FW",
  "centre forward": "FW",
  "center forward": "FW",
  "fw": "FW",
  "right wing": "FW",
  "left wing": "FW",
};

/**
 * 归一化位置 → POSITION_META 键（未知归 null，由上层决定是否丢弃/展示）。
 * @param raw
 * @returns {string|null}
 */
export function normalizePosition(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  if (!s) return null;
  if (POSITION_META[s]) return s;
  if (POSITION_ALIASES[s]) return POSITION_ALIASES[s];
  // 兜底：短语模糊匹配（如 "Centre Back" / "Right-Back" 含 back → DF）
  if (s.includes("back") || s.includes("defen") || s.includes("defence")) return "DF";
  if (s.includes("wing") || s.includes("striker") || s.includes("forward") || s.includes("attack")) return "FW";
  if (s.includes("mid")) return "MF";
  if (s.includes("goal") || s.includes("keep")) return "GK";
  return null;
}

/** 身价展示：整数欧元 → "€200.00m" / "€1.50bn"（对齐 Transfermarkt compact 风格）。 */
export function formatValueEur(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `€${(n / 1e9).toFixed(2).replace(/\.?0+$/, "")}bn`;
  if (n >= 1e6) return `€${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}m`;
  if (n >= 1e3) return `€${Math.round(n / 1e3)}k`;
  return `€${Math.round(n)}`;
}

/**
 * 构造一条规范化的 Player（缺字段补安全默认，避免 renderer 解构炸）。
 * @param raw
 * @returns {object}
 */
export function toPlayer(raw: any): any {
  const r = raw || {};
  const position = normalizePosition(r.position);
  const valueEur = Number(r.valueEur);
  return {
    id: r.id != null ? String(r.id) : "",
    name: String(r.name || "未知球员"),
    position: position || "MF", // 兜底中场，避免筛选全空
    age: Number.isFinite(Number(r.age)) ? Number(r.age) : null,
    club: r.club != null ? String(r.club) : "",
    league: r.league != null ? String(r.league) : null,
    nationality: r.nationality != null ? String(r.nationality) : "",
    valueEur: Number.isFinite(valueEur) && valueEur > 0 ? valueEur : 0,
    valueLabel: r.valueLabel || formatValueEur(valueEur),
    rank: Number.isFinite(Number(r.rank)) ? Number(r.rank) : 0,
    portraitUrl: r.portraitUrl != null ? String(r.portraitUrl) : null,
    isSample: Boolean(r.isSample),
  };
}

module.exports = {
  SOURCE,
  POSITION_META,
  POSITION_ALIASES,
  normalizePosition,
  formatValueEur,
  toPlayer,
};
