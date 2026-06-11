/**
 * tests/renderer/worldcup-groupByDate.test.js
 *
 * v2.9.0 世界杯专栏 — renderer 端 groupByDate 单测
 *
 * 跟 tests/main/worldcup-parser.test.js 同步, 测的是 renderer 端副本
 */

import { describe, it, expect } from 'vitest';
import { groupMatchesByDate } from '../../src/renderer/worldcup/groupByDate.js';

describe('groupMatchesByDate (renderer)', () => {
  it('空数组 → 空数组', () => {
    expect(groupMatchesByDate([])).toEqual([]);
  });

  it('按 date group, 同 date 顺序保留', () => {
    const g = groupMatchesByDate([
      { date: '2026-06-11', time: '20:00', team1: 'A', team2: 'B' },
      { date: '2026-06-11', time: '13:00', team1: 'C', team2: 'D' },
      { date: '2026-06-12', time: '13:00', team1: 'E', team2: 'F' },
    ]);
    expect(g).toHaveLength(2);
    expect(g[0].date).toBe('2026-06-11');
    expect(g[0].matches).toHaveLength(2);
    // matches 顺序按输入顺序 (不重排, 之前 parser sort 过)
    expect(g[0].matches[0].time).toBe('20:00');
    expect(g[0].matches[1].time).toBe('13:00');
    expect(g[1].date).toBe('2026-06-12');
  });

  it('无 date 的 match 跳过', () => {
    const g = groupMatchesByDate([
      { date: '2026-06-11', time: '13:00', team1: 'A', team2: 'B' },
      { time: '14:00', team1: 'C', team2: 'D' },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].matches).toHaveLength(1);
  });

  it('按 date 升序', () => {
    const g = groupMatchesByDate([
      { date: '2026-07-19', time: '15:00', team1: 'W101', team2: 'W102' },
      { date: '2026-06-11', time: '13:00', team1: 'A', team2: 'B' },
    ]);
    expect(g[0].date).toBe('2026-06-11');
    expect(g[1].date).toBe('2026-07-19');
  });
});
