/**
 * src/funds/format.js
 *
 * 格式化单一来源 (阶段 B, 蓝图 §7).
 * 抽出 fmtCurrency / fmtPct / fmtNum / fmtDateLabel, 内容与 FundCard /
 * FundPnlHistory 既有本地实现逐字一致, 避免 UI 表头与 CSV 导出口径漂移.
 *
 * 模块风格与 fundCalc.js 一致 (CJS module.exports), 供 renderer 组件 ESM
 * import 与 vitest 共用, 确保 build:renderer 打包通过.
 */

function fmtNum(n, digits = 4) {
  if (!Number.isFinite(n)) return '--';
  return n.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtCurrency(n) {
  if (!Number.isFinite(n)) return '¥0.00';
  const sign = n < 0 ? '-' : '';
  return `${sign}¥${Math.abs(n).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtPct(p) {
  if (!Number.isFinite(p)) return '0.00%';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

function fmtDateLabel(ymd) {
  if (!ymd) return '--';
  const parts = ymd.split('-');
  if (parts.length < 3) return ymd;
  return `${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
}

module.exports = { fmtNum, fmtCurrency, fmtPct, fmtDateLabel };
