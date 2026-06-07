/**
 * tests/renderer/filter-bar.test.jsx
 *
 * Phase 23: FilterBar 组件 — 渲染 / 交互 / Esc 清空.
 * 6 case.
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';

import {
  searchQuery,
  activeFilter,
  resetCheck,
} from '../../src/renderer/store.js';
import { results } from '../../src/renderer/store.js';
import { FilterBar } from '../../src/renderer/components/FilterBar.jsx';

function makeResult(over) {
  return {
    name: 'X',
    bundle: 'X.app',
    has_update: false,
    status: 'up_to_date',
    ...over,
  };
}

describe('FilterBar', () => {
  beforeEach(() => {
    resetCheck();
    searchQuery.value = '';
    activeFilter.value = 'all';
    // 给个默认 result set, tab counts 才会非 0
    results.value = new Map([
      ['A', makeResult({ name: 'A', has_update: true })],
      ['B', makeResult({ name: 'B', status: 'up_to_date' })],
    ]);
  });
  afterEach(() => cleanup());

  it('渲染 4 个 tab + 1 个 search input', () => {
    const { container, getByPlaceholderText } = render(<FilterBar />);
    expect(container.querySelectorAll('.filter-tab')).toHaveLength(4);
    expect(getByPlaceholderText('搜索 app 名称…')).toBeTruthy();
  });

  it('初始 active tab = 全部', () => {
    const { container } = render(<FilterBar />);
    const tabs = container.querySelectorAll('.filter-tab');
    expect(tabs[0].className).toContain('active');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('click "有更新" tab → 切 activeFilter', () => {
    const { container } = render(<FilterBar />);
    const tabs = container.querySelectorAll('.filter-tab');
    fireEvent.click(tabs[1]); // "有更新"
    expect(activeFilter.value).toBe('update');
    expect(tabs[1].className).toContain('active');
    expect(tabs[0].className).not.toContain('active');
  });

  it('键入 search → 改 searchQuery', () => {
    const { getByPlaceholderText } = render(<FilterBar />);
    const input = getByPlaceholderText('搜索 app 名称…');
    fireEvent.input(input, { target: { value: 'codex' } });
    expect(searchQuery.value).toBe('codex');
  });

  it('Esc → 清空 search (不清 tab)', () => {
    searchQuery.value = 'codex';
    activeFilter.value = 'update';
    const { getByPlaceholderText } = render(<FilterBar />);
    const input = getByPlaceholderText('搜索 app 名称…');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(searchQuery.value).toBe('');
    expect(activeFilter.value).toBe('update'); // tab 不动
  });

  it('tab counts 反映 results (全局, 不受自己 filter 影响)', () => {
    const { container } = render(<FilterBar />);
    const tabs = container.querySelectorAll('.filter-tab');
    // A=has_update, B=up_to_date. expected: all=2, update=1, latest=1, error=0
    expect(tabs[0].querySelector('.count').textContent).toBe('2');
    expect(tabs[1].querySelector('.count').textContent).toBe('1');
    expect(tabs[2].querySelector('.count').textContent).toBe('1');
    expect(tabs[3].querySelector('.count').textContent).toBe('0');
  });
});
