/**
 * tests/main/search/search-index.test.js
 * A3: inverted index — buildFromState / upsert / query / counts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSearchIndex } from '../../../src/main/search/search-index.js';

describe('search-index', () => {
  let idx;

  beforeEach(() => {
    idx = createSearchIndex();
  });

  it('upsert adds doc and query finds it', () => {
    idx.upsert({
      id: 'news:1', source: 'news', nativeId: '1',
      title: 'Cursor 性能优化', snippet: '', searchText: 'Cursor性能优化',
      payload: { dateMs: 1000 },
    });
    const res = idx.query('性能');
    expect(res.results).toHaveLength(1);
    expect(res.results[0].id).toBe('news:1');
  });

  it('upsert same id overwrites', () => {
    idx.upsert({ id: 'news:1', source: 'news', nativeId: '1', title: '旧', snippet: '', searchText: '旧标题', payload: {} });
    idx.upsert({ id: 'news:1', source: 'news', nativeId: '1', title: '新标题', snippet: '', searchText: '新标题', payload: {} });
    const res = idx.query('新标题');
    expect(res.results).toHaveLength(1);
    expect(res.results[0].title).toBe('新标题');
  });

  it('title hit scores higher than body hit', () => {
    idx.upsert({ id: 'a:1', source: 'news', nativeId: '1', title: '性能', snippet: '', searchText: '性能', payload: { dateMs: 1000 } });
    idx.upsert({ id: 'a:2', source: 'news', nativeId: '2', title: '其他', snippet: '', searchText: '正文里提到性能', payload: { dateMs: 1000 } });
    const res = idx.query('性能');
    expect(res.results[0].id).toBe('a:1'); // 标题命中排前
  });

  it('AND semantics: all query tokens must match', () => {
    idx.upsert({ id: 'a:1', source: 'news', nativeId: '1', title: 'Cursor 更新', snippet: '', searchText: 'Cursor 更新', payload: {} });
    idx.upsert({ id: 'a:2', source: 'news', nativeId: '2', title: 'Cursor 老版本', snippet: '', searchText: 'Cursor 老版本', payload: {} });
    const res = idx.query('Cursor 更新');
    expect(res.results.map(r => r.id)).toEqual(['a:1']);
  });

  it('filters by source', () => {
    idx.upsert({ id: 'news:1', source: 'news', nativeId: '1', title: 'Cursor', snippet: '', searchText: 'Cursor', payload: {} });
    idx.upsert({ id: 'reminder:1', source: 'reminder', nativeId: '1', title: 'Cursor 提醒', snippet: '', searchText: 'Cursor 提醒', payload: {} });
    const res = idx.query('Cursor', { source: 'reminder' });
    expect(res.results).toHaveLength(1);
    expect(res.results[0].source).toBe('reminder');
  });

  it('counts per source', () => {
    idx.upsert({ id: 'news:1', source: 'news', nativeId: '1', title: 'Cursor', snippet: '', searchText: 'Cursor', payload: {} });
    idx.upsert({ id: 'news:2', source: 'news', nativeId: '2', title: 'Cursor v2', snippet: '', searchText: 'Cursor v2', payload: {} });
    idx.upsert({ id: 'reminder:1', source: 'reminder', nativeId: '1', title: 'Cursor 提醒', snippet: '', searchText: 'Cursor 提醒', payload: {} });
    const res = idx.query('Cursor');
    expect(res.counts.news).toBe(2);
    expect(res.counts.reminder).toBe(1);
    expect(res.counts['ai-task']).toBe(0);
  });

  it('empty query returns empty results', () => {
    idx.upsert({ id: 'news:1', source: 'news', nativeId: '1', title: 'x', snippet: '', searchText: 'x', payload: {} });
    const res = idx.query('');
    expect(res.results).toEqual([]);
  });

  it('respects limit', () => {
    for (let i = 0; i < 10; i++) {
      idx.upsert({ id: `news:${i}`, source: 'news', nativeId: String(i), title: `Cursor ${i}`, snippet: '', searchText: 'Cursor', payload: {} });
    }
    const res = idx.query('Cursor', { limit: 5 });
    expect(res.results).toHaveLength(5);
    // counts 不受 limit 影响
    expect(res.counts.news).toBe(10);
  });

  it('buildFromState populates from state object', () => {
    const state = {
      ithome_news: { articles: { 'u1': { id: 'u1', title: 'Cursor', excerpt: '', body: '', dateKey: '2026-06-01' } }, summaries: {}, favorites: {} },
      reminders: [{ id: 'r1', title: '喝水', triggerAt: 0 }],
    };
    idx.buildFromState(state);
    expect(idx.query('Cursor').results).toHaveLength(1);
    expect(idx.query('喝水').results).toHaveLength(1);
  });

  it('removes doc on delete', () => {
    idx.upsert({ id: 'news:1', source: 'news', nativeId: '1', title: 'Cursor', snippet: '', searchText: 'Cursor', payload: {} });
    idx.remove('news:1');
    expect(idx.query('Cursor').results).toHaveLength(0);
  });
});
