/**
 * tests/config/category.test.js
 *
 * Phase A1b (App Categorization, Feature A): 8 类静态 map + 6 API + 降级路径.
 *
 * 覆盖 (跟 spec §8.1 对齐, ~20 cases):
 *   - getCategory 命中 / 未命中 / fallback 'other' / 大小写 / 非 string
 *   - getAllCategories 顺序 (按 order asc) / 8 个全有 / 返回新引用
 *   - getCategoryById 命中 / 未命中 → undefined
 *   - getCategoryByName 命中 / 未命中 → 'other' Category
 *   - validateCategoryMap 正常 / 缺 'other' / id 重复
 *   - getCategoryTabsWithCount "全部" / hide empty / 'other' 永显示 / 排序 /
 *     空 results / Map vs Iterable
 *   - 降级: 故意写坏 categories.json → fallback DEFAULT (用临时 dir)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// 1) 先用真实 config 测 (走磁盘)
import * as real from '../../src/config/category.js';

const GOOD_CATS = [
  { id: 'ai', name: 'AI 工具', icon: '🤖', order: 1 },
  { id: 'dev', name: '开发者', icon: '🛠', order: 2 },
  { id: 'browser', name: '浏览器', icon: '🌐', order: 3 },
  { id: 'comms', name: '沟通', icon: '💬', order: 4 },
  { id: 'media', name: '媒体', icon: '🎨', order: 5 },
  { id: 'notes', name: '笔记', icon: '📝', order: 6 },
  { id: 'system', name: '系统', icon: '🔧', order: 7 },
  { id: 'other', name: '其他', icon: '📦', order: 99 },
];

describe('category.js — real config (走磁盘)', () => {
  it('getCategory: 命中已知 mapping', () => {
    expect(real.getCategory('cursor')).toBe('ai');
    expect(real.getCategory('vscode')).toBe('dev');
    expect(real.getCategory('chrome')).toBe('browser');
    expect(real.getCategory('raycast')).toBe('system');
  });

  it('getCategory: 未命中 → "other" 兜底 (永不崩)', () => {
    expect(real.getCategory('unknown-app-xxx')).toBe('other');
    expect(real.getCategory('')).toBe('other');
    expect(real.getCategory(null)).toBe('other');
    expect(real.getCategory(undefined)).toBe('other');
    expect(real.getCategory(123)).toBe('other');
  });

  it('getCategory: 大小写不敏感 (key.toLowerCase())', () => {
    expect(real.getCategory('CURSOR')).toBe('ai');
    expect(real.getCategory('Cursor')).toBe('ai');
    expect(real.getCategory('VSCODE')).toBe('dev');
  });

  it('getAllCategories: 8 个 + 按 order asc', () => {
    const cats = real.getAllCategories();
    expect(cats).toHaveLength(8);
    for (let i = 1; i < cats.length; i++) {
      expect(cats[i].order).toBeGreaterThanOrEqual(cats[i - 1].order);
    }
    expect(cats[cats.length - 1].id).toBe('other');
  });

  it('getAllCategories: 返回新引用, 不暴露内部 Map', () => {
    const a = real.getAllCategories();
    const b = real.getAllCategories();
    expect(a).not.toBe(b);
    a[0].name = 'mutated';
    expect(real.getAllCategories()[0].name).not.toBe('mutated');
  });

  it('getCategoryById: 命中', () => {
    const c = real.getCategoryById('ai');
    expect(c).toBeDefined();
    expect(c.name).toBe('AI 工具');
    expect(c.icon).toBe('🤖');
  });

  it('getCategoryById: 未命中 → undefined', () => {
    expect(real.getCategoryById('nope')).toBeUndefined();
    expect(real.getCategoryById('')).toBeUndefined();
  });

  it('getCategoryByName: 命中 (按显示名)', () => {
    expect(real.getCategoryByName('AI 工具').id).toBe('ai');
    expect(real.getCategoryByName('开发者').id).toBe('dev');
  });

  it('getCategoryByName: 未命中 → "other" 兜底', () => {
    expect(real.getCategoryByName('不存在').id).toBe('other');
    expect(real.getCategoryByName('').id).toBe('other');
  });

  it('validateCategoryMap: 正常 load → ok, 0 errors', () => {
    const r = real.validateCategoryMap();
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });
});

// ── getCategoryTabsWithCount: 排序 + hide-empty + 'other' 永显示 ──
describe('category.js — getCategoryTabsWithCount', () => {
  it('空 results: 1 个 "全部" tab + 1 个 "📦 其他" tab (count 0)', () => {
    const tabs = real.getCategoryTabsWithCount(new Map());
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toMatchObject({ id: 'all', count: 0 });
    expect(tabs[1]).toMatchObject({ id: 'other', count: 0 });
  });

  it('多 app: "全部" 永第一, "其他" 永最后, 隐藏空 cat', () => {
    const results = new Map([
      ['cursor', {}],  // ai
      ['claude', {}],  // ai
      ['vscode', {}],  // dev
      ['chrome', {}],  // browser
      ['kimi-extra', {}],  // unmapped → other
    ]);
    const tabs = real.getCategoryTabsWithCount(results);
    // 第 1 个: 全部 (count 5)
    expect(tabs[0]).toMatchObject({ id: 'all', count: 5 });
    // 最后 1 个: 其他 (count 1)
    expect(tabs[tabs.length - 1]).toMatchObject({ id: 'other', count: 1 });
    // 全部 / 其他 之间是 count > 0 的 cat
    const middle = tabs.slice(1, -1);
    const ids = middle.map((t) => t.id);
    // ai (2) > dev (1) > browser (1), 同 count 按 order: dev (2) 先于 browser (3)
    expect(ids).toEqual(['ai', 'dev', 'browser']);
    // 所有 middle tabs count > 0
    for (const t of middle) expect(t.count).toBeGreaterThan(0);
  });

  it('hide empty: 0 app 的 cat 不出现 (除 "其他")', () => {
    // 只有 ai + dev 的 app
    const results = new Map([['cursor', {}], ['vscode', {}]]);
    const tabs = real.getCategoryTabsWithCount(results);
    const ids = tabs.map((t) => t.id);
    expect(ids).toContain('ai');
    expect(ids).toContain('dev');
    expect(ids).not.toContain('browser');
    expect(ids).not.toContain('comms');
    expect(ids).not.toContain('notes');
    expect(ids).not.toContain('media');
  });

  it('"📦 其他" 即使 count=0 也显示 (兜底)', () => {
    const results = new Map([['cursor', {}]]);
    const tabs = real.getCategoryTabsWithCount(results);
    const other = tabs.find((t) => t.id === 'other');
    expect(other).toBeDefined();
    expect(other.count).toBe(0);
  });

  it('Iterable<string> 入参也能 work (不只是 Map)', () => {
    const tabs = real.getCategoryTabsWithCount(['cursor', 'vscode']);
    expect(tabs[0].count).toBe(2);
  });

  it('null / undefined 入参 → "全部" + "其他" (count 0)', () => {
    expect(real.getCategoryTabsWithCount(null)).toEqual([
      { id: 'all', name: '全部', icon: '📋', count: 0, title: '所有 app' },
      { id: 'other', name: '其他', icon: '📦', count: 0, title: '其他' },
    ]);
    expect(real.getCategoryTabsWithCount(undefined)).toEqual([
      { id: 'all', name: '全部', icon: '📋', count: 0, title: '所有 app' },
      { id: 'other', name: '其他', icon: '📦', count: 0, title: '其他' },
    ]);
  });
});

// ── 降级路径: 写坏 categories.json, 走 fallback ──
describe('category.js — fallback when disk fails', () => {
  let tmpDir;
  let warnSpy;
  let errSpy;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-category-fallback-'));
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('categories.json 损坏 → fallback DEFAULT, 不崩', async () => {
    fs.writeFileSync(path.join(tmpDir, 'categories.json'), '{ broken json');
    fs.writeFileSync(
      path.join(tmpDir, 'app-category.json'),
      JSON.stringify({ version: 1, mapping: { cursor: 'ai' } })
    );

    const mod = await import('../../src/config/category.js');
    mod._init({
      catsPath: path.join(tmpDir, 'categories.json'),
      mapPath: path.join(tmpDir, 'app-category.json'),
    });
    const status = mod._LOAD_STATUS();
    expect(status.usedFallback).toBe(true);
    expect(status.errors.length).toBeGreaterThan(0);
    // api 仍然 work (走 default)
    expect(mod.getAllCategories()).toHaveLength(8);
    expect(mod.getCategory('cursor')).toBe('ai');
  });

  it('app-category.json 缺 "other" cat → 启动期自动补, 0 errors', async () => {
    const catsNoOther = GOOD_CATS.filter((c) => c.id !== 'other');
    fs.writeFileSync(
      path.join(tmpDir, 'categories.json'),
      JSON.stringify({ version: 1, categories: catsNoOther })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'app-category.json'),
      JSON.stringify({ version: 1, mapping: { cursor: 'ai' } })
    );
    const mod = await import('../../src/config/category.js');
    mod._init({
      catsPath: path.join(tmpDir, 'categories.json'),
      mapPath: path.join(tmpDir, 'app-category.json'),
    });
    const cats = mod.getAllCategories();
    expect(cats.find((c) => c.id === 'other')).toBeDefined();
    expect(cats).toHaveLength(GOOD_CATS.length);
  });

  it('app-category.json 引用不存在 categoryId → 跳过该 entry, log warn', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'categories.json'),
      JSON.stringify({ version: 1, categories: GOOD_CATS })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'app-category.json'),
      JSON.stringify({
        version: 1,
        mapping: { cursor: 'ai', bogus: 'nonexistent-cat-id' },
      })
    );
    const mod = await import('../../src/config/category.js');
    mod._init({
      catsPath: path.join(tmpDir, 'categories.json'),
      mapPath: path.join(tmpDir, 'app-category.json'),
    });
    expect(mod.getCategory('cursor')).toBe('ai');
    expect(mod.getCategory('bogus')).toBe('other');  // 跳过后 fallback
    expect(warnSpy).toHaveBeenCalled();
  });
});
