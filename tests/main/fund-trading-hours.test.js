/**
 * tests/main/fund-trading-hours.test.js
 *
 * trading-hours.js 单测 — 覆盖:
 *   - 上午 / 下午 / 边界
 *   - 盘前 / 午休 / 盘后
 *   - 周末
 *   - 节假日 (可选 list)
 *   - nextOpenAt 计算正确性
 *   - msUntilNextOpen / msUntilNextFetch
 */

import { describe, it, expect } from 'vitest';
import { getTradingStatus, msUntilNextOpen, msUntilNextFetch } from '../../src/funds/trading-hours.js';

// 用 Asia/Shanghai 锁定时区, 避免 CI 跑出来本地时间飘掉
const TZ = 'Asia/Shanghai';
process.env.TZ = TZ;  // vitest 没显式 env 时, 改 process.env.TZ 仍然要重启... 算了, 用 Date 构造时手动指定本地时间

// 工具: 在本地时区构造一个 Date (用字符串解析, 避开 UTC 偏移坑)
// 实际跑测试时, CI 环境 TZ=UTC (vitest.config.js 设的), 所以下面 "2026-06-12 10:00:00" 会被当成 UTC
// 我们关心的是 getHours()/getMinutes() 在 UTC 时区下的行为, 所以构造时按 UTC 字符串即可
function local(yyyyMmDdHhMm) {
  // yyyyMmDdHhMm 格式 "2026-06-12T09:30:00" (不带 Z, 表示本地时间)
  // CI 默认 UTC, 所以这里实际表达 UTC 时间. 测试断言按"这台机器认为的本地时间".
  // vitest.config.js env.TZ = 'UTC', 所以下面所有 Date 都按 UTC 解释.
  return new Date(yyyyMmDdHhMm);
}

describe('getTradingStatus', () => {
  it('工作日上午 09:30 → trading/morning (边界)', () => {
    const s = getTradingStatus(local('2026-06-15T09:30:00'));   // 周一
    expect(s.isTrading).toBe(true);
    expect(s.session).toBe('morning');
  });

  it('工作日上午 11:29 → trading/morning (边界前)', () => {
    const s = getTradingStatus(local('2026-06-15T11:29:00'));
    expect(s.isTrading).toBe(true);
    expect(s.session).toBe('morning');
  });

  it('工作日上午 11:30 → closed (上午收盘)', () => {
    const s = getTradingStatus(local('2026-06-15T11:30:00'));
    expect(s.isTrading).toBe(false);
    expect(s.session).toBe('closed');
  });

  it('工作日午休 12:00 → closed, nextOpenAt = 当天 13:00', () => {
    const s = getTradingStatus(local('2026-06-15T12:00:00'));
    expect(s.isTrading).toBe(false);
    expect(s.nextOpenAt).not.toBeNull();
    expect(s.nextOpenAt.getHours()).toBe(13);
    expect(s.nextOpenAt.getMinutes()).toBe(0);
  });

  it('工作日下午 13:00 → trading/afternoon (边界)', () => {
    const s = getTradingStatus(local('2026-06-15T13:00:00'));
    expect(s.isTrading).toBe(true);
    expect(s.session).toBe('afternoon');
  });

  it('工作日下午 14:59 → trading/afternoon (边界前)', () => {
    const s = getTradingStatus(local('2026-06-15T14:59:00'));
    expect(s.isTrading).toBe(true);
    expect(s.session).toBe('afternoon');
  });

  it('工作日下午 15:00 → closed, nextOpenAt = 下一交易日 09:30', () => {
    const s = getTradingStatus(local('2026-06-15T15:00:00'));
    expect(s.isTrading).toBe(false);
    expect(s.nextOpenAt.getDay()).toBe(2);   // 周一
    expect(s.nextOpenAt.getHours()).toBe(9);
    expect(s.nextOpenAt.getMinutes()).toBe(30);
  });

  it('工作日盘前 09:00 → closed, nextOpenAt = 当天 09:30', () => {
    const s = getTradingStatus(local('2026-06-15T09:00:00'));
    expect(s.isTrading).toBe(false);
    expect(s.nextOpenAt.getHours()).toBe(9);
    expect(s.nextOpenAt.getMinutes()).toBe(30);
  });

  it('周六 → closed, nextOpenAt = 下周一 09:30', () => {
    const s = getTradingStatus(local('2026-06-13T10:00:00'));   // 周六
    expect(s.isTrading).toBe(false);
    expect(s.nextOpenAt.getDay()).toBe(1);   // 周一
    expect(s.nextOpenAt.getHours()).toBe(9);
    expect(s.nextOpenAt.getMinutes()).toBe(30);
  });

  it('周日 → closed, nextOpenAt = 下周一 09:30', () => {
    const s = getTradingStatus(local('2026-06-14T20:00:00'));   // 周日
    expect(s.isTrading).toBe(false);
    expect(s.nextOpenAt.getDay()).toBe(1);
  });

  it('节假日 (传入 holidays) → closed, nextOpenAt 跳过', () => {
    const holidays = [local('2026-06-16T00:00:00')];   // 周二标记节假日
    const s = getTradingStatus(local('2026-06-16T10:00:00'), holidays);
    expect(s.isTrading).toBe(false);
    expect(s.nextOpenAt.getDay()).toBe(3);   // 周三
  });

  it('Friday 收盘后 → nextOpenAt = 下周一', () => {
    const s = getTradingStatus(local('2026-06-19T15:30:00'));   // 周五
    expect(s.isTrading).toBe(false);
    expect(s.nextOpenAt.getDay()).toBe(1);
  });

  it('非法 Date → closed/null', () => {
    const s = getTradingStatus(new Date('not-a-date'));
    expect(s.isTrading).toBe(false);
    expect(s.session).toBe('closed');
    expect(s.nextOpenAt).toBeNull();
  });
});

