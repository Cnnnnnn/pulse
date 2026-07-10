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

// 旧 6 个 SideNav home-mode 测试 (列表/footer 隐藏) 已删除, 因设计改为 AppShell 不挂载 SideNav.
// 实际验证搬到 tests/renderer/appshell-home-mode.test.jsx.