/**
 * tests/renderer/sidenav-collapsed-buttons.test.jsx
 *
 * TDD regression: 当 navCollapsed=true 且 activeNav 在 REFRESHABLE_NAV_KEYS 中时,
 * SideNav header 里应该同时显示 ↻ 刷新按钮 和 ☰ 折叠按钮, 且两个按钮
 * 在 40px 折叠容器下都不应被裁切.
 *
 * Bug 复现路径:
 *   styles.css .side-nav { width: 188px } 默认展开
 *   styles.css .side-nav-collapsed { width: 40px } 折叠后
 *   .side-nav-header { display: flex; padding: 12px 10px 8px }
 *   .side-nav-header-actions { display: flex; gap: 2px }  ← 子容器
 *     ├─ .side-nav-refresh-btn (padding 4 6, ~28px wide)
 *     └─ .side-nav-toggle       (padding 4 8, ~32px wide)
 *
 *   折叠后 .side-nav 内宽 = 40px, 但两个按钮总宽 ≈ 62px + 2px gap,
 *   远超容器宽度, 第一个按钮 (refresh) 被父容器 overflow:hidden
 *   裁切掉, 视觉上用户只看到一个 ☰ 按钮.
 *
 * 修复期望: 折叠后 .side-nav-header-actions 必须 wrap (flex-wrap: wrap)
 *   或整体缩小按钮 padding, 让两个按钮都在 40px 容器内可见.
 */

// @vitest-environment happy-dom

import { describe, test, expect, beforeEach, vi } from 'vitest';

let mockActiveNav = 'wechat-hot';
let mockNavCollapsed = true;

vi.mock('../../src/renderer/worldcup/navStore.js', () => ({
  get activeNav() { return { get value() { return mockActiveNav; } }; },
  get navCollapsed() { return { get value() { return mockNavCollapsed; } }; },
  setActiveNav: (k) => { mockActiveNav = k; },
  toggleNavCollapsed: () => { mockNavCollapsed = !mockNavCollapsed; },
}));

vi.mock('../../src/renderer/store.js', () => ({
  openAISettings: vi.fn(),
  needsConfig: () => false,
  get aiSessionsConfig() { return { value: null }; },
  get aiKeyStatus() { return { value: {} }; },
}));

const { SideNav } = await import('../../src/renderer/components/SideNav.jsx');

beforeEach(() => {
  mockActiveNav = 'wechat-hot';
  mockNavCollapsed = true;
});

/**
 * 解析 .css 文本里某条规则 (含 media query 时取基础层), 返回 declarationMap.
 * 简化版解析器, 只处理我们关心的几个 class.
 */
function parseCssRule(selector, cssText) {
  // 移除 /* */ 注释
  const cleaned = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const result = {};
  // 用 ; 分块, 用 { ... } 抓块, 找 selector { declarations }
  const re = new RegExp(`(^|[}\\s])${escapeRegex(selector)}\\s*\\{([^}]*)\\}`, 'g');
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const decls = m[2];
    decls.split(';').forEach((line) => {
      const idx = line.indexOf(':');
      if (idx === -1) return;
      const prop = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (prop) result[prop] = val;
    });
  }
  return result;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('SideNav 折叠态 — 顶部按钮可见性 (regression: 折叠后按钮被裁切)', () => {
  test('activeNav refreshable + collapsed: DOM 里同时存在 refresh-btn 和 toggle-btn', async () => {
    mockActiveNav = 'wechat-hot';
    mockNavCollapsed = true;
    const { render } = await import('@testing-library/preact');
    const { container } = render(<SideNav />);
    const refreshBtn = container.querySelector('.side-nav-refresh-btn');
    const toggleBtn = container.querySelector('.side-nav-toggle');
    expect(refreshBtn).toBeTruthy();
    expect(toggleBtn).toBeTruthy();
    // 两个按钮都必须有真实文本 (↻ / ☰)
    expect(refreshBtn.textContent.trim()).toBe('↻');
    expect(toggleBtn.textContent.trim()).toBe('☰');
  });

  test('styles.css 中 .side-nav-collapsed 折叠宽度定义 = 40px', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.resolve('styles.css'), 'utf8');
    const rule = parseCssRule('.side-nav-collapsed', css);
    expect(rule.width).toBe('40px');
  });

  test('styles.css 中 .side-nav 应有 overflow:hidden (这是导致按钮被裁切的根因之一)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.resolve('styles.css'), 'utf8');
    const rule = parseCssRule('.side-nav', css);
    // 这个 overflow:hidden 是 bug 的帮凶, 修复 CSS 后这个属性可能仍在,
    // 但我们要保证 .side-nav-header-actions 自身能 wrap / 缩小.
    expect(rule['overflow']).toBe('hidden');
  });

  test('styles.css 中 .side-nav-header-actions 应允许按钮换行/收缩 (修复后应为 flex-wrap: wrap)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.resolve('styles.css'), 'utf8');
    const rule = parseCssRule('.side-nav-header-actions', css);
    // 修复要求: 折叠态下两个按钮总宽 ~62px 超出 40px 容器,
    // 必须有 flex-wrap: wrap 才能让第二个按钮换行到第二行, 不被裁切.
    expect(rule['flex-wrap']).toBe('wrap');
  });

  test('styles.css 中 .side-nav-collapsed .side-nav-header-actions 应进一步缩紧按钮 (gap: 0 + flex-direction:column 也行)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.resolve('styles.css'), 'utf8');
    const rule = parseCssRule('.side-nav-collapsed .side-nav-header-actions', css);
    // 必须存在一条折叠态专属规则, 至少保证按钮不会溢出 40px.
    // 接受任意以下组合:
    //   - flex-direction: column (上下排列, 每个按钮独占一行)
    //   - gap: 0
    //   - justify-content: center
    const hasFix =
      rule['flex-direction'] === 'column' ||
      rule['gap'] === '0' ||
      rule['justify-content'] === 'center';
    expect(hasFix).toBe(true);
  });

  test('styles.css 中 .side-nav-toggle padding 不应过大 (折叠时按钮宽 <= 32px)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.resolve('styles.css'), 'utf8');
    const rule = parseCssRule('.side-nav-toggle', css);
    // 解析 padding 简写: "4px 8px" → [v, h] = [4, 8]
    const padding = (rule['padding'] || '').split(/\s+/);
    if (padding.length === 2) {
      const hPadding = parseFloat(padding[1]);
      // 单按钮水平 padding 不应超过 6px, 让按钮宽 <= 32px 还能塞进 40px
      expect(hPadding).toBeLessThanOrEqual(6);
    }
  });
});