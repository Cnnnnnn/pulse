/**
 * src/funds/fund-nav-merge.ts
 *
 * 多源净值合并 + 按用户所选数据源解析为单一快照.
 */

const DEVIATION_WARN_PCT = 0.5;
const NAV_SOURCES = ["tiantian", "sina"];
export const NAV_SOURCE_LABELS = {
  tiantian: "天天基金",
  sina: "新浪财经",
};
export const DEFAULT_NAV_SOURCE = "tiantian";

function round4(n: any) {
  const r = Math.round(n * 10000) / 10000;
  return r === 0 ? 0 : r;
}

function effectiveEstimate(snap: any) {
  if (!snap) return null;
  if (snap.estimatedNav != null && snap.estimatedNav > 0)
    return snap.estimatedNav;
  if (snap.nav != null && snap.nav > 0) return snap.nav;
  return null;
}

/**
 * 把新浪数据挂到天天基金主快照上.
 * @param {object} primary   mapFundData 输出
 * @param {object | null} alt  fetchFundNavSina 输出
 */
export function attachAltNav(primary: any, alt: any) {
  if (!primary || typeof primary !== "object") return primary;
  if (!alt) {
    return Object.assign({}, primary, {
      primarySource: "tiantian",
      altSource: "sina",
      altAvailable: false,
    });
  }

  const primaryEst = effectiveEstimate(primary);
  const altEst = effectiveEstimate(alt);
  let estimateDeviationPct = null;
  if (primaryEst != null && primaryEst > 0 && altEst != null && altEst > 0) {
    estimateDeviationPct = round4(((primaryEst - altEst) / primaryEst) * 100);
  }

  return Object.assign({}, primary, {
    primarySource: "tiantian",
    altSource: "sina",
    altAvailable: true,
    altNav: alt.nav,
    altEstimatedNav: alt.estimatedNav,
    altDayChangePct: alt.dayChangePct,
    altNavDate: alt.navDate,
    estimateDeviationPct,
    estimateDeviationHigh:
      estimateDeviationPct != null &&
      Math.abs(estimateDeviationPct) >= DEVIATION_WARN_PCT,
  });
}

export function normalizeNavSource(source: any) {
  return NAV_SOURCES.includes(source) ? source : DEFAULT_NAV_SOURCE;
}

function numOrZero(v: any) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 把合并后的双源快照解析为用户选定数据源的单源结构 (供 fundCalc 用).
 * @param {object | null | undefined} merged  attachAltNav 输出
 * @param {'tiantian' | 'sina'} [source]
 * @returns {object | null}
 */
export function resolveNavSnapshot(merged: any, source = DEFAULT_NAV_SOURCE) {
  if (!merged || typeof merged !== "object") return null;
  const src = normalizeNavSource(source);

  if (src === "tiantian") {
    return {
      code: merged.code,
      name: merged.name,
      nav: merged.nav,
      estimatedNav: merged.estimatedNav,
      dayChange: merged.dayChange,
      dayChangePct: merged.dayChangePct,
      navDate: merged.navDate,
      estimateTime: merged.estimateTime,
      estimated: merged.estimated,
      source: "tiantian",
    };
  }

  if (!merged.altAvailable) return null;

  const nav = numOrZero(merged.altNav);
  const estimatedNav =
    merged.altEstimatedNav != null && merged.altEstimatedNav > 0
      ? numOrZero(merged.altEstimatedNav)
      : null;

  if (nav <= 0 && !(estimatedNav != null && estimatedNav > 0)) return null;

  let dayChange = 0;
  if (estimatedNav != null && estimatedNav > 0 && nav > 0) {
    dayChange = +(estimatedNav - nav).toFixed(4);
  } else if (nav > 0 && Number.isFinite(merged.altDayChangePct)) {
    dayChange = +(nav * (merged.altDayChangePct / 100)).toFixed(4);
  }

  return {
    code: merged.code,
    name: merged.name,
    nav: nav > 0 ? nav : estimatedNav,
    estimatedNav,
    dayChange,
    dayChangePct: merged.altDayChangePct,
    navDate: merged.altNavDate,
    estimateTime: null,
    // TODO(已知问题): 新浪 of 接口只返回「净值日期」(altNavDate, 确认值交易日),
    // 无类似天天源 gztime 的「估值时间戳」. 这里 estimated 仅按"有估值净值"判定,
    // 会在非交易时段把旧估值误判成今日盘中 → 下游 todayProfit/dailyReturnPct 误差.
    // 完全修复需换带时间戳的数据源. 见 AGENTS 讨论记录 (2026-07-31).
    estimated: estimatedNav != null && estimatedNav > 0,
    source: "sina",
  };
}

/** 反填 / 预览用的有效净值数字 */
export function pickEffectiveNavNumber(merged: any, source = DEFAULT_NAV_SOURCE) {
  const snap = resolveNavSnapshot(merged, source);
  if (!snap) return null;
  if (snap.estimatedNav != null && snap.estimatedNav > 0)
    return snap.estimatedNav;
  if (snap.nav > 0) return snap.nav;
  return null;
}

