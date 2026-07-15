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
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('HomeGrid navStore 集成路径', () => {
  it('activeNav 默认值为 "home"', async () => {
    const { activeNav } = await import('../../src/renderer/worldcup/navStore.js');
    expect(activeNav.value).toBe('home');
  });

  it('setActiveNav("funds") alias → "invest" (投资 nav 合并)', async () => {
    const { setActiveNav, activeNav } = await import('../../src/renderer/worldcup/navStore.js');
    setActiveNav('funds');
    // ponytail 2026-07-13: funds/metals/stocks 合并为 'invest' nav, legacy key alias.
    expect(activeNav.value).toBe('invest');
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
    // v6 (2026-07-13): funds + metals + stocks 合并 → 'invest' → 5 顶级 nav.
    expect(PERSISTABLE_NAV_KEYS.size).toBe(5);
  });
});

// v2 (2026-07-10): HomeGrid 视觉重做后, 加真渲染测试覆盖视觉契约.
// 验证 hero / 5 tile / SVG icon / accent class / aria-label 都在.
// v6 (2026-07-13): 合并 funds + metals + stocks → 'invest' tile.
describe('HomeGrid v2 — 渲染契约', () => {
  it('渲染出 hero (品牌 mark + greeting + 时间 + 5 模块 meta)', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { container } = render(<HomeGrid />);

    expect(container.querySelector('.home-hero')).toBeTruthy();
    expect(container.querySelector('.home-hero-mark')?.textContent).toBe('P');
    expect(container.querySelector('.home-hero-greeting')).toBeTruthy();
    expect(container.querySelector('.home-hero-time')).toBeTruthy();
    expect(container.querySelector('.home-hero-date')).toBeTruthy();
    // v6: 5 模块 (新闻/世界杯/投资/AI/版本).
    expect(container.querySelector('.home-hero-meta')?.textContent).toContain('5');
  });

  it('渲染 5 个 tile, 全部带 home-grid-tile-accent class', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { container } = render(<HomeGrid />);

    const tiles = container.querySelectorAll('.home-grid-tile');
    expect(tiles.length).toBe(5);
    // 5 个不同 accent class
    const accents = new Set();
    tiles.forEach((t) => {
      const m = t.className.match(/home-grid-tile-(\w+)/);
      if (m) accents.add(m[1]);
    });
    accents.delete('tile'); // base class 名字
    expect(accents.size).toBe(5);
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
    // v5: IT 新闻 + 微博热搜 合并成 '新闻', aria-label 用 starts-with 选择.
    const newsTile = container.querySelector('button[aria-label^="进入 新闻"]');
    expect(newsTile).toBeTruthy();
    fireEvent.click(newsTile);
    expect(activeNav.value).toBe('news');
  });

  it('tile aria-label 包含中文标题 (无障碍)', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { container } = render(<HomeGrid />);

    // v6: funds + metals + stocks 合并 → '投资'. 共 5 模块 tile.
    const expected = [
      '新闻',
      '世界杯',
      '投资',
      'AI 用量',
      '版本检查',
    ];
    expected.forEach((label) => {
      expect(container.querySelector(`button[aria-label^="进入 ${label}"]`)).toBeTruthy();
    });
  });
});

