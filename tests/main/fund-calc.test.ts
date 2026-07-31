/**
 * tests/main/fund-calc.test.js
 *
 * fundCalc.js 单测 — 覆盖:
 *   - 正常持仓的 marketValue / profit / profitPct
 *   - 盘中估值 vs 收盘确认的切换
 *   - 数据缺失 (navSnap=null) 时的兜底
 *   - 数据异常 (nav<=0) 不参与市值
 *   - 聚合: totalMarketValue / totalProfit / todayProfit / 计数
 *   - category 分组计数
 *   - zipHoldingsWithNav 串联
 *   - rowWithMetrics 串联
 */

import { describe, it, expect } from 'vitest';
import {
  calcFundMetrics,
  calcPortfolioTotal,
  groupCountByCategory,
  zipHoldingsWithNav,
  rowWithMetrics,
} from '../../src/funds/fundCalc.ts';

describe('calcFundMetrics', () => {
  it('基本盈利场景: 份额 × 当前净值 = 市值, 减成本 = 盈亏', () => {
    const m = calcFundMetrics(
      { shares: 10000, costNav: 1.0 },
      { nav: 1.2, estimatedNav: 1.21, dayChange: 0.01, estimated: true },
    );
    expect(m.marketValue).toBe(12100);    // 用 estimatedNav
    expect(m.costValue).toBe(10000);
    expect(m.profit).toBe(2100);
    expect(m.profitPct).toBe(21);
    expect(m.todayProfit).toBe(100);      // 10000 × 0.01 (estimated=true: 今日盘中)
    expect(m.usingEstimate).toBe(true);
  });

  it('亏损场景: profit < 0', () => {
    const m = calcFundMetrics(
      { shares: 5000, costNav: 2.0 },
      { nav: 1.5, dayChange: -0.02, estimated: true },
    );
    expect(m.marketValue).toBe(7500);
    expect(m.profit).toBe(-2500);
    expect(m.profitPct).toBe(-25);
    expect(m.todayProfit).toBe(-100);     // 5000 × -0.02 (estimated=true: 今日盘中)
    expect(m.usingEstimate).toBe(false);
  });

  it('盘中估值缺失 → 回退到 nav (收盘确认值)', () => {
    const m = calcFundMetrics(
      { shares: 1000, costNav: 1.0 },
      { nav: 1.15, dayChange: 0 },
    );
    expect(m.marketValue).toBe(1150);
    expect(m.usingEstimate).toBe(false);
    expect(m.todayProfit).toBe(0);
  });

  it('navSnap 缺失 → 全市场侧按 0, profit = -costValue', () => {
    const m = calcFundMetrics({ shares: 1000, costNav: 1.5 }, null);
    expect(m.marketValue).toBe(0);
    expect(m.costValue).toBe(1500);
    expect(m.profit).toBe(-1500);
    expect(m.profitPct).toBe(0);
    expect(m.todayProfit).toBe(0);
  });

  it('nav <= 0 数据异常 → marketValue=0, 不算 todayProfit', () => {
    const m = calcFundMetrics(
      { shares: 1000, costNav: 1.0 },
      { nav: 0, dayChange: 999 },
    );
    expect(m.marketValue).toBe(0);
    expect(m.profit).toBe(-1000);
    expect(m.todayProfit).toBe(0);
  });

  it('costNav = 0 → profitPct = 0 (避免 Infinity)', () => {
    const m = calcFundMetrics(
      { shares: 1000, costNav: 0 },
      { nav: 1.0, dayChange: 0.01 },
    );
    expect(m.costValue).toBe(0);
    expect(m.profit).toBe(1000);
    expect(m.profitPct).toBe(0);
  });

  it('字符串数字容错', () => {
    const m = calcFundMetrics(
      { shares: '10000.5', costNav: '1.234' },
      { nav: '1.5', dayChange: '0.01' },
    );
    expect(m.marketValue).toBe(15000.75);
    expect(m.costValue).toBe(12340.62);
  });

  it('NaN / undefined 容错 → 0', () => {
    const m = calcFundMetrics(
      { shares: undefined, costNav: NaN },
      { nav: null, dayChange: undefined },
    );
    expect(m.marketValue).toBe(0);
    expect(m.costValue).toBe(0);
    expect(m.profit).toBe(0);
    expect(m.todayProfit).toBe(0);
  });

  it('持有 0 份 → 全 0, 不报错', () => {
    const m = calcFundMetrics(
      { shares: 0, costNav: 1.5 },
      { nav: 2.0, dayChange: 0.05, estimated: true },
    );
    expect(m.marketValue).toBe(0);
    expect(m.costValue).toBe(0);
    expect(m.profit).toBe(0);
    expect(m.todayProfit).toBe(0);
  });

  // ── 今日盈亏 estimated gate (修复: 非交易时段旧估值差不当"今日"显示) ──
  it('今日盈亏 gate: estimated=true (今日盘中) → 正常累计 dayChange', () => {
    const m = calcFundMetrics(
      { shares: 100, costNav: 1.0 },
      { nav: 1.0, dayChange: 0.05, estimated: true },
    );
    expect(m.todayProfit).toBe(5);   // 100 × 0.05
  });

  it('今日盈亏 gate: estimated=false (上一交易日旧数据) → todayProfit 归零, 防误导', () => {
    const m = calcFundMetrics(
      { shares: 100, costNav: 1.0 },
      { nav: 1.0, dayChange: -0.03, estimated: false },
    );
    expect(m.todayProfit).toBe(0);   // 关键: 旧跌幅不当今日
    // 市值/总盈亏口径不受影响 (基于 effectiveNav, 与 estimated 无关)
    expect(m.marketValue).toBe(100);
    expect(m.profit).toBe(0);
  });

  it('今日盈亏 gate: estimated 缺失 → 防御性归零 (不假定是今日)', () => {
    const m = calcFundMetrics(
      { shares: 100, costNav: 1.0 },
      { nav: 1.0, dayChange: 0.05 },
    );
    expect(m.todayProfit).toBe(0);   // undefined !== true
  });

  // ── gateToday=false (历史快照口径): 非交易时段也记录最近交易日盈亏 ──
  it('gateToday=false: estimated=false 但 dayChange 有效 → 记录日盈亏', () => {
    const m = calcFundMetrics(
      { shares: 100, costNav: 1.0 },
      { nav: 1.0, dayChange: 0.05, dayChangePct: 5, estimated: false },
      { gateToday: false },
    );
    expect(m.todayProfit).toBe(5);        // 100 × 0.05
    expect(m.dailyReturnPct).toBe(5);     // 官方涨跌幅
  });

  it('gateToday=false: dayChange 缺失但 dayChangePct 有效 → 净值×涨跌幅反推', () => {
    const m = calcFundMetrics(
      { shares: 100, costNav: 1.0 },
      { nav: 2.0, dayChange: 0, dayChangePct: 3.24, estimated: false },
      { gateToday: false },
    );
    expect(m.todayProfit).toBeCloseTo(6.48, 2);  // 100 × 2.0 × 3.24%
    expect(m.dailyReturnPct).toBe(3.24);
  });

  it('gateToday 默认 true: UI 实时口径不变 (estimated=false → 0)', () => {
    const m = calcFundMetrics(
      { shares: 100, costNav: 1.0 },
      { nav: 1.0, dayChange: 0.05, dayChangePct: 5, estimated: false },
    );
    expect(m.todayProfit).toBe(0);
    expect(m.dailyReturnPct).toBe(0);
  });
});

