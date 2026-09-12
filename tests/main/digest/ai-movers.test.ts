/**
 * tests/main/digest/ai-movers.test.ts
 *
 * v3.1: 早报「AI 榜单异动」计算 — 从 arena 磁盘缓存 (内存模式) 读最新两份快照
 * 做排名 diff. 覆盖: 上升/下降 diff、新上榜、±1 抖动过滤、cap、快照不足.
 */
import { describe, it, expect, beforeEach } from 'vitest';
const { requireMain } = require("../../_setup/require-main.cjs");
const cache = requireMain('ai-leaderboard/cache');
const { computeAiMovers, ARENA_CACHE_BOARD } = requireMain('digest/ai-movers');

const BASE = '2026-09-11';
const CUR = '2026-09-12';

function seedDay(date, boards) {
  cache.__seedForTest(cache.cacheKey('arena', ARENA_CACHE_BOARD, date), { boards }, Date.now());
}

function models(list) {
  return list.map(([model, vendor, rank]) => ({ model, vendor, rank, score: 1400 - rank }));
}

describe('computeAiMovers', () => {
  beforeEach(() => {
    cache.__resetForTest();
  });

  it('少于两份快照时返回空 items', () => {
    seedDay(CUR, { text: { models: models([['GPT-5', 'openai', 1]]) } });
    const r = computeAiMovers();
    expect(r.items).toEqual([]);
  });

  it('diff 最新两份快照 — |Δrank|≥2 才算异动, 按 |Δ| 降序', () => {
    seedDay(BASE, {
      text: { models: models([['GPT-5', 'openai', 1], ['Claude-5', 'anthropic', 5], ['Gemini-3', 'google', 3]]) },
    });
    seedDay(CUR, {
      text: { models: models([['GPT-5', 'openai', 3], ['Claude-5', 'anthropic', 2], ['Gemini-3', 'google', 4]]) },
    });
    const r = computeAiMovers();
    // GPT-5: 1→3 下降 |Δ|=2; Claude-5: 5→2 上升 |Δ|=3; Gemini-3: 3→4 |Δ|=1 过滤
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ model: 'Claude-5', board: 'text', from: 5, to: 2, delta: 3, is_new: false });
    expect(r.items[1]).toMatchObject({ model: 'GPT-5', delta: -2 });
  });

  it('新上榜模型 (基线无) — delta=null + is_new, 排在真异动之后', () => {
    seedDay(BASE, { text: { models: models([['GPT-5', 'openai', 1], ['Claude-5', 'anthropic', 5]]) } });
    seedDay(CUR, {
      text: { models: models([['GPT-5', 'openai', 1], ['Claude-5', 'anthropic', 5], ['Kimi-K3', 'moonshot', 2]]) },
    });
    const r = computeAiMovers();
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ model: 'Kimi-K3', is_new: true, delta: null, to: 2 });
  });

  it('新上榜垫底: 真异动优先, cap 默认 3', () => {
    seedDay(BASE, {
      text: { models: models([['A', 'v', 1], ['B', 'v', 2], ['C', 'v', 6], ['D', 'v', 10]]) },
    });
    seedDay(CUR, {
      text: { models: models([['A', 'v', 1], ['B', 'v', 2], ['C', 'v', 3], ['D', 'v', 4], ['Newbie', 'v', 7]]) },
    });
    const r = computeAiMovers();
    // C 6→3 |Δ|=3, D 10→4 |Δ|=6 → D, C; Newbie 新上榜垫底
    expect(r.items.map((x) => x.model)).toEqual(['D', 'C', 'Newbie']);
  });

  it('空缓存 / 空 boards → 空 items (不抛)', () => {
    expect(computeAiMovers().items).toEqual([]);
    seedDay(BASE, {});
    seedDay(CUR, { text: { models: models([['GPT-5', 'openai', 1]]) } });
    expect(computeAiMovers().items).toEqual([]);
  });
});
