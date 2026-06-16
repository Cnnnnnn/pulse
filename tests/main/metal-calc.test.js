/**
 * tests/main/metal-calc.test.js
 *
 * metal-calc.js 单测 — 覆盖:
 *   - calcChange: 涨跌额/涨跌百分比, prevClose=0 兜底
 *   - convertToCNY: USD→CNY, CNY 透传, fx 缺失返回 null
 *   - calcHoldingPnl: 持仓 P&L (用冻结的 costPriceCNY), 缺失容错
 *   - calcTodayPnl: 今日预估 P&L, CNY 报价不需要 fx
 *   - calcOverview: 聚合 totalMV / totalPnl / todayEst, fx 缺失/null
 *
 * sampleQuote 包含由 calcChange 计算的 change / changePct 字段，
 * 让 calcTodayPnl / calcOverview 可以直接使用（避免重复算）。
 */

import { describe, it, expect } from 'vitest';
import {
  calcChange,
  calcHoldingPnl,
  calcTodayPnl,
  calcOverview,
  convertToCNY,
} from '../../src/metals/metal-calc.js';

const sampleQuote = {
  id: 'XAU',
  price: 2348.5,
  prevClose: 2338.7,
  change: 9.8,
  changePct: 0.419,
  currency: 'USD',
  unit: 'oz',
};

const sampleHolding = {
  id: 'h1',
  quantity: 0.5,
  costPrice: 2300,
  costCurrency: 'USD',
  costPriceCNY: 16590,
};

describe('calcChange', () => {
  it('computes change and pct', () => {
    const result = calcChange(sampleQuote);
    expect(result.change).toBeCloseTo(9.8, 5);
    expect(result.changePct).toBeCloseTo(0.419, 3);
  });

  it('returns 0 when prevClose is 0', () => {
    expect(calcChange({ ...sampleQuote, prevClose: 0 })).toEqual({ change: 0, changePct: 0 });
  });
});

describe('convertToCNY', () => {
  it('converts USD to CNY', () => {
    expect(convertToCNY(100, 'USD', 6.7557)).toBeCloseTo(675.57, 2);
  });

  it('returns same value for CNY', () => {
    expect(convertToCNY(500, 'CNY', 6.7557)).toBe(500);
  });

  it('returns null when fx is missing', () => {
    expect(convertToCNY(100, 'USD', null)).toBe(null);
  });
});

describe('calcHoldingPnl', () => {
  it('computes total pnl in CNY (using frozen costPriceCNY)', () => {
    const result = calcHoldingPnl(sampleHolding, sampleQuote, 6.7557);
    const currentCNY = 2348.5 * 6.7557 * 0.5;
    const pnlCNY = currentCNY - 16590;
    const pnlPct = (pnlCNY / 16590) * 100;
    expect(result).toEqual({
      pnlCNY: expect.closeTo(pnlCNY, 5),
      pnlPct: expect.closeTo(pnlPct, 5),
    });
  });

  it('returns null when holding is missing', () => {
    expect(calcHoldingPnl(null, sampleQuote, 6.7557)).toBe(null);
  });

  it('returns null when fx is missing (cannot compute current CNY)', () => {
    expect(calcHoldingPnl(sampleHolding, sampleQuote, null)).toBe(null);
  });
});

describe('calcTodayPnl', () => {
  it('uses quote change directly (already in quote currency)', () => {
    const result = calcTodayPnl(sampleHolding, sampleQuote, 6.7557);
    expect(result).toEqual({
      todayPnlCNY: 9.8 * 0.5 * 6.7557,
      todayPnlPct: 0.419,
    });
  });

  it('returns null when holding is missing', () => {
    expect(calcTodayPnl(null, sampleQuote, 6.7557)).toBe(null);
  });

  it('returns null when fx is missing for non-CNY quote', () => {
    expect(calcTodayPnl(sampleHolding, sampleQuote, null)).toBe(null);
  });

  it('does not need fx for CNY quotes', () => {
    const cnyQuote = { ...sampleQuote, currency: 'CNY' };
    expect(calcTodayPnl(sampleHolding, cnyQuote, null)).toEqual({
      todayPnlCNY: 9.8 * 0.5,
      todayPnlPct: 0.419,
    });
  });
});

describe('calcOverview', () => {
  const holdingMap = { XAU: sampleHolding };
  const quoteMap = { XAU: sampleQuote };
  const fx = 6.7557;

  it('aggregates total market value in CNY', () => {
    const result = calcOverview(holdingMap, quoteMap, fx);
    const expectedMV = 2348.5 * 6.7557 * 0.5;
    expect(result.totalMarketValueCNY).toBeCloseTo(expectedMV, 2);
  });

  it('aggregates total pnl using costPriceCNY', () => {
    const result = calcOverview(holdingMap, quoteMap, fx);
    const expectedMV = 2348.5 * 6.7557 * 0.5;
    expect(result.totalPnlCNY).toBeCloseTo(expectedMV - 16590, 2);
  });

  it('aggregates today estimated pnl', () => {
    const result = calcOverview(holdingMap, quoteMap, fx);
    expect(result.todayEstimatedCNY).toBeCloseTo(9.8 * 0.5 * 6.7557, 2);
  });

  it('returns null for CNY fields when fx is missing', () => {
    const result = calcOverview(holdingMap, quoteMap, null);
    expect(result.totalMarketValueCNY).toBe(null);
    expect(result.totalPnlCNY).toBe(null);
    expect(result.todayEstimatedCNY).toBe(null);
  });

  it('returns zeros when no holdings', () => {
    const result = calcOverview({}, quoteMap, fx);
    expect(result.totalMarketValueCNY).toBe(0);
    expect(result.totalPnlCNY).toBe(0);
    expect(result.todayEstimatedCNY).toBe(0);
  });
});
