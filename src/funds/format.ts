/**
 * src/funds/format.ts
 *
 * 格式化单一来源 (阶段 B, 蓝图 §7).
 * 抽出 fmtCurrency / fmtPct / fmtNum / fmtDateLabel, 内容与 FundCard /
 * FundPnlHistory 既有本地实现逐字一致, 避免 UI 表头与 CSV 导出口径漂移.
 *
 * Phase 5: export-only（renderer 共享，禁止 module.exports）。
 */

export function fmtNum(n: any, digits = 4) {
  if (!Number.isFinite(n)) return '--';
  return n.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtCurrency(n: any) {
  if (!Number.isFinite(n)) return '¥0.00';
  const sign = n < 0 ? '-' : '';
  return `${sign}¥${Math.abs(n).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtPct(p: any) {
  if (!Number.isFinite(p)) return '0.00%';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

// 涨跌用 ▲▼ 前缀 — A 股习惯, 扫视时比单纯看颜色 + 符号更快
//   ponytail: 0 不加箭头 (灰色), 正加 ▲, 负加 ▼, 后跟原值
//   2026-07-26: 从 renderer/funds/FundDetail.tsx + FundList.tsx 合并到此（两份字节相同）
export function fmtSignedPct(p: any, fallback = '—') {
  const v = Number(p);
  if (!Number.isFinite(v)) return fallback;
  if (v === 0) return '0.00%';
  const arrow = v > 0 ? '▲' : '▼';
  const sign = v > 0 ? '+' : '';
  return `${arrow}${sign}${v.toFixed(2)}%`;
}

export function fmtDateLabel(ymd: any) {
  if (!ymd) return '--';
  const parts = ymd.split('-');
  if (parts.length < 3) return ymd;
  return `${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
}
