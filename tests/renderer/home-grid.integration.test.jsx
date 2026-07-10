// @vitest-environment happy-dom
/**
 * tests/renderer/home-grid.integration.test.js
 *
 * P-N HomeGrid 集成: bootstrap 路径在 happy-dom 下加载 lastActiveNav 后
 * activeNav 被正确覆盖. 实际预渲染我们直接观察 signal, 不需要把整个
 * Preact 树挂载进 happy-dom (复杂度过高, 与本测试目的不符).
 *
 * 跑: npx vitest run tests/renderer/home-grid.integration.test.js
 */
import { describe, it, expect, vi } from 'vitest';

describe('HomeGrid navStore 集成路径', () => {
  it('activeNav 默认值为 "home"', async () => {
    const { activeNav } = await import('../../src/renderer/worldcup/navStore.js');
    expect(activeNav.value).toBe('home');
  });

  it('setActiveNav("funds") 后 activeNav.value === "funds"', async () => {
    const { setActiveNav, activeNav } = await import('../../src/renderer/worldcup/navStore.js');
    setActiveNav('funds');
    expect(activeNav.value).toBe('funds');
  });

  it('setActiveNav("home") 后 activeNav.value === "home"', async () => {
    const { setActiveNav, activeNav } = await import('../../src/renderer/worldcup/navStore.js');
    setActiveNav('metals');
    setActiveNav('home');
    expect(activeNav.value).toBe('home');
  });

  it('PERSISTABLE_NAV_KEYS 不含 home', async () => {
    const { PERSISTABLE_NAV_KEYS } = await import('../../src/renderer/worldcup/navStore.js');
    expect(PERSISTABLE_NAV_KEYS.has('home')).toBe(false);
    expect(PERSISTABLE_NAV_KEYS.has('versions')).toBe(true);
    expect(PERSISTABLE_NAV_KEYS.size).toBe(8);
  });
});

// v2 (2026-07-10): HomeGrid 视觉重做后, 加真渲染测试覆盖视觉契约.
// 验证 hero / 8 tile / SVG icon / accent class / aria-label 都在.
describe('HomeGrid v2 — 渲染契约', () => {
  it('渲染出 hero (品牌 mark + greeting + 时间 + 8 模块 meta)', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { container } = render(<HomeGrid />);

    expect(container.querySelector('.home-hero')).toBeTruthy();
    expect(container.querySelector('.home-hero-mark')?.textContent).toBe('P');
    expect(container.querySelector('.home-hero-greeting')).toBeTruthy();
    expect(container.querySelector('.home-hero-time')).toBeTruthy();
    expect(container.querySelector('.home-hero-date')).toBeTruthy();
    expect(container.querySelector('.home-hero-meta')?.textContent).toContain('8');
  });

  it('渲染 8 个 tile, 全部带 home-grid-tile-accent class', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { container } = render(<HomeGrid />);

    const tiles = container.querySelectorAll('.home-grid-tile');
    expect(tiles.length).toBe(8);
    // 8 个不同 accent class
    const accents = new Set();
    tiles.forEach((t) => {
      const m = t.className.match(/home-grid-tile-(\w+)/);
      if (m) accents.add(m[1]);
    });
    accents.delete('tile'); // base class 名字
    expect(accents.size).toBe(8);
  });

  it('每个 tile 都有 SVG icon (不再用 emoji)', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { container } = render(<HomeGrid />);

    const tiles = container.querySelectorAll('.home-grid-tile');
    tiles.forEach((t) => {
      const iconWrap = t.querySelector('.home-grid-tile-icon');
      expect(iconWrap).toBeTruthy();
      expect(iconWrap.querySelector('svg')).toBeTruthy();
    });
  });

  it('tile 有点击行为 — click 触发 setActiveNav', async () => {
    const { render, fireEvent } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { setActiveNav, activeNav } = await import('../../src/renderer/worldcup/navStore.js');

    const { container } = render(<HomeGrid />);
    const ithomeTile = container.querySelector('button[aria-label="进入 IT 新闻"]');
    expect(ithomeTile).toBeTruthy();
    fireEvent.click(ithomeTile);
    expect(activeNav.value).toBe('ithome');
  });

  it('tile aria-label 包含中文标题 (无障碍)', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { container } = render(<HomeGrid />);

    const expected = [
      '进入 IT 新闻',
      '进入 微博热搜',
      '进入 世界杯',
      '进入 基金管理',
      '进入 贵金属',
      '进入 选股',
      '进入 AI 用量',
      '进入 版本检查',
    ];
    expected.forEach((label) => {
      expect(container.querySelector(`button[aria-label="${label}"]`)).toBeTruthy();
    });
  });
});

