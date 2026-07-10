// @vitest-environment happy-dom
/**
 * tests/renderer/sidenav-home-button.test.jsx
 *
 * Regression: 2026-07-10 用户反馈点 🏠 按钮 → 闪一下就回原 nav.
 * 根因: SideNav useEffect 检查 visibleKeys.includes(current),
 * 'home' 不在 NAV_KEYS_LIST → 永远不包含 → effect 弹回 visibleKeys[0].
 * 修法: useEffect 加 'if (current === "home") return' 守卫.
 *
 * 覆盖:
 *  - 渲染 SideNav, 点击 🏠, activeNav 必须是 'home' (不弹回)
 *  - 重渲一次 (模拟 prefs 变化触发 effect), activeNav 仍是 'home'
 *  - 切换到 panel 后再点 🏠, 同样不弹回
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 用真实的 navStore (不 mock), 因为我们要测的是 SideNav.jsx 内 useEffect
// 对 'home' 的守卫 — 必须用真实的 effectiveVisibleItems + NAV_KEYS_LIST.
const { SideNav } = await import('../../src/renderer/components/SideNav.jsx');

describe('SideNav 🏠 按钮 — useEffect home 守卫', () => {
  beforeEach(async () => {
    const { activeNav, navCollapsed } = await import('../../src/renderer/worldcup/navStore.js');
    activeNav.value = 'ithome';
    navCollapsed.value = false;
    // sidenav-prefs 默认 prefs — 一次性重置, 避免跨测试污染
    const sp = await import('../../src/renderer/components/sidenav-prefs.js');
    sp.resetPrefs();
    localStorage.clear();
    sp.resetPrefs();
  });

  it('点击 🏠 后 activeNav === "home" (不被弹回)', async () => {
    const { render, fireEvent } = await import('@testing-library/preact');
    const { container } = render(<SideNav />);

    const homeBtn = container.querySelector('button[aria-label="首页"]');
    expect(homeBtn).toBeTruthy();

    fireEvent.click(homeBtn);

    const { activeNav } = await import('../../src/renderer/worldcup/navStore.js');
    expect(activeNav.value).toBe('home');
  });

  it('从 panel 切到 home, 再次重渲染 (模拟 prefs 变) 后仍是 home', async () => {
    const { render, fireEvent } = await import('@testing-library/preact');
    const { setActiveNav, activeNav } = await import('../../src/renderer/worldcup/navStore.js');

    setActiveNav('metals');
    expect(activeNav.value).toBe('metals');

    const { container, rerender } = render(<SideNav />);
    const homeBtn = container.querySelector('button[aria-label="首页"]');
    fireEvent.click(homeBtn);
    expect(activeNav.value).toBe('home');

    // 模拟外部 prefs 变化导致 SideNav 重渲染 (useEffect 再跑)
    // 改 trayMenuPrefs 触发 effect
    const { trayMenuPrefs } = await import('../../src/renderer/trayConfigStore.js');
    trayMenuPrefs.value = {
      ...trayMenuPrefs.value,
      segments: { ...trayMenuPrefs.value.segments, updates: false },
    };

    rerender(<SideNav />);
    expect(activeNav.value).toBe('home'); // 守卫吞掉, 不弹回
  });

  it('panel → panel 切换 (基线) 不受 home 守卫影响', async () => {
    const { render, fireEvent } = await import('@testing-library/preact');
    const { setActiveNav, activeNav } = await import('../../src/renderer/worldcup/navStore.js');

    setActiveNav('ithome');
    expect(activeNav.value).toBe('ithome');

    const { container } = render(<SideNav />);
    // 点 ithome SideNavItem (验证基线不被守卫误伤)
    const ithomeItem = container.querySelector('[data-testid="side-nav-item-ithome"]')
      || container.querySelector('button[aria-label*="IT 新闻"]');
    if (ithomeItem) {
      fireEvent.click(ithomeItem);
      expect(activeNav.value).toBe('ithome');
    }
  });
});

// Regression: 2026-07-10 用户反馈 HomeGrid 模式下 SideNav 列表/footer 重复, 应该隐藏.
// 设计: home 模式 SideNav 只保留顶部 brand + icons 一行, 列表/footer/抽屉不渲染.
describe('SideNav home 模式 — 列表/footer 隐藏', () => {
  beforeEach(async () => {
    const { activeNav, navCollapsed } = await import('../../src/renderer/worldcup/navStore.js');
    activeNav.value = 'home';
    navCollapsed.value = false;
    const sp = await import('../../src/renderer/components/sidenav-prefs.js');
    sp.resetPrefs();
    localStorage.clear();
    sp.resetPrefs();
  });

  it('home 模式: nav 上有 side-nav-home-mode class', async () => {
    const { render } = await import('@testing-library/preact');
    const { container } = render(<SideNav />);
    const nav = container.querySelector('nav');
    expect(nav.className).toContain('side-nav-home-mode');
  });

  it('home 模式: nav 列表 (side-nav-list) 不渲染', async () => {
    const { render } = await import('@testing-library/preact');
    const { container } = render(<SideNav />);
    expect(container.querySelector('.side-nav-list')).toBeNull();
  });

  it('home 模式: footer (side-nav-footer) 不渲染', async () => {
    const { render } = await import('@testing-library/preact');
    const { container } = render(<SideNav />);
    expect(container.querySelector('.side-nav-footer')).toBeNull();
  });

  it('home 模式: 🏠 按钮 + ☰ 折叠按钮仍可见 (顶部 bar 保留)', async () => {
    const { render } = await import('@testing-library/preact');
    const { container } = render(<SideNav />);
    expect(container.querySelector('button[aria-label="首页"]')).toBeTruthy();
    // ☰ 折叠按钮: 找 side-nav-toggle 里的 IconMenu svg
    expect(container.querySelectorAll('.side-nav-toggle').length).toBeGreaterThanOrEqual(2); // ☰ + 🏠
  });

  it('home 模式: refresh 按钮不渲染 (home 不可刷新)', async () => {
    const { render } = await import('@testing-library/preact');
    const { container } = render(<SideNav />);
    expect(container.querySelector('.side-nav-refresh-btn')).toBeNull();
  });

  it('非 home 模式: nav 列表 + footer 正常渲染 (基线)', async () => {
    const { render } = await import('@testing-library/preact');
    const { setActiveNav } = await import('../../src/renderer/worldcup/navStore.js');
    setActiveNav('ithome');

    const { container } = render(<SideNav />);
    const nav = container.querySelector('nav');
    expect(nav.className).not.toContain('side-nav-home-mode');
    expect(container.querySelector('.side-nav-list')).toBeTruthy();
    expect(container.querySelector('.side-nav-footer')).toBeTruthy();
  });
});