// ── 字段补全: nav / dailyReturnPct / todayReturnPct ──
// 修复: UI (FundList "单位净值"/"日涨跌" 列, FundDetail 数据卡) 消费这些字段,
// 但 calcFundMetrics 此前从未产出 → 显示恒空. 现补齐.
describe('calcFundMetrics · 字段补全 (nav / dailyReturnPct / todayReturnPct)', () => {
  it('正常分支: nav=确认净值, dailyReturnPct/todayReturnPct 按 gate (estimated=true)', () => {
    const m = calcFundMetrics(
      { shares: 1000, costNav: 1.0 },
      { nav: 1.2, estimatedNav: 1.21, dayChange: 0.01, dayChangePct: 5, estimated: true },
    );
    expect(m.nav).toBe(1.2);                 // 确认单位净值 (非交易时段也能显示)
    expect(m.dailyReturnPct).toBe(5);        // = navSnap.dayChangePct (今日盘中)
    expect(m.todayReturnPct).toBe(5);        // 与 dailyReturnPct 等价 (风险计算用)
  });

  it('gate: estimated=false (非交易时段旧数据) → dailyReturnPct/todayReturnPct 归零, nav 仍显示', () => {
    const m = calcFundMetrics(
      { shares: 1000, costNav: 1.0 },
      { nav: 1.2, dayChangePct: -3.14, estimated: false },
    );
    expect(m.nav).toBe(1.2);                 // 净值不受 gate
    expect(m.dailyReturnPct).toBe(0);        // 旧 gszzl 不当今日
    expect(m.todayReturnPct).toBe(0);
  });

  it('navSnap 缺失分支 → nav=0, dailyReturnPct=0, todayReturnPct=0', () => {
    const m = calcFundMetrics({ shares: 1000, costNav: 1.0 }, null);
    expect(m.nav).toBe(0);
    expect(m.dailyReturnPct).toBe(0);
    expect(m.todayReturnPct).toBe(0);
  });

  it('净值异常分支 (effectiveNav<=0) → nav 保留 confirmedNav, dailyReturnPct/todayReturnPct=0', () => {
    const m = calcFundMetrics(
      { shares: 1000, costNav: 1.0 },
      { nav: 0, dayChangePct: 9, estimated: true },
    );
    expect(m.nav).toBe(0);                   // confirmedNav 透传
    expect(m.dailyReturnPct).toBe(0);        // 异常分支不参与
    expect(m.todayReturnPct).toBe(0);
  });

  it('字符串数字容错: dayChangePct 字符串 → number', () => {
    const m = calcFundMetrics(
      { shares: 1000, costNav: 1.0 },
      { nav: '1.2', dayChangePct: '3.5', estimated: true },
    );
    expect(m.dailyReturnPct).toBe(3.5);
    expect(m.nav).toBeCloseTo(1.2, 4);
  });
});

