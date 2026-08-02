/**
 * src/renderer/football-value/types.ts
 *
 * main src/main/football-value/types.ts 的 renderer mirror。
 * 纯数据/纯函数，不依赖 api / store，保证可单测。
 * 字段保持与 main 一致以降低漂移风险（见 main types.ts 顶部注释）。
 */

/** 数据来源标记。 */
export const SOURCE = { LIVE: "live", SAMPLE: "sample", CACHE: "cache" };

/** 位置归一化映射。 */
export const POSITION_META = {
  GK: { label: "门将", order: 0 },
  DF: { label: "后卫", order: 1 },
  MF: { label: "中场", order: 2 },
  FW: { label: "前锋", order: 3 },
};

export const POSITION_KEYS = ["GK", "DF", "MF", "FW"];

/** 身价展示：整数欧元 → "€200.00m" / "€1.50bn"（对齐 Transfermarkt compact 风格）。 */
export function formatValueEur(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `€${(n / 1e9).toFixed(2).replace(/\.?0+$/, "")}bn`;
  if (n >= 1e6) return `€${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}m`;
  if (n >= 1e3) return `€${Math.round(n / 1e3)}k`;
  return `€${Math.round(n)}`;
}

