// @vitest-environment happy-dom
/**
 * tests/renderer/appshell-home-mode.test.jsx
 *
 * 2026-07-10 用户反馈: "首页就是平铺开这几个 icon", 不要 SideNav.
 * 设计: AppShell 在 home 模式不挂载 <SideNav/>, 整页只有 <HomeGrid/>.
 *      panel 模式下 <SideNav/> 正常挂载, 🏠 按钮在 panel 模式仍是回 home 入口.
 *
 * AppShell 引入 SearchModal/LazyNavPanel 等重依赖, 整树 happy-dom 渲染不稳.
 * 这里直接验证 AppShell.jsx 源码条件渲染逻辑 (行为契约), 不真正渲染整树.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APPSHELL_SRC = readFileSync(
  resolve('src/renderer/components/AppShell.jsx'),
  'utf8',
);

describe('AppShell home 模式 — 行为契约', () => {
  beforeEach(() => {
    // 不渲染; 解析源码检查条件
  });

  it('home 模式 nav !== "home" 为 false → SideNav 不挂载', () => {
    // 关键条件: {nav !== 'home' && <SideNav />}
    expect(APPSHELL_SRC).toMatch(/\{nav\s*!==\s*['"]home['"]\s*&&\s*<SideNav\s*\/>/);
  });

  it('home 模式 main view 渲染 <HomeGrid/>', () => {
    expect(APPSHELL_SRC).toMatch(/\{nav\s*===\s*['"]home['"][\s\S]*?<HomeGrid/);
  });

  it('panel 模式 main view 渲染 <LazyNavPanel/>', () => {
    expect(APPSHELL_SRC).toMatch(/<LazyNavPanel/);
  });

  it('app-shell 根 div 加 app-shell-home class (CSS hook)', () => {
    expect(APPSHELL_SRC).toMatch(/app-shell-home/);
  });

  it('SideNav 顶部 🏠 按钮仍在 (panel 模式回 home 入口)', async () => {
    // 直接验证 SideNav.jsx 源码
    const sidenavSrc = readFileSync(
      resolve('src/renderer/components/SideNav.jsx'),
      'utf8',
    );
    expect(sidenavSrc).toMatch(/setActiveNav\(['"]home['"]\)/);
    expect(sidenavSrc).toMatch(/aria-label="首页"/);
  });
});

describe('AppShell home 模式 — SideNav 🏠 按钮 (行为契约 + 单元)', () => {
  it('点击 🏠 后 activeNav === "home" (regression from flicker bug)', async () => {
    const { render, fireEvent } = await import('@testing-library/preact');
    const { activeNav } = await import('../../src/renderer/worldcup/navStore.js');

    const { SideNav } = await import('../../src/renderer/components/SideNav.jsx');
    activeNav.value = 'ithome';

    const { container } = render(<SideNav />);
    const homeBtn = container.querySelector('button[aria-label="首页"]');
    expect(homeBtn).toBeTruthy();
    fireEvent.click(homeBtn);
    expect(activeNav.value).toBe('home');
  });
});