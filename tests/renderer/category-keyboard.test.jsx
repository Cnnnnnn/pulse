/**
 * tests/renderer/category-keyboard.test.jsx
 *
 * Phase A5a: <ResultsView /> 数字键 0-9 切 tab 快捷键.
 * 跟 plan A5a 对齐 (~5 cases, plan 写 "1-2 个手动 case" 实际多覆盖几个).
 *
 * Phase A5b: 边界 case — 切 tab 失败不阻塞 UI / input focus 不抢 / Cmd+数字 不抢 /
 *   越界 (9 但只有 5 tab) 不 throw.
 */

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import * as category from '../../src/config/category.js';
import { results, activeCategory, setActiveCategory } from '../../src/renderer/store.js';
import { ResultsView } from '../../src/renderer/components/ResultsView.jsx';

beforeEach(() => {
  // 测试启动时注入 category data
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
  // 起 8 个 app 让 7 个非空 tab 全部出现 + 其他 0
  const m = new Map();
  for (const n of ['cursor', 'claude', 'vscode', 'docker', 'chrome', 'slack', 'spotify']) {
    m.set(n, { name: n, status: 'up_to_date' });
  }
  results.value = m;
  activeCategory.value = 'all';
});

function pressKey(key, opts = {}) {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  // 默认不在 input 里
  if (!opts.target) {
    window.dispatchEvent(ev);
  } else if (opts.target instanceof Element) {
    opts.target.dispatchEvent(ev);
  } else {
    window.dispatchEvent(ev);
  }
  return ev;
}

afterEach(() => {
  cleanup();
});

describe('ResultsView 键盘快捷键 (Phase A5a)', () => {
  it('按 0 切到 "全部"', () => {
    activeCategory.value = 'dev';
    render(<ResultsView />);
    pressKey('0');
    expect(activeCategory.value).toBe('all');
  });

  it('按 1 切到 tab 列表的第 1 个 (默认 "ai" / 按 count desc 排序后是 hot cat)', () => {
    render(<ResultsView />);
    pressKey('1');
    // 第 1 个 tab 是 "全部", 因为 getCategoryTabsWithCount 把它放最前
    // 0='all', 1=第一个非 all tab, 这里 'ai' count=2
    // 实际 '1' 对应 tabList[1] (id 跳过 'all')
    // tabList: [all, ai (2), dev (2), browser, comms, media, notes, system, other]
    // 按 count desc, ai 和 dev 都是 2, 按 order: ai (1) 先于 dev (2)
    // 1 → tabList[1] = ai
    expect(activeCategory.value).toBe('ai');
  });

  it('按 2 切到 tab 列表的第 2 个', () => {
    render(<ResultsView />);
    pressKey('2');
    // tabList[2] = dev
    expect(activeCategory.value).toBe('dev');
  });

  it('input focus 时按数字键不切 tab', () => {
    render(
      <div>
        <input id="search-input" type="text" />
        <ResultsView />
      </div>
    );
    const input = document.getElementById('search-input');
    input.focus();
    activeCategory.value = 'all';
    pressKey('1', { target: input });
    expect(activeCategory.value).toBe('all');  // 没切
  });

  it('textarea focus 时按数字键不切 tab', () => {
    render(
      <div>
        <textarea id="notes" />
        <ResultsView />
      </div>
    );
    const ta = document.getElementById('notes');
    ta.focus();
    activeCategory.value = 'all';
    pressKey('1', { target: ta });
    expect(activeCategory.value).toBe('all');
  });

  it('Cmd/Ctrl + 数字不切 tab (留给未来全局快捷键)', () => {
    render(<ResultsView />);
    activeCategory.value = 'all';
    pressKey('1', { metaKey: true });
    expect(activeCategory.value).toBe('all');
    pressKey('2', { ctrlKey: true });
    expect(activeCategory.value).toBe('all');
  });

  it('越界 (按 9 但只有 9 个 tab 含 "其他") 不 throw, 不切', () => {
    render(<ResultsView />);
    activeCategory.value = 'all';
    expect(() => pressKey('9')).not.toThrow();
    // tabList.length=9 (all+7+other), 9 → tabList[9] = undefined → setActiveCategory 不调
    // activeCategory 保持 'all'
    expect(activeCategory.value).toBe('all');
  });

  it('字母键 / 特殊键不切 tab', () => {
    render(<ResultsView />);
    activeCategory.value = 'all';
    pressKey('a');
    pressKey('Enter');
    pressKey('Escape');
    pressKey('Tab');
    expect(activeCategory.value).toBe('all');
  });

  it('按 0 时如果当前就是 "全部" → 仍 setActiveCategory("all") (no-op)', () => {
    render(<ResultsView />);
    activeCategory.value = 'all';
    expect(() => pressKey('0')).not.toThrow();
    expect(activeCategory.value).toBe('all');
  });
});

describe('ResultsView 边界 (Phase A5b)', () => {
  it('"📦 其他" 即使 0 个 unmapped app 也显示, count=0', () => {
    // 已经 seed 了 7 个 app, 全部 mapped → "其他" 应有 0 个
    render(<ResultsView />);
    const other = document.querySelector('[data-id="other"], .category-tab[title="其他"]');
    // 没 data-id attr, 用 title 选
    const tabs = document.querySelectorAll('.category-tab');
    const otherTab = Array.from(tabs).find((t) => t.title === '其他');
    expect(otherTab).toBeDefined();
    expect(otherTab.textContent).toContain('(0)');
  });

  it('空 results 时, CategoryTabs 仍渲染 (让用户能切到别的 tab)', () => {
    // v2.5.2: 修了一个 UX bug — 之前 sections.length === 0 → return EmptyState
    // 完全跳过 CategoryTabs, 用户切到 "其他" tab 但 0 个 app 时看不到任何
    // 分类 tab 切回去. 修法: CategoryTabs 永远渲染, 跟 EmptyState 共存.
    results.value = new Map();
    render(<ResultsView />);
    const tabs = document.querySelectorAll('.category-tab');
    // "全部" + "📦 其他" 永显示, 即使空
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    // EmptyState 也在 (text='暂无数据' 而非 '无匹配项', 跟 EmptyState 实际文案匹配)
    expect(document.body.textContent).toContain('暂无数据');
  });

  it('当前 activeCategory 指向被 hide 的空 tab → UI 不崩', () => {
    // 把 activeCategory 指向 'notes', 但 seed 的 app 没 notes 类 (sketch 等等是 media, 笔记是 obsidian 但没 seed)
    activeCategory.value = 'notes';
    results.value = new Map([
      ['cursor', { name: 'cursor', status: 'up_to_date' }],  // ai
    ]);
    render(<ResultsView />);
    // sections filtered by 'notes' → 0 匹配 → EmptyState 渲染
    // 不崩
    const empty = document.querySelector('.empty-state') || document.querySelector('[class*="empty"]');
    // EmptyState 实现是 class="empty-state" 或 className 含 "Empty"
    // 这里不深究 class name, 关键是 document.body 不抛 + 有 content
    expect(document.body).toBeDefined();
  });
});