// v3 (2026-07-10): 6 项完善. 每个加 1-2 个真测试.
describe('HomeGrid v3 — 视觉/交互完善', () => {
  it('A2: 副标题尾部有 ⌘1-8 快捷键提示', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { container } = render(<HomeGrid />);
    const kbdHints = container.querySelectorAll('.home-grid-tile-kbd');
    expect(kbdHints.length).toBe(8);
    expect(kbdHints[0].textContent).toBe('⌘1');
    expect(kbdHints[7].textContent).toBe('⌘8');
  });

  it('A14: 挂载后 root 加 home-grid-mounted class (cascade 触发)', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { container } = render(<HomeGrid />);
    // useEffect 同步后 + 1 RAF → setMounted(true)
    await new Promise((r) => setTimeout(r, 20));
    const root = container.querySelector('.home-grid-root');
    expect(root.classList.contains('home-grid-mounted')).toBe(true);
  });

  it('A3: ⌘1 直接切到 ithome', async () => {
    const { render, fireEvent } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { setActiveNav, activeNav } = await import('../../src/renderer/worldcup/navStore.js');
    setActiveNav('home');

    render(<HomeGrid />);
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(activeNav.value).toBe('ithome');
  });

  it('A3: ArrowRight 在 grid 里移动焦点', async () => {
    const { render, fireEvent } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { activeNav } = await import('../../src/renderer/worldcup/navStore.js');
    activeNav.value = 'home';

    const { container } = render(<HomeGrid />);
    // 初始 focus 0
    const tiles = container.querySelectorAll('.home-grid-tile');
    expect(tiles[0].getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    // focus idx 0 → 1
    await new Promise((r) => setTimeout(r, 10));
    expect(tiles[0].getAttribute('tabindex')).toBe('-1');
    expect(tiles[1].getAttribute('tabindex')).toBe('0');
  });

  it('A1: ithomeUnreadBadge > 0 时 tile 渲染 badge', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    // ithomeUnreadBadge 是 computed, 派生自 ithomeNewIds.
    // 写 3 个 key 进 ithomeNewIds → computed 重算 → badge = 3.
    const { ithomeNewIds } = await import('../../src/renderer/ithome/store.js');
    ithomeNewIds.value = { a: 1, b: 1, c: 1 };

    const { container } = render(<HomeGrid />);
    // ithome 是第一个 tile
    const ithomeBadge = container.querySelectorAll('.home-grid-tile-badge')[0];
    expect(ithomeBadge).toBeTruthy();
    expect(ithomeBadge.textContent).toBe('3');
  });

  it('A1: 100+ 显示 99+', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    // 写 150 个 key (慢? 不, 单测 150 个 {x:1} 操作 < 1ms)
    const { ithomeNewIds } = await import('../../src/renderer/ithome/store.js');
    const big = {};
    for (let i = 0; i < 150; i++) big[`k${i}`] = 1;
    ithomeNewIds.value = big;

    const { container } = render(<HomeGrid />);
    const badge = container.querySelectorAll('.home-grid-tile-badge')[0];
    expect(badge.textContent).toBe('99+');
  });

  it('A1: badge = 0 时不渲染 .home-grid-tile-badge', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    // 重置 4 个 source signal 到 0
    const ithome = await import('../../src/renderer/ithome/store.js');
    const wechat = await import('../../src/renderer/wechat-hot/store.js');
    const funds = await import('../../src/renderer/funds/fundStore.js');
    const ai = await import('../../src/renderer/store/ai-usage-store.js');
    ithome.ithomeNewIds.value = {};
    if (wechat.wechatHotUnreadIds) wechat.wechatHotUnreadIds.value = {};
    if (funds.fundUnreadIds) funds.fundUnreadIds.value = {};
    if (ai.aiUsageNavBadge) ai.aiUsageNavBadge.value = 0; // writable signal

    const { container } = render(<HomeGrid />);
    expect(container.querySelectorAll('.home-grid-tile-badge').length).toBe(0);
  });

  it('A17: prefers-reduced-motion 时 root 加 home-grid-reduced class', async () => {
    // monkey-patch matchMedia 模拟系统设置
    const origMM = window.matchMedia;
    window.matchMedia = (q) => ({
      matches: q.includes('reduce'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    });
    try {
      const { render } = await import('@testing-library/preact');
      const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
      const { container } = render(<HomeGrid />);
      await new Promise((r) => setTimeout(r, 5));
      const root = container.querySelector('.home-grid-root');
      expect(root.classList.contains('home-grid-reduced')).toBe(true);
    } finally {
      window.matchMedia = origMM;
    }
  });
});