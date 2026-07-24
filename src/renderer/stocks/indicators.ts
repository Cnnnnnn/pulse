/**
 * src/renderer/stocks/indicators.js
 *
 * UI 端从 closes 重算 MA / EMA / MACD series. pure function.
 * ponytail: 后端 tech_indicators fetcher 只返 MA5/10/20 + macdHist 单值, 不返序列.
 *   抽屉里 K 线主图要叠加 MA 折线 + MACD 柱, 在前端跑一遍足够 — 30 点 O(n) 不卡.
 *   0 后端侵入, 切股票后跟着 closes 一起刷新.
 */

export function maSeries(closes, n) {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const out = [];
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= n) sum -= closes[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}

export function emaSeries(closes, n) {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  if (closes.length < n) return new Array(closes.length).fill(null);
  const k = 2 / (n + 1);
  const out = new Array(n - 1).fill(null);
  let e = closes.slice(0, n).reduce((s, x) => s + x, 0) / n;
  out.push(e);
  for (let i = n; i < closes.length; i++) {
    e = closes[i] * k + e * (1 - k);
    out.push(e);
  }
  return out;
}

export function macdSeries(closes) {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { dif: [], dea: [], hist: [] };
  }
  // ponytail: macd 需要 closes.length >= 26 才稳定; 不足返回全 null.
  if (closes.length < 26) {
    return {
      dif: new Array(closes.length).fill(null),
      dea: new Array(closes.length).fill(null),
      hist: new Array(closes.length).fill(null),
    };
  }
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const dif = closes.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? ema12[i] - ema26[i] : null,
  );
  // DEA = EMA9(DIF), 只对 DIF 非 null 段计算, 前面补 null
  const firstValidIdx = dif.findIndex((v) => v != null);
  if (firstValidIdx < 0 || dif.length - firstValidIdx < 9) {
    return {
      dif,
      dea: new Array(closes.length).fill(null),
      hist: new Array(closes.length).fill(null),
    };
  }
  const validDif = dif.slice(firstValidIdx);
  const deaTail = emaSeries(validDif, 9);
  const dea = [
    ...new Array(firstValidIdx).fill(null),
    ...deaTail,
  ];
  // ponytail: 对齐长度防越界 — deaTail 长度可能 = validDif 长度, 跟 closes 长度不一定相等.
  while (dea.length < closes.length) dea.push(null);
  if (dea.length > closes.length) dea.length = closes.length;
  const hist = closes.map((_, i) =>
    dif[i] != null && dea[i] != null ? (dif[i] - dea[i]) * 2 : null,
  );
  return { dif, dea, hist };
}

export default { maSeries, emaSeries, macdSeries };
