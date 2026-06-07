/**
 * tests/renderer/app-info.test.jsx
 *
 * Phase 26: AppInfo changelog inline preview.
 *   - 0/short/long changelog 渲染规则
 *   - strip markdown 装饰符 (#, *, -, etc)
 *   - strip HTML tags
 *   - 词边界优先 (>40 字符才在空格处截)
 *   - preview 超过 80 字符 → 末尾 "…"
 *   - 完整 changelog 走 title tooltip
 */

// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { AppInfo } from '../../src/renderer/components/AppInfo.jsx';

function makeResult(over = {}) {
  return {
    name: 'X',
    source: 'brew_formulae',
    status: 'up_to_date',
    note: '',
    ts: Date.now(),
    ...over,
  };
}

afterEach(() => cleanup);

describe('AppInfo changelog preview (Phase 26)', () => {
  it('无 changelog → 不渲染 preview 行', () => {
    const { container } = render(<AppInfo result={makeResult({ changelog: '' })} />);
    expect(container.querySelector('.app-changelog-preview')).toBeNull();
  });

  it('短 changelog (≤80 字) → 原样显示, 无 "…"', () => {
    const { container } = render(
      <AppInfo result={makeResult({ changelog: '修复已知问题' })} />
    );
    const el = container.querySelector('.app-changelog-preview');
    expect(el).toBeTruthy();
    expect(el.textContent).toBe('修复已知问题');
    expect(el.textContent.endsWith('…')).toBe(false);
  });

  it('长 changelog (>80 字) → 词边界截断 + "…"', () => {
    const long = 'Added skill autocomplete support in slash command selector. Improved subagent UI rendering and interaction experience. Fixed long content being truncated in code blocks and Bash output.';
    const { container } = render(
      <AppInfo result={makeResult({ changelog: long })} />
    );
    const el = container.querySelector('.app-changelog-preview');
    expect(el).toBeTruthy();
    expect(el.textContent.length).toBeLessThanOrEqual(81); // 80 + …
    expect(el.textContent.endsWith('…')).toBe(true);
    // 词边界: 截断点不在单词中间 (倒数第二个字符不是字母)
    const beforeEllipsis = el.textContent.slice(0, -1);
    expect(beforeEllipsis.endsWith(' ')).toBe(false);
  });

  it('strip markdown 装饰符 (#, *, -, >)', () => {
    const md = '- Added skill autocomplete support\n* Fixed bug\n# Major release';
    const { container } = render(
      <AppInfo result={makeResult({ changelog: md })} />
    );
    const el = container.querySelector('.app-changelog-preview');
    expect(el.textContent.startsWith('-')).toBe(false);
    expect(el.textContent.startsWith('*')).toBe(false);
    expect(el.textContent).toContain('Added skill autocomplete support');
  });

  it('strip HTML tags', () => {
    const html = '<p>1. 支持设置 copilot 首选模型</p><br><p>2. 修复已知问题</p>';
    const { container } = render(
      <AppInfo result={makeResult({ changelog: html })} />
    );
    const el = container.querySelector('.app-changelog-preview');
    expect(el.textContent).not.toContain('<');
    expect(el.textContent).not.toContain('>');
    expect(el.textContent).toContain('1.');
  });

  it('preview 元素 title 属性 = 完整 changelog (hover tooltip)', () => {
    const full = 'A'.repeat(200);
    const { container } = render(
      <AppInfo result={makeResult({ changelog: full })} />
    );
    const el = container.querySelector('.app-changelog-preview');
    expect(el.getAttribute('title')).toBe(full);
  });

  it('短字段 (<40 字无空格) → 不强行词边界, 硬截 80', () => {
    // 40 字符内无空格 → lastSpace < 40 → 走硬截
    const noSpace = 'x'.repeat(100);
    const { container } = render(
      <AppInfo result={makeResult({ changelog: noSpace })} />
    );
    const el = container.querySelector('.app-changelog-preview');
    expect(el.textContent).toBe('x'.repeat(80) + '…');
  });
});