describe('calcPortfolioTotal', () => {
  it('空组合 → 全 0', () => {
    const t = calcPortfolioTotal([]);
    expect(t.totalMarketValue).toBe(0);
    expect(t.totalCost).toBe(0);
    expect(t.totalProfit).toBe(0);
    expect(t.totalProfitPct).toBe(0);
    expect(t.todayProfit).toBe(0);
    expect(t.count).toBe(0);
    expect(t.countWithNav).toBe(0);
  });

  it('3 只基金混合: 聚合市值/盈亏/今日预估', () => {
    const rows = [
      { holding: { shares: 10000, costNav: 1.0 }, navSnap: { nav: 1.2, estimatedNav: 1.21, dayChange: 0.01, estimated: true } },
      { holding: { shares: 5000, costNav: 2.0 },  navSnap: { nav: 1.5, dayChange: -0.02, estimated: true } },
      { holding: { shares: 1000, costNav: 0 },    navSnap: { nav: 1.0, dayChange: 0.005, estimated: true } },
    ];
    const t = calcPortfolioTotal(rows);
    expect(t.totalMarketValue).toBe(12100 + 7500 + 1000);   // 20600
    expect(t.totalCost).toBe(10000 + 10000 + 0);             // 20000
    expect(t.totalProfit).toBe(2100 - 2500 + 1000);          // 600
    expect(t.totalProfitPct).toBe(3);                        // 600/20000=3%
    expect(t.todayProfit).toBe(100 - 100 + 5);               // 5 (均为 estimated=true: 今日盘中)
    expect(t.count).toBe(3);
    expect(t.countWithNav).toBe(3);
  });

  it('含一只 nav 缺失 → countWithNav 只算有市值的', () => {
    const rows = [
      { holding: { shares: 1000, costNav: 1.0 }, navSnap: { nav: 1.2, dayChange: 0.01 } },
      { holding: { shares: 1000, costNav: 1.0 }, navSnap: null },
    ];
    const t = calcPortfolioTotal(rows);
    expect(t.count).toBe(2);
    expect(t.countWithNav).toBe(1);
    expect(t.totalMarketValue).toBe(1200);
  });

  it('全部成本 0 → totalProfitPct = 0', () => {
    const t = calcPortfolioTotal([
      { holding: { shares: 100, costNav: 0 }, navSnap: { nav: 1.5, dayChange: 0 } },
    ]);
    expect(t.totalProfit).toBe(150);
    expect(t.totalProfitPct).toBe(0);
  });

  it('今日盈亏 gate: 混合 estimated true/false → todayProfit 只累计实时 (今日盘中) 部分', () => {
    const t = calcPortfolioTotal([
      { holding: { shares: 10000, costNav: 1.0 }, navSnap: { nav: 1.2, dayChange: 0.01, estimated: true } },   // +100
      { holding: { shares: 5000, costNav: 2.0 },  navSnap: { nav: 1.5, dayChange: -0.02, estimated: false } }, // 旧数据, 不计
      { holding: { shares: 1000, costNav: 1.0 },  navSnap: { nav: 1.0, dayChange: 0.005 } },                   // estimated 缺失, 不计
    ]);
    expect(t.todayProfit).toBe(100);  // 仅第一只 (estimated=true)
    // 市值/总盈亏口径不受 gate 影响
    expect(t.totalMarketValue).toBe(12000 + 7500 + 1000);
  });

  it('calcPortfolioTotal 透传 gateToday=false → 非交易时段也累计日盈亏 (历史快照口径)', () => {
    const t = calcPortfolioTotal([
      { holding: { shares: 10000, costNav: 1.0 }, navSnap: { nav: 1.2, dayChange: 0.01, estimated: true } },    // +100
      { holding: { shares: 5000, costNav: 2.0 },  navSnap: { nav: 1.5, dayChange: -0.02, estimated: false } },  // -100 (最近交易日盈亏)
      { holding: { shares: 1000, costNav: 1.0 },  navSnap: { nav: 1.0, dayChange: 0.005, estimated: false } }, // +5
    ], { gateToday: false });
    expect(t.todayProfit).toBe(5);  // 100 - 100 + 5
  });
});

describe('groupCountByCategory', () => {
  it('空列表 → 空对象', () => {
    expect(groupCountByCategory([])).toEqual({});
  });

  it('按 category 计数', () => {
    const c = groupCountByCategory([
      { category: 'stock' },
      { category: 'stock' },
      { category: 'bond' },
      { category: 'qdii' },
      { category: 'other' },
    ]);
    expect(c).toEqual({ stock: 2, bond: 1, qdii: 1, other: 1 });
  });

  it('缺失 category → 算 other', () => {
    const c = groupCountByCategory([
      { category: 'stock' },
      {},
      null,
      { category: undefined },
    ]);
    expect(c.stock).toBe(1);
    expect(c.other).toBe(3);
  });
});

describe('zipHoldingsWithNav', () => {
  it('拍 holdings + navMap → rows', () => {
    const holdings = [
      { id: 'a', code: '000001', shares: 100 },
      { id: 'b', code: '000002', shares: 200 },
    ];
    const navMap = {
      '000001': { nav: 1.2, dayChange: 0.01 },
      // 000002 故意没在 map 里 (净值未拉取)
    };
    const rows = zipHoldingsWithNav(holdings, navMap);
    expect(rows).toHaveLength(2);
    expect(rows[0].navSnap.nav).toBe(1.2);
    expect(rows[1].navSnap).toBeUndefined();   // undefined != null, calcFundMetrics 会走兜底
  });

  it('null / undefined 输入 → 空数组', () => {
    expect(zipHoldingsWithNav(null, {})).toEqual([]);
    expect(zipHoldingsWithNav(undefined, {})).toEqual([]);
    expect(zipHoldingsWithNav([{ code: 'x' }], null)).toEqual([
      { holding: { code: 'x' }, navSnap: undefined },
    ]);
  });
});

describe('rowWithMetrics', () => {
  it('在 row 上挂 metrics 字段', () => {
    const row = rowWithMetrics({
      holding: { shares: 1000, costNav: 1.0 },
      navSnap: { nav: 1.5, dayChange: 0.01 },
    });
    expect(row.holding.shares).toBe(1000);
    expect(row.navSnap.nav).toBe(1.5);
    expect(row.metrics.marketValue).toBe(1500);
    expect(row.metrics.profit).toBe(500);
    expect(row.metrics.profitPct).toBe(50);
  });
});