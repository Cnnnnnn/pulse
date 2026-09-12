/**
 * tests/main/digest/aggregate.test.js
 *
 * Phase I1+I5: pure aggregator — given state, output {date, sections, lines}.
 */
import { describe, it, expect } from 'vitest';
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../../_setup/require-main.cjs");
const { aggregate, MAX_LINES, SECTION_ORDER } = requireMain('digest/aggregate');
const NOW = new Date('2026-06-20T08:30:00');

describe('aggregate', () => {
  it('exports MAX_LINES = 6 and SECTION_ORDER with 7 kinds (v3.1: +ai_movers/github_releases)', () => {
    expect(MAX_LINES).toBe(6);
    expect(SECTION_ORDER).toEqual(['updates', 'hot', 'news', 'funds', 'ai_usage', 'ai_movers', 'github_releases']);
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

  it('aggregates github_releases section from state.github_releases_digest (cap 3)', () => {
    const r = aggregate(
      {
        github_releases_digest: {
          ts: 1,
          items: [
            { name: 'vite', owner: 'vitejs', repo: 'vite', latest_version: 'v8.0.0' },
            { name: '', owner: 'oven-sh', repo: 'bun', latest_version: 'v1.3' },
            { repo: 'no-version', latest_version: '' }, // 无版本 → 过滤
            { name: 'esbuild', owner: 'evanw', repo: 'esbuild', latest_version: 'v0.27' },
            { name: 'fourth', owner: 'x', repo: 'fourth', latest_version: 'v1' },
          ],
        },
      },
      { now: NOW },
    );
    const gh = r.sections.find((s) => s.kind === 'github_releases');
    expect(gh.items).toHaveLength(3);
    expect(gh.items[0]).toMatchObject({ name: 'vite', latest_version: 'v8.0.0' });
    expect(gh.items[1].name).toBe('bun'); // 空名回退 repo
    expect(r.lines.some((l) => l.includes('GitHub'))).toBe(true);
  });

  it('skips github_releases section when digest absent or empty', () => {
    const r = aggregate({ github_releases_digest: { items: [] } }, { now: NOW });
    expect(r.sections.find((s) => s.kind === 'github_releases')).toBeUndefined();
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

  it('builds ai_movers section from arena cache (v3.1) and honors subscribed filter', () => {
    const lbCache = requireMain('ai-leaderboard/cache');
    const { ARENA_CACHE_BOARD } = requireMain('digest/ai-movers');
    lbCache.__resetForTest();
    try {
      const mk = (list) => list.map(([model, rank]) => ({ model, vendor: 'openai', rank, score: 1400 - rank }));
      lbCache.__seedForTest(lbCache.cacheKey('arena', ARENA_CACHE_BOARD, '2026-06-18'), {
        boards: { text: { models: mk([['GPT-5', 4]]) } },
      }, 1);
      lbCache.__seedForTest(lbCache.cacheKey('arena', ARENA_CACHE_BOARD, '2026-06-19'), {
        boards: { text: { models: mk([['GPT-5', 1]]) } },
      }, 2);

      const r = aggregate({}, { now: NOW });
      const movers = r.sections.find((s) => s.kind === 'ai_movers');
      expect(movers.items).toHaveLength(1);
      expect(movers.items[0]).toMatchObject({ model: 'GPT-5', board: 'text', from: 4, to: 1, delta: 3 });
      expect(r.lines.some((l) => l.includes('AI 榜单'))).toBe(true);

      // subscribed 过滤同样生效
      const filtered = aggregate({}, { now: NOW, subscribed: ['ai_movers'] });
      expect(filtered.sections.map((s) => s.kind)).toEqual(['ai_movers']);
      const excluded = aggregate(
        { github_releases_digest: { items: [{ name: 'x', repo: 'x', latest_version: 'v1' }] } },
        { now: NOW, subscribed: ['github_releases'] },
      );
      expect(excluded.sections.map((s) => s.kind)).toEqual(['github_releases']);
    } finally {
      lbCache.__resetForTest();
    }
  });
});
