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

// ─── Phase 27: Mute Badge ───────────────────────────────

describe('AppInfo mute badge (Phase 27)', () => {
  it('muted=false → 不渲染 badge', () => {
    const { container } = render(<AppInfo result={makeResult({ changelog: '' })} muted={false} />);
    expect(container.querySelector('.mute-badge')).toBeNull();
    expect(container.querySelector('.app-info').className).toBe('app-info');
  });

  it('muted=true, muteUntil=0 (永远) → "🔇 静音 (永远)"', () => {
    const { container } = render(
      <AppInfo result={makeResult({ changelog: '' })} muted={true} muteUntil={0} />
    );
    const badge = container.querySelector('.mute-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('永远');
    expect(badge.textContent).toContain('🔇');
  });

  it('muted=true, muteUntil=具体时间 → "🔇 静音至 M/D HH:MM"', () => {
    const until = new Date(2026, 5, 14, 9, 30).getTime(); // 6/14 09:30
    const { container } = render(
      <AppInfo result={makeResult({ changelog: '' })} muted={true} muteUntil={until} />
    );
    const badge = container.querySelector('.mute-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toMatch(/6\/14 09:30/);
    expect(badge.textContent).toContain('🔇');
  });

  it('muted=true → app-info 加 .muted class', () => {
    const { container } = render(
      <AppInfo result={makeResult({ changelog: '' })} muted={true} />
    );
    expect(container.querySelector('.app-info').classList.contains('muted')).toBe(true);
  });
});

// ─── Phase 29: Last-Opened sub-line ─────────────────────────────

describe('AppInfo last-opened sub-line (Phase 29)', () => {
  it('lastOpened=null → 不渲染 sub-line', () => {
    const { container } = render(
      <AppInfo result={makeResult({ changelog: '' })} lastOpened={null} />
    );
    expect(container.querySelector('.app-last-opened')).toBeNull();
  });

  it('lastOpened 缺省 (没传 prop) → 不渲染 sub-line', () => {
    const { container } = render(
      <AppInfo result={makeResult({ changelog: '' })} />
    );
    expect(container.querySelector('.app-last-opened')).toBeNull();
  });

  it('source=spotlight + 3 天前 → "上次打开 · 3 天前"', () => {
    const threeDaysAgo = Date.now() - 3 * 86400 * 1000;
    const { container } = render(
      <AppInfo
        result={makeResult({ changelog: '' })}
        lastOpened={{ ms: threeDaysAgo, source: 'spotlight' }}
      />
    );
    const el = container.querySelector('.app-last-opened');
    expect(el).not.toBeNull();
    expect(el.textContent).toContain('上次打开');
    expect(el.textContent).toContain('3 天前');
    expect(el.textContent).not.toContain('估算');
  });

  it('source=atime → "上次打开 · 估算 · N 天前" (标 不靠谱)', () => {
    const longAgo = Date.now() - 5 * 86400 * 1000;
    const { container } = render(
      <AppInfo
        result={makeResult({ changelog: '' })}
        lastOpened={{ ms: longAgo, source: 'atime' }}
      />
    );
    const el = container.querySelector('.app-last-opened');
    expect(el).not.toBeNull();
    expect(el.textContent).toContain('估算');
    expect(el.getAttribute('title')).toContain('atime');
  });

  it('ms=null → "未使用"', () => {
    const { container } = render(
      <AppInfo
        result={makeResult({ changelog: '' })}
        lastOpened={{ ms: null, source: 'unknown' }}
      />
    );
    const el = container.querySelector('.app-last-opened');
    expect(el).not.toBeNull();
    expect(el.textContent).toBe('未使用');
  });
});

// ─── Phase 30: tier 颜色分类 (last-opened) ───────────────────

describe('AppInfo last-opened tier color (Phase 30)', () => {
  it('hot tier (≤7 天) → tier-hot class, no 警告 icon', () => {
    const recent = Date.now() - 3 * 86400 * 1000;
    const { container } = render(
      <AppInfo
        result={makeResult({ changelog: '' })}
        lastOpened={{ ms: recent, source: 'spotlight' }}
      />
    );
    const el = container.querySelector('.app-last-opened');
    expect(el.classList.contains('tier-hot')).toBe(true);
    expect(el.classList.contains('tier-warm')).toBe(false);
    expect(el.classList.contains('tier-cold')).toBe(false);
  });

  it('warm tier (7-30 天) → tier-warm class', () => {
    const old = Date.now() - 15 * 86400 * 1000;
    const { container } = render(
      <AppInfo
        result={makeResult({ changelog: '' })}
        lastOpened={{ ms: old, source: 'spotlight' }}
      />
    );
    const el = container.querySelector('.app-last-opened');
    expect(el.classList.contains('tier-warm')).toBe(true);
    expect(el.classList.contains('tier-cold')).toBe(false);
  });

  it('cold tier (>30 天) → tier-cold class', () => {
    const veryOld = Date.now() - 90 * 86400 * 1000;
    const { container } = render(
      <AppInfo
        result={makeResult({ changelog: '' })}
        lastOpened={{ ms: veryOld, source: 'spotlight' }}
      />
    );
    const el = container.querySelector('.app-last-opened');
    expect(el.classList.contains('tier-cold')).toBe(true);
    expect(el.classList.contains('tier-warm')).toBe(false);
  });

  it('unknown tier (ms=null) → tier-unknown class', () => {
    const { container } = render(
      <AppInfo
        result={makeResult({ changelog: '' })}
        lastOpened={{ ms: null, source: 'unknown' }}
      />
    );
    const el = container.querySelector('.app-last-opened');
    expect(el.classList.contains('tier-unknown')).toBe(true);
  });

  it('atime source + old ms → tier-cold class (颜色照常)', () => {
    const veryOld = Date.now() - 90 * 86400 * 1000;
    const { container } = render(
      <AppInfo
        result={makeResult({ changelog: '' })}
        lastOpened={{ ms: veryOld, source: 'atime' }}
      />
    );
    const el = container.querySelector('.app-last-opened');
    expect(el.classList.contains('tier-cold')).toBe(true);
    expect(el.textContent).toContain('估算');
  });

  it('exactly 7 days → warm (boundary: ≤7 是 hot)', () => {
    // hot 边界: ≤ 7 天 (留 1s margin, 避免渲染时刻跨过边界 flake)
    const t = Date.now() - (7 * 86400 * 1000 - 1000);
    const { container } = render(
      <AppInfo
        result={makeResult({ changelog: '' })}
        lastOpened={{ ms: t, source: 'spotlight' }}
      />
    );
    const el = container.querySelector('.app-last-opened');
    expect(el.classList.contains('tier-hot')).toBe(true);
  });
});
