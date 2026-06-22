/**
 * tests/main/digest/aggregate.test.js
 *
 * Phase I1+I5: pure aggregator — given state, output {date, sections, lines}.
 */
import { describe, it, expect } from 'vitest';
import { aggregate, MAX_LINES, SECTION_ORDER } from '../../../src/main/digest/aggregate.js';

const NOW = new Date('2026-06-20T08:30:00');

describe('aggregate', () => {
  it('exports MAX_LINES = 6 and SECTION_ORDER with 6 kinds', () => {
    expect(MAX_LINES).toBe(6);
    expect(SECTION_ORDER).toEqual(['updates', 'hot', 'news', 'funds', 'ai_usage', 'worldcup']);
  });

  it('returns empty sections + empty lines for empty state', () => {
    const r = aggregate({}, { now: NOW });
    expect(r.date).toBe('2026-06-20');
    expect(r.sections).toEqual([]);
    expect(r.lines).toEqual([]);
  });

  it('aggregates updates section from apps with has_update=true', () => {
    const r = aggregate(
      { apps: { Cursor: { name: 'Cursor', has_update: true, latest_version: '3.6.33', installed_version: '3.6.32' }, Slack: { has_update: false } } },
      { now: NOW },
    );
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0]).toMatchObject({ kind: 'updates', items: [{ name: 'Cursor', latest_version: '3.6.33' }] });
    expect(r.lines[0]).toContain('Cursor');
  });

  it('caps updates section to 3 items', () => {
    const apps = {};
    for (let i = 0; i < 10; i++) apps[`App${i}`] = { name: `App${i}`, has_update: true, latest_version: '2.0.0' };
    const r = aggregate({ apps }, { now: NOW });
    expect(r.sections[0].items).toHaveLength(3);
  });

  it('aggregates hot section from wechatHot array (top 3)', () => {
    const r = aggregate(
      { wechatHot: { items: [{ title: '热点A', hot: 99999 }, { title: '热点B', hot: 8888 }, { title: '热点C', hot: 7777 }, { title: '热点D', hot: 6666 }] } },
      { now: NOW },
    );
    const hot = r.sections.find((s) => s.kind === 'hot');
    expect(hot.items).toHaveLength(3);
    expect(hot.items[0].title).toBe('热点A');
  });

  it('aggregates news section from ithome_news.articles (first 1)', () => {
    const r = aggregate(
      { ithome_news: { articles: [{ title: '新闻头条', url: 'https://ithome.com/0' }, { title: '新闻2', url: 'https://ithome.com/1' }] } },
      { now: NOW },
    );
    const news = r.sections.find((s) => s.kind === 'news');
    expect(news.items).toHaveLength(1);
    expect(news.items[0].title).toBe('新闻头条');
  });

  it('aggregates funds section (only holdings with |today_change_pct| > 1)', () => {
    const r = aggregate(
      {
        funds: {
          holdings: [
            { code: '161039', name: '先进制造', today_change_pct: 2.3 },
            { code: '005827', name: '蓝筹精选', today_change_pct: 0.4 },
            { code: '161725', name: '科技', today_change_pct: -1.8 },
            { code: '003096', name: '医药', today_change_pct: 0.1 },
          ],
        },
      },
      { now: NOW },
    );
    const funds = r.sections.find((s) => s.kind === 'funds');
    expect(funds.items.map((i) => i.code)).toEqual(['161039', '161725']);
  });

  it('aggregates ai_usage section (only providers with percent > 80)', () => {
    const r = aggregate(
      {
        ai_usage: {
          providers: {
            minimax: { percent: 87 },
            glm: { percent: 45 },
          },
        },
      },
      { now: NOW },
    );
    const ai = r.sections.find((s) => s.kind === 'ai_usage');
    expect(ai.items.map((i) => i.provider)).toEqual(['minimax']);
    expect(ai.items[0].percent).toBe(87);
  });

  it('caps total lines to MAX_LINES (6) and prioritizes by SECTION_ORDER', () => {
    const state = {
      apps: { A1: { name: 'A1', has_update: true }, A2: { name: 'A2', has_update: true }, A3: { name: 'A3', has_update: true } },
      wechatHot: { items: [{ title: 'H1' }, { title: 'H2' }] },
      ithome_news: { articles: [{ title: 'N1' }] },
      funds: { holdings: [{ code: 'F1', name: 'F1', today_change_pct: 2.0 }] },
      ai_usage: { providers: { minimax: { percent: 90 } } },
    };
    const r = aggregate(state, { now: NOW });
    expect(r.lines.length).toBeLessThanOrEqual(MAX_LINES);
    expect(r.lines[0]).toContain('A1');
  });

  it('truncates lines longer than 60 chars with ellipsis', () => {
    const r = aggregate(
      { ithome_news: { articles: [{ title: 'x'.repeat(80) }] } },
      { now: NOW },
    );
    expect(r.lines[0].length).toBeLessThanOrEqual(60);
    expect(r.lines[0]).toMatch(/…$/);
  });

  it('returns empty lines (silent skip) when only low-signal data', () => {
    const r = aggregate(
      {
        funds: { holdings: [{ code: 'F1', name: 'F1', today_change_pct: 0.3 }] },
        ai_usage: { providers: { minimax: { percent: 50 } } },
      },
      { now: NOW },
    );
    expect(r.sections).toEqual([]);
    expect(r.lines).toEqual([]);
  });
});
