/**
 * tests/main/search/build-docs.test.js
 * A3: 从 state.json 抽取 Doc 列表 (news/ai-task/reminder/fund/app)
 */
import { describe, it, expect } from 'vitest';
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../../_setup/require-main.cjs");
const { buildDocsFromState } = requireMain('search/build-docs');
describe('buildDocsFromState', () => {
  it('builds news docs from articles', () => {
    const state = {
      ithome_news: {
        articles: {
          'https://ithome.com/0/1.htm': {
            id: 'https://ithome.com/0/1.htm',
            title: 'Cursor 更新',
            excerpt: '性能优化',
            body: '完整正文',
            pubDate: '2026-06-01',
            dateKey: '2026-06-01',
          },
        },
        summaries: {},
        favorites: {},
      },
    };
    const docs = buildDocsFromState(state);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      id: 'news:https://ithome.com/0/1.htm',
      source: 'news',
      nativeId: 'https://ithome.com/0/1.htm',
      title: 'Cursor 更新',
    });
    expect(docs[0].searchText).toContain('Cursor');
    expect(docs[0].searchText).toContain('性能优化');
    expect(docs[0].searchText).toContain('完整正文');
  });

  it('dedupes favorites over articles (favorite wins, includes summary)', () => {
    const state = {
      ithome_news: {
        articles: {
          'u1': { id: 'u1', title: '标题A', excerpt: '摘A', body: '', dateKey: '2026-06-01' },
        },
        summaries: {
          'u1': { abstract: '总结A', keywords: ['k1'], domain: '领域', impact: '影响' },
        },
        favorites: {
          'u1': {
            article: { id: 'u1', title: '标题A(收藏)', excerpt: '摘A', body: '', dateKey: '2026-06-01' },
            summary: { abstract: '总结A(收藏)', keywords: ['k2'] },
            favoritedAt: 1700000000000,
          },
        },
      },
    };
    const docs = buildDocsFromState(state);
    expect(docs.filter(d => d.source === 'news')).toHaveLength(1);
    // favorite 优先: title 用收藏版, searchText 含收藏 summary
    expect(docs[0].title).toBe('标题A(收藏)');
    expect(docs[0].searchText).toContain('总结A(收藏)');
  });

  it('builds ai-task docs', () => {
    const state = {
      task_summaries: {
        'cursor:abc': {
          taskKey: 'cursor:abc',
          title: '重做总结',
          userGoal: '解决卡顿',
          outcome: '完成了',
          dateKey: '2026-06-01',
        },
      },
    };
    const docs = buildDocsFromState(state);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      id: 'ai-task:cursor:abc',
      source: 'ai-task',
      nativeId: 'cursor:abc',
      title: '重做总结',
    });
    expect(docs[0].searchText).toContain('解决卡顿');
    expect(docs[0].searchText).toContain('完成了');
  });

  it('builds reminder docs', () => {
    const state = {
      reminders: [
        { id: 'r1', title: '喝水', triggerAt: 1700000000000 },
      ],
    };
    const docs = buildDocsFromState(state);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      id: 'reminder:r1',
      source: 'reminder',
      nativeId: 'r1',
      title: '喝水',
    });
  });

  it('builds fund docs (name only)', () => {
    const state = {
      funds: {
        holdings: [
          { id: 'f1', code: '001234', name: '财通成长', note: '定投' },
        ],
      },
    };
    const docs = buildDocsFromState(state);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      id: 'fund:f1',
      source: 'fund',
      nativeId: 'f1',
      title: '财通成长',
    });
    expect(docs[0].payload.code).toBe('001234');
    expect(docs[0].searchText).toContain('定投');
  });

  it('builds app docs (name)', () => {
    const state = {
      apps: {
        Cursor: { name: 'Cursor', latest_version: '3.6.31' },
      },
    };
    const docs = buildDocsFromState(state);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      id: 'app:Cursor',
      source: 'app',
      nativeId: 'Cursor',
      title: 'Cursor',
    });
  });

  it('handles empty/missing sources gracefully', () => {
    expect(buildDocsFromState({})).toEqual([]);
    expect(buildDocsFromState(null)).toEqual([]);
    expect(buildDocsFromState({ ithome_news: {} })).toEqual([]);
  });
});
