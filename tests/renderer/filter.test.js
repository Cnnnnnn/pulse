/**
 * tests/renderer/filter.test.js
 *
 * Phase 23: matchesFilter 纯函数 + tabCounts 派生数据.
 * 12 case: 各 search / tab 组合 + edge.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { matchesFilter, tabCounts, filteredResults } from '../../src/renderer/selectors.js';
import { results, searchQuery, activeFilter, resetCheck } from '../../src/renderer/store.js';

function makeResult(over) {
  return {
    name: 'X',
    bundle: 'X.app',
    has_update: false,
    status: 'up_to_date',
    ...over,
  };
}

describe('matchesFilter (纯函数)', () => {
  it('tab=all + q="" → 全部 pass', () => {
    const r = makeResult({});
    expect(matchesFilter(r, 'all', '')).toBe(true);
  });

  it('tab=update + has_update=true → pass', () => {
    const r = makeResult({ has_update: true });
    expect(matchesFilter(r, 'update', '')).toBe(true);
  });

  it('tab=update + has_update=false → fail', () => {
    const r = makeResult({ has_update: false });
    expect(matchesFilter(r, 'update', '')).toBe(false);
  });

  it('tab=latest + up_to_date + !has_update → pass', () => {
    const r = makeResult({ status: 'up_to_date', has_update: false });
    expect(matchesFilter(r, 'latest', '')).toBe(true);
  });

  it('tab=latest + has_update=true → fail (不在最新状态)', () => {
    const r = makeResult({ status: 'up_to_date', has_update: true });
    expect(matchesFilter(r, 'latest', '')).toBe(false);
  });

  it('tab=latest + status=no_auto_check → fail (不算 latest)', () => {
    const r = makeResult({ status: 'no_auto_check' });
    expect(matchesFilter(r, 'latest', '')).toBe(false);
  });

  it('tab=error + status=error → pass', () => {
    const r = makeResult({ status: 'error' });
    expect(matchesFilter(r, 'error', '')).toBe(true);
  });

  it('tab=error + status=up_to_date → fail', () => {
    const r = makeResult({ status: 'up_to_date' });
    expect(matchesFilter(r, 'error', '')).toBe(false);
  });

  it('search "codex" 匹配 name "Codex" (case-insensitive)', () => {
    const r = makeResult({ name: 'Codex' });
    expect(matchesFilter(r, 'all', 'codex')).toBe(true);
  });

  it('search 匹配 bundle id', () => {
    const r = makeResult({ name: 'Other', bundle: 'CodexBar.app' });
    expect(matchesFilter(r, 'all', 'codexbar')).toBe(true);
  });

  it('search 不匹配 → fail', () => {
    const r = makeResult({ name: 'Cursor', bundle: 'Cursor.app' });
    expect(matchesFilter(r, 'all', 'codex')).toBe(false);
  });

  it('search "c++" 等特殊字符 → substring OK (非 regex)', () => {
    const r = makeResult({ name: 'GNUstep c++ tools' });
    expect(matchesFilter(r, 'all', 'c++')).toBe(true);
  });

  it('组合: search "codex" + tab=update, has_update → pass', () => {
    const r = makeResult({ name: 'Codex', has_update: true });
    expect(matchesFilter(r, 'update', 'codex')).toBe(true);
  });

  it('组合: search 不匹配 → fail 即便 tab pass', () => {
    const r = makeResult({ name: 'Cursor', has_update: true });
    expect(matchesFilter(r, 'update', 'codex')).toBe(false);
  });

  it('空 result → fail (null guard)', () => {
    expect(matchesFilter(null, 'all', '')).toBe(false);
    expect(matchesFilter(undefined, 'all', '')).toBe(false);
  });

  it('result 没 bundle + search 不匹配 name → fail', () => {
    const r = makeResult({ name: 'Cursor' });
    r.bundle = undefined;
    expect(matchesFilter(r, 'all', 'foo')).toBe(false);
  });
});

describe('tabCounts (computed)', () => {
  beforeEach(() => {
    resetCheck();
  });

  it('全 has_update → update=N, latest=0', () => {
    results.value = new Map([
      ['A', makeResult({ name: 'A', has_update: true })],
      ['B', makeResult({ name: 'B', has_update: true })],
    ]);
    const c = tabCounts.value;
    expect(c.all).toBe(2);
    expect(c.update).toBe(2);
    expect(c.latest).toBe(0);
    expect(c.error).toBe(0);
  });

  it('混合: 1 update + 2 latest + 1 error', () => {
    results.value = new Map([
      ['A', makeResult({ name: 'A', has_update: true })],
      ['B', makeResult({ name: 'B', status: 'up_to_date' })],
      ['C', makeResult({ name: 'C', status: 'up_to_date' })],
      ['D', makeResult({ name: 'D', status: 'error' })],
    ]);
    const c = tabCounts.value;
    // v2.7.0: tabCounts 多 starred + unmonitored 字段, 用 toMatchObject 只校验老字段
    expect(c).toMatchObject({ all: 4, update: 1, latest: 2, error: 1 });
  });

  it('counts 不受 filter 影响 (用全局 results 算)', () => {
    results.value = new Map([
      ['A', makeResult({ name: 'A', has_update: true })],
    ]);
    searchQuery.value = 'foo';
    activeFilter.value = 'error';
    const c = tabCounts.value;
    expect(c.all).toBe(1);
    expect(c.update).toBe(1);
  });
});

describe('filteredResults (computed)', () => {
  beforeEach(() => {
    resetCheck();
    searchQuery.value = '';
    activeFilter.value = 'all';
  });

  it('空 results → 空 filtered', () => {
    results.value = new Map();
    expect(filteredResults.value.size).toBe(0);
  });

  it('应用 tab + search 过滤', () => {
    results.value = new Map([
      ['A', makeResult({ name: 'A', has_update: true })],
      ['B', makeResult({ name: 'B', status: 'up_to_date' })],
    ]);
    activeFilter.value = 'update';
    const f = filteredResults.value;
    expect(f.size).toBe(1);
    expect(f.has('A')).toBe(true);
  });

  it('search + tab 组合', () => {
    results.value = new Map([
      ['Codex',    makeResult({ name: 'Codex', has_update: true })],
      ['CodexBar', makeResult({ name: 'CodexBar', status: 'up_to_date' })],
    ]);
    searchQuery.value = 'codex';
    activeFilter.value = 'update';
    const f = filteredResults.value;
    expect(f.size).toBe(1);
    expect(f.has('Codex')).toBe(true);
  });
});
