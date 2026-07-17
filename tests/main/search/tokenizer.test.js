/**
 * tests/main/search/tokenizer.test.js
 * A3: 分词器 — bigram(中文) + 空格(英文) + 停用词
 */
import { describe, it, expect } from 'vitest';
import { tokenize } from '../../../src/main/search/tokenizer.js';

describe('tokenizer', () => {
  it('splits English by whitespace + lowercases', () => {
    expect(tokenize('Cursor Performance Update')).toEqual(
      expect.arrayContaining(['cursor', 'performance', 'update']),
    );
    expect(tokenize('Cursor Performance Update')).toHaveLength(3);
  });

  it('bigrams continuous Chinese', () => {
    // 人工智能 → 人工, 工智, 智能
    const tokens = tokenize('人工智能');
    expect(tokens).toEqual(expect.arrayContaining(['人工', '工智', '智能']));
    expect(tokens).toHaveLength(3);
  });

  it('filters stopwords (Chinese)', () => {
    // "的" 是停用词, 不应单独出现 (但 "目的" 的 bigram "目的" 应保留)
    const tokens = tokenize('性能的优化');
    expect(tokens).toEqual(expect.arrayContaining(['性能', '能的', '的优', '优化']));
    expect(tokens).not.toContain('的');
  });

  it('filters stopwords (English)', () => {
    const tokens = tokenize('the update of cursor');
    expect(tokens).toEqual(['update', 'cursor']);
  });

  it('handles mixed Chinese + English', () => {
    const tokens = tokenize('Cursor 性能优化');
    expect(tokens).toEqual(expect.arrayContaining(['cursor', '性能', '能优', '优化']));
  });

  it('preserves first-seen order while filtering and deduplicating', () => {
    expect(tokenize('the Cursor and 性能优化 Cursor')).toEqual([
      'cursor',
      '性能',
      '能优',
      '优化',
    ]);
  });

  it('returns empty array for empty/whitespace input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });

  it('returns empty array for pure stopwords', () => {
    expect(tokenize('的 了 是 the a')).toEqual([]);
  });

  it('deduplicates tokens', () => {
    // "性能性能" → 性能, 能性, 性能 → 去重后 性能, 能性
    const tokens = tokenize('性能性能');
    expect(tokens).toEqual(['性能', '能性']);
  });
});