describe('msUntilNextOpen', () => {
  it('交易时段内 → 0', () => {
    const ms = msUntilNextOpen(local('2026-06-15T10:00:00'));
    expect(ms).toBe(0);
  });

  it('盘前 09:00 → 30 分钟 (1800000 ms)', () => {
    const ms = msUntilNextOpen(local('2026-06-15T09:00:00'));
    expect(ms).toBe(30 * 60 * 1000);
  });

  it('午休 12:00 → 60 分钟 (3600000 ms)', () => {
    const ms = msUntilNextOpen(local('2026-06-15T12:00:00'));
    expect(ms).toBe(60 * 60 * 1000);
  });

  it('周五 15:30 → 周末 + 周一早上 = ~ 66 小时 (含开盘前)', () => {
    const ms = msUntilNextOpen(local('2026-06-19T15:30:00'));
    // 周末 48h + 周一早上距离周五收盘: 周一 09:30 - 周五 15:30 = 66h
    expect(ms).toBeGreaterThan(60 * 60 * 1000);
    expect(ms).toBeLessThan(70 * 60 * 60 * 1000);
  });
});

describe('msUntilNextFetch', () => {
  it('交易时段内 → 返回 intervalMs (e.g. 5 分钟)', () => {
    const ms = msUntilNextFetch(local('2026-06-15T10:00:00'), { intervalMs: 5 * 60 * 1000 });
    expect(ms).toBe(5 * 60 * 1000);
  });

  it('盘前 → 跳到下次开盘', () => {
    const ms = msUntilNextFetch(local('2026-06-15T09:00:00'), { intervalMs: 5 * 60 * 1000 });
    expect(ms).toBe(30 * 60 * 1000);  // 等到 09:30
  });

  it('周末 → 跳到下周一', () => {
    const ms = msUntilNextFetch(local('2026-06-13T10:00:00'), { intervalMs: 5 * 60 * 1000 });
    expect(ms).toBeGreaterThan(60 * 60 * 1000);
  });
});