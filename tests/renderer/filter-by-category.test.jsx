/**
 * tests/renderer/filter-by-category.test.jsx
 *
 * Phase A3a (App Categorization): filteredResults 注入 activeCategory 过滤.
 * 跟 spec §8.1 + plan A3a 对齐 (~10 cases).
 *
 * 覆盖:
 *   - activeCategory='all' (默认) 显示所有
 *   - activeCategory='ai' 只显示 ai app
 *   - activeCategory='other' 只显示未映射 app
 *   - 切换 tab 不丢 searchQuery / activeFilter
 *   - 切换 tab 不丢 mute (持久化, 不在 store 层, 但验证 store 层互不影响)
 *   - empty results / category 0 matches → 空 Map
 *   - 切换 activeCategory 触发 filteredResults 重算
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as category from '../../src/config/category.js';
import {
  results,
  searchQuery,
  activeFilter,
  activeCategory,
  setActiveCategory,
} from '../../src/renderer/store.js';
import { filteredResults, filteredResultsBySection } from '../../src/renderer/selectors.js';

// 测试启动时注入 category data (跟 renderer 端 category-init.js 行为一致)
beforeEach(() => {
  category.setData({
    cats: [
      { id: 'ai', name: 'AI 工具', icon: '🤖', order: 1 },
      { id: 'dev', name: '开发者', icon: '🛠', order: 2 },
      { id: 'browser', name: '浏览器', icon: '🌐', order: 3 },
      { id: 'comms', name: '沟通', icon: '💬', order: 4 },
      { id: 'media', name: '媒体', icon: '🎨', order: 5 },
      { id: 'notes', name: '笔记', icon: '📝', order: 6 },
      { id: 'system', name: '系统', icon: '🔧', order: 7 },
      { id: 'other', name: '其他', icon: '📦', order: 99 },
    ],
    map: {
      cursor: 'ai', claude: 'ai', chatgpt: 'ai',
      raycast: 'system',
      iterm2: 'dev', vscode: 'dev', docker: 'dev', postman: 'dev',
      chrome: 'browser', firefox: 'browser', arc: 'browser',
      slack: 'comms', discord: 'comms', wechat: 'comms',
      figma: 'media', sketch: 'media', spotify: 'media', iina: 'media',
      obsidian: 'notes', notion: 'notes', things: 'notes',
      alfred: 'system', '1password': 'system', bartender: 'system',
    },
    source: 'test',
  });
});

function seedResults(list) {
  const m = new Map();
  for (const r of list) m.set(r.name, r);
  results.value = m;
}

function clearAll() {
  results.value = new Map();
  searchQuery.value = '';
  activeFilter.value = 'all';
  activeCategory.value = 'all';
}

beforeEach(clearAll);

describe('filteredResults + activeCategory (Phase A)', () => {
  it('activeCategory="all" (默认) → 所有 app', () => {
    seedResults([
      { name: 'Cursor', status: 'up_to_date' },     // ai
      { name: 'vscode', status: 'up_to_date' },     // dev
      { name: 'kimi-extra', status: 'up_to_date' }, // unmapped → other
    ]);
    activeCategory.value = 'all';
    expect(filteredResults.value.size).toBe(3);
  });

  it('activeCategory="ai" → 只 ai app', () => {
    seedResults([
      { name: 'Cursor', status: 'up_to_date' },
      { name: 'claude', status: 'up_to_date' },
      { name: 'vscode', status: 'up_to_date' },
      { name: 'kimi-extra', status: 'up_to_date' },
    ]);
    activeCategory.value = 'ai';
    const out = filteredResults.value;
    expect(out.size).toBe(2);
    expect(out.has('Cursor')).toBe(true);
    expect(out.has('claude')).toBe(true);
    expect(out.has('vscode')).toBe(false);
    expect(out.has('kimi-extra')).toBe(false);
  });

  it('activeCategory="other" → 未映射 app', () => {
    seedResults([
      { name: 'Cursor', status: 'up_to_date' },     // ai
      { name: 'kimi-extra', status: 'up_to_date' }, // unmapped
      { name: 'workbuddy-extra', status: 'up_to_date' }, // unmapped
    ]);
    activeCategory.value = 'other';
    const out = filteredResults.value;
    expect(out.size).toBe(2);
    expect(out.has('kimi-extra')).toBe(true);
    expect(out.has('workbuddy-extra')).toBe(true);
    expect(out.has('Cursor')).toBe(false);
  });

  it('activeCategory="ai" + search "cur" → 仍只 ai 中匹配的', () => {
    seedResults([
      { name: 'Cursor', status: 'up_to_date' },     // ai, name match "cur"
      { name: 'vscode', status: 'up_to_date' },     // dev, name match "cur"? no
      { name: 'chrome', status: 'up_to_date' },     // browser, no
    ]);
    activeCategory.value = 'ai';
    searchQuery.value = 'cur';
    const out = filteredResults.value;
    expect(out.size).toBe(1);
    expect(out.has('Cursor')).toBe(true);
  });

  it('切换 activeCategory 触发 filteredResults 重算 (signal 订阅)', () => {
    seedResults([
      { name: 'Cursor', status: 'up_to_date' },
      { name: 'vscode', status: 'up_to_date' },
    ]);
    activeCategory.value = 'all';
    expect(filteredResults.value.size).toBe(2);
    activeCategory.value = 'ai';
    expect(filteredResults.value.size).toBe(1);
    expect(filteredResults.value.has('Cursor')).toBe(true);
    activeCategory.value = 'dev';
    expect(filteredResults.value.size).toBe(1);
    expect(filteredResults.value.has('vscode')).toBe(true);
    activeCategory.value = 'other';
    expect(filteredResults.value.size).toBe(0);
    activeCategory.value = 'all';
    expect(filteredResults.value.size).toBe(2);
  });

  it('切换 activeCategory 不影响 searchQuery / activeFilter (独立 signal)', () => {
    seedResults([{ name: 'Cursor', status: 'up_to_date' }]);
    searchQuery.value = 'cur';
    activeFilter.value = 'update';
    activeCategory.value = 'ai';
    expect(searchQuery.value).toBe('cur');
    expect(activeFilter.value).toBe('update');
    activeCategory.value = 'dev';
    expect(searchQuery.value).toBe('cur');
    expect(activeFilter.value).toBe('update');
  });

  it('空 results + activeCategory="ai" → 空 Map', () => {
    activeCategory.value = 'ai';
    expect(filteredResults.value.size).toBe(0);
  });

  it('activeCategory="ai" + 0 个 ai app → 空 Map (不抛)', () => {
    seedResults([{ name: 'vscode', status: 'up_to_date' }]);
    activeCategory.value = 'ai';
    expect(filteredResults.value.size).toBe(0);
  });

  it('activeCategory="all" + activeFilter="update" → 复合 filter 仍 work', () => {
    seedResults([
      { name: 'Cursor',  status: 'up_to_date', has_update: false },
      { name: 'vscode',  status: 'up_to_date', has_update: true },
      { name: 'chrome',  status: 'error',      has_update: false },
    ]);
    activeCategory.value = 'all';
    activeFilter.value = 'update';
    const out = filteredResults.value;
    // vscode 是 dev, has_update=true, 通过 tab filter
    expect(out.size).toBe(1);
    expect(out.has('vscode')).toBe(true);
  });

  it('filteredResultsBySection 跟随 activeCategory 变化 (ResultsView 用它)', () => {
    seedResults([
      { name: 'Cursor', status: 'up_to_date' },
      { name: 'vscode', status: 'up_to_date' },
    ]);
    activeCategory.value = 'all';
    const all = filteredResultsBySection.value;
    const allNames = all.flatMap((s) => s.items);
    expect(allNames).toContain('Cursor');
    expect(allNames).toContain('vscode');

    activeCategory.value = 'ai';
    const ai = filteredResultsBySection.value;
    const aiNames = ai.flatMap((s) => s.items);
    expect(aiNames).toContain('Cursor');
    expect(aiNames).not.toContain('vscode');
  });
});

describe('setActiveCategory (Phase A)', () => {
  it('设置合法 id 立即更新 signal', () => {
    setActiveCategory('ai');
    expect(activeCategory.value).toBe('ai');
    setActiveCategory('all');
    expect(activeCategory.value).toBe('all');
  });

  it('非法 id (空 / 非 string) 不更新 signal + log warn', () => {
    activeCategory.value = 'all';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setActiveCategory('');
    setActiveCategory(null);
    setActiveCategory(123);
    expect(activeCategory.value).toBe('all');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