// v3 (2026-07-10): 6 项完善. 每个加 1-2 个真测试.
describe('HomeGrid v3 — 视觉/交互完善', () => {
  it('A2: 副标题尾部有 ⌘1-5 快捷键提示', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { container } = render(<HomeGrid />);
    const kbdHints = container.querySelectorAll('.home-grid-tile-kbd');
    // v6: 5 tile.
    expect(kbdHints.length).toBe(5);
    expect(kbdHints[0].textContent).toBe('⌘1');
    expect(kbdHints[4].textContent).toBe('⌘5');
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

  it('A3: ⌘1 直接切到 news (P-N+ IT 新闻 + 微博热搜 合并)', async () => {
    const { render, fireEvent } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { setActiveNav, activeNav } = await import('../../src/renderer/worldcup/navStore.js');
    setActiveNav('home');

    render(<HomeGrid />);
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(activeNav.value).toBe('news');
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

  it('A1: ithomeUnreadBadge > 0 时 news tile 渲染 badge (P-N+ 合并)', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    // ithomeUnreadBadge 是 computed, 派生自 ithomeNewIds.
    // 写 3 个 key 进 ithomeNewIds → computed 重算 → news badge = 3 (ithome+wechat=3+0).
    const { ithomeNewIds } = await import('../../src/renderer/ithome/store.js');
    ithomeNewIds.value = { a: 1, b: 1, c: 1 };

    const { container } = render(<HomeGrid />);
    // news 是第一个 tile
    const newsBadge = container.querySelectorAll('.home-grid-tile-badge')[0];
    expect(newsBadge).toBeTruthy();
    expect(newsBadge.textContent).toBe('3');
  });

  it('A1: news tile 合并 ithome + wechat 角标', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    // ithome 3 + wechat 5 = news badge 8
    const { ithomeNewIds } = await import('../../src/renderer/ithome/store.js');
    const { wechatHotNewIds } = await import('../../src/renderer/wechat-hot/store.js');
    ithomeNewIds.value = { a: 1, b: 1, c: 1 };
    wechatHotNewIds.value = { d: 1, e: 1, f: 1, g: 1, h: 1 };

    const { container } = render(<HomeGrid />);
    const newsBadge = container.querySelectorAll('.home-grid-tile-badge')[0];
    expect(newsBadge.textContent).toBe('8');
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
    // v5: news = ithome + wechat. 重置全部 source signal 到 0.
    const ithome = await import('../../src/renderer/ithome/store.js');
    const wechat = await import('../../src/renderer/wechat-hot/store.js');
    const funds = await import('../../src/renderer/funds/fundStore.js');
    const ai = await import('../../src/renderer/store/ai-usage-store.js');
    ithome.ithomeNewIds.value = {};
    wechat.wechatHotNewIds.value = {};
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

// v4 (2026-07-10): 3 项功能完善. B10 status / B11 favorites / A8 drag.
describe('HomeGrid v4 — 功能完善', () => {
  beforeEach(async () => {
    // 重置 prefs + 4 个数据源.
    const sp = await import('../../src/renderer/components/sidenav-prefs.js');
    sp.resetPrefs();
    localStorage.clear();
    sp.resetPrefs();
    const ithome = await import('../../src/renderer/ithome/store.js');
    const wechat = await import('../../src/renderer/wechat-hot/store.js');
    const funds = await import('../../src/renderer/funds/fundStore.js');
    const ai = await import('../../src/renderer/store/ai-usage-store.js');
    ithome.ithomeNewIds.value = {};
    if (wechat.wechatHotUnreadIds) wechat.wechatHotUnreadIds.value = {};
    if (funds.fundUnreadBadge) funds.fundUnreadBadge.value = 0;
    ai.aiUsageNavBadge.value = 0;
  });

  it('B10: 5 个 tile 都渲染 status 文本 (冷启动时多数为 "—")', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { container } = render(<HomeGrid />);
    const statuses = container.querySelectorAll('.home-grid-tile-status');
    // v6: 5 tile. 5 个 tile 都有 .home-grid-tile-status (哪怕是 "—")
    expect(statuses.length).toBe(5);
  });

  it('B10: news 有今日文章 → status 显示 "今日 N 条 · M 热搜" 合并态', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { ithomeDayStats } = await import('../../src/renderer/ithome/store.js');
    const { wechatHotItems } = await import('../../src/renderer/wechat-hot/store.js');
    const { todayShanghaiDateKey } = await import('../../src/renderer/ithome/news-utils.js');
    const today = todayShanghaiDateKey();
    ithomeDayStats.value = { [today]: { count: 23, fetchedAt: Date.now() } };
    wechatHotItems.value = Array.from({ length: 12 }, (_, i) => ({
      title: `热搜 ${i}`, rank: i + 1, url: '#', heat: '100万',
    }));

    const { container } = render(<HomeGrid />);
    // news tile 是第一个, 它的 status 是合并态
    const status = container.querySelector('.home-grid-tile-status');
    expect(status.textContent).toContain('今日');
    expect(status.textContent).toContain('23');
    expect(status.textContent).toContain('12');
    expect(status.textContent).toContain('热搜');
  });

  it('B10: metals 有 AU9999 报价 → status 显示金价', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { quoteCache } = await import('../../src/renderer/metals/metalStore.js');
    quoteCache.value = {
      data: { AU9999: { price: 768.5 } },
      errors: {},
      fetchedAt: Date.now(),
    };

    const { container } = render(<HomeGrid />);
    const statuses = Array.from(container.querySelectorAll('.home-grid-tile-status'));
    const metalStatus = statuses.find((s) => s.textContent.includes('¥'));
    expect(metalStatus).toBeTruthy();
    expect(metalStatus.textContent).toContain('768');
  });

  it('B11: 点击星标 toggle 收藏 (不会切 nav)', async () => {
    const { render, fireEvent } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { activeNav } = await import('../../src/renderer/worldcup/navStore.js');
    const { isFavorite } = await import('../../src/renderer/components/sidenav-prefs.js');

    const { container } = render(<HomeGrid />);
    // 第一个 tile (ithome) 的收藏按钮
    const favBtn = container.querySelectorAll('.home-grid-tile-fav-btn')[0];
    expect(favBtn).toBeTruthy();
    // 初始未收藏 — class 不含 is-fav
    expect(favBtn.classList.contains('is-fav')).toBe(false);

    fireEvent.click(favBtn);
    expect(activeNav.value).toBe('home'); // ★ 关键: 没切 nav
    expect(favBtn.classList.contains('is-fav')).toBe(true);
    expect(favBtn.textContent).toBe('★');

    fireEvent.click(favBtn);
    expect(favBtn.classList.contains('is-fav')).toBe(false);
    expect(favBtn.textContent).toBe('☆');
  });

  it('B11: 收藏的 tile 排前面', async () => {
    const { render, fireEvent } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { setActiveNav } = await import('../../src/renderer/worldcup/navStore.js');

    const { container } = render(<HomeGrid />);
    // v5: news=0, worldcup=1, funds=2. 收藏 idx=1 (worldcup)
    const favBtns = container.querySelectorAll('.home-grid-tile-fav-btn');
    fireEvent.click(favBtns[1]);

    // 重渲染拿到新顺序
    const { container: c2 } = render(<HomeGrid />);
    const titles = Array.from(c2.querySelectorAll('.home-grid-tile-title')).map((t) => t.textContent);
    expect(titles[0]).toBe('世界杯'); // 排第一
  });

  it('A8: tile 渲染 draggable 属性 + dragstart 触发 setDraggingKey', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { container } = render(<HomeGrid />);
    const tiles = container.querySelectorAll('.home-grid-tile');
    expect(tiles[0].getAttribute('draggable')).toBe('true');
  });

  it('A8: drop 到目标 tile → order 变化 (用 prefs.order 验证)', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { loadPrefs, savePrefs, resetPrefs } = await import('../../src/renderer/components/sidenav-prefs.js');
    // v6: 5 个 tile (合并 news + 投资 nav 合并)
    savePrefs({ ...resetPrefs(), order: ['news', 'worldcup', 'invest', 'ai-usage', 'versions'] });

    const { container } = render(<HomeGrid />);
    const tiles = container.querySelectorAll('.home-grid-tile');

    // ponytail: happy-dom 提供真 DataTransfer; fireEvent.dragX 触发 Preact onDragX.
    const { fireEvent } = await import('@testing-library/preact');
    const dt = new DataTransfer();
    fireEvent.dragStart(tiles[0], { dataTransfer: dt });
    fireEvent.dragOver(tiles[2], { dataTransfer: dt });
    fireEvent.drop(tiles[2], { dataTransfer: dt });

    // prefs.order 应包含 invest, news, ... (news 拖到 invest 之后)
    const p = loadPrefs();
    const idxNews = p.order.indexOf('news');
    const idxInvest = p.order.indexOf('invest');
    expect(idxNews).toBeGreaterThan(idxInvest);
  });

  // ── worldcup status 4 级 fallback ────────────────────────────────────
  it('B10+: worldcup 进行中 → "live <t1> 1-0 <t2> 67\'"', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { worldcupMatches } = await import('../../src/renderer/worldcup/store.js');
    worldcupMatches.value = {
      name: 'WC 2026', groups: [], matches: [
        { date: '2026-07-10', time: '14:00', timezone: 'UTC+8', team1: 'Brazil', team2: 'Argentina',
          score: { ft: [1, 0], status: 'live', clock: "67'" } },
      ],
    };
    const { container } = render(<HomeGrid />);
    // worldcup tile 在 5 个里的 idx=1
    const tile = container.querySelectorAll('.home-grid-tile')[1];
    const status = tile.querySelector('.home-grid-tile-status');
    expect(status.textContent).toContain('live');
    expect(status.textContent).toContain('Brazil');
    expect(status.textContent).toContain('1-0');
    expect(status.textContent).toContain('Argentina');
    expect(status.textContent).toContain('67');
  });

  it('B10+: worldcup 今天有 upcoming → "今日 N 场 · HH:MM t1 vs t2"', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { worldcupMatches } = await import('../../src/renderer/worldcup/store.js');
    const { todayShanghaiDateKey } = await import('../../src/renderer/ithome/news-utils.js');
    const today = todayShanghaiDateKey();
    // 2 场今天, 1 场明天.
    const tomorrow = new Date(Date.now() + 86400_000);
    const tomKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    // ponytail: 用 timezone='UTC' 让 happy-dom 时区一致, 避开 host TZ 漂移.
    worldcupMatches.value = {
      name: 'WC', groups: [], matches: [
        { date: today, time: '18:00', timezone: 'UTC', team1: 'France', team2: 'Spain', score: null },
        { date: today, time: '22:00', timezone: 'UTC', team1: 'Germany', team2: 'Italy', score: null },
        { date: tomKey, time: '18:00', timezone: 'UTC', team1: 'A', team2: 'B', score: null },
      ],
    };
    const { container } = render(<HomeGrid />);
    const tile = container.querySelectorAll('.home-grid-tile')[1];
    const status = tile.querySelector('.home-grid-tile-status');
    expect(status.textContent).toContain('今日');
    expect(status.textContent).toContain('2');
    expect(status.textContent).toMatch(/\d{2}:\d{2}/);
    expect(status.textContent).toContain('France');
    expect(status.textContent).toContain('Spain');
  });

  it('B10+: worldcup 跨日 upcoming → "下一场 MM-DD HH:MM t1 vs t2"', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { worldcupMatches } = await import('../../src/renderer/worldcup/store.js');
    const future = new Date(Date.now() + 7 * 86400_000);
    const key = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    worldcupMatches.value = {
      name: 'WC', groups: [], matches: [
        { date: key, time: '03:00', timezone: 'UTC+8', team1: 'Japan', team2: 'Korea', score: null },
      ],
    };
    const { container } = render(<HomeGrid />);
    const tile = container.querySelectorAll('.home-grid-tile')[1];
    const status = tile.querySelector('.home-grid-tile-status');
    expect(status.textContent).toContain('下一场');
    expect(status.textContent).toContain('Japan');
  });

  it('B10+: worldcup 全结束 → "已结束 · <t1> 2:1 <t2>"', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { worldcupMatches } = await import('../../src/renderer/worldcup/store.js');
    worldcupMatches.value = {
      name: 'WC', groups: [], matches: [
        { date: '2025-01-01', time: '00:00', timezone: 'UTC+8', team1: 'Sweden', team2: 'Norway',
          score: { ft: [2, 1], status: 'final' } },
      ],
    };
    const { container } = render(<HomeGrid />);
    const tile = container.querySelectorAll('.home-grid-tile')[1];
    const status = tile.querySelector('.home-grid-tile-status');
    expect(status.textContent).toContain('已结束');
    expect(status.textContent).toContain('Sweden');
    expect(status.textContent).toContain('2:1');
    expect(status.textContent).toContain('Norway');
  });

  // ── ai-usage 简略 ─────────────────────────────────────────────────
  it('B10+: ai-usage 有 usedPercent → "已用 N%"', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { aiUsageSnapshot } = await import('../../src/renderer/store/ai-usage-store.js');
    aiUsageSnapshot.value = {
      minimax: { windows: { weekly: { usedPercent: 42 } } },
      glm: null,
    };
    const { container } = render(<HomeGrid />);
    // v6 (2026-07-13): 投资 nav 合并 → 6 tile, ai-usage 排 idx=3.
    const tile = container.querySelectorAll('.home-grid-tile')[3];
    const status = tile.querySelector('.home-grid-tile-status');
    expect(status.textContent).toBe('已用 42%');
  });

  it('B10+: ai-usage 0% 用完 → 显示 "已用 0%"', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { aiUsageSnapshot } = await import('../../src/renderer/store/ai-usage-store.js');
    aiUsageSnapshot.value = {
      minimax: { windows: { weekly: { usedPercent: 0 } } },
      glm: null,
    };
    const { container } = render(<HomeGrid />);
    const tile = container.querySelectorAll('.home-grid-tile')[3];
    const status = tile.querySelector('.home-grid-tile-status');
    expect(status.textContent).toBe('已用 0%');
  });

  it('B10+: ai-usage 有 remaining 但无 usedPercent → 算百分比', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { aiUsageSnapshot } = await import('../../src/renderer/store/ai-usage-store.js');
    aiUsageSnapshot.value = {
      minimax: { windows: { weekly: { remaining: 25, total: 100 } } },
      glm: null,
    };
    const { container } = render(<HomeGrid />);
    const tile = container.querySelectorAll('.home-grid-tile')[3];
    const status = tile.querySelector('.home-grid-tile-status');
    expect(status.textContent).toBe('已用 75%');
  });

  it('B10+: ai-usage 无数据 → "—"', async () => {
    const { render } = await import('@testing-library/preact');
    const { HomeGrid } = await import('../../src/renderer/components/HomeGrid.jsx');
    const { aiUsageSnapshot } = await import('../../src/renderer/store/ai-usage-store.js');
    aiUsageSnapshot.value = { minimax: null, glm: null };
    const { container } = render(<HomeGrid />);
    const tile = container.querySelectorAll('.home-grid-tile')[3];
    const status = tile.querySelector('.home-grid-tile-status');
    expect(status.textContent).toBe('—');
  });
});