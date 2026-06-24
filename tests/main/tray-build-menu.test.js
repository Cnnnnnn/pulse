/**
 * tests/main/tray-build-menu.test.js
 *
 * v2.22 Task A1: 抽 buildMenu 纯函数 — 无 Electron 依赖,可单测.
 *
 * 注: 这个文件独立于 tests/main/tray.test.js (P4), 因为 P4 tests 走
 * vi.resetModules() + require.cache 注入 stub electron 的流程, 不能跟
 * ESM static import 共存. buildMenu 内部用 require('electron').shell, 但
 * 我们的测试只 click 4 个底部 action, 不走 shell 调用路径; 即便 require
 * 拿到的 electron 是真实 stub, click 不触发 shell 也没事.
 */
import { describe, it, expect, vi } from 'vitest';
import { _internal } from '../../src/main/tray.js';

const { buildMenu } = _internal;

describe('tray.buildMenu — 基础结构 (Task A1 refactor)', () => {
  it('results=[] 时: 显示 I7 summary (尚未检测) + 检查更新段头 + 4 个底部 action', () => {
    const m = buildMenu({
      results: [],
      aiUsage: null,
      worldcup: null,
      metals: null,
    });
    const labels = m.map((i) => i.label).filter(Boolean);
    // I7: 顶部 summary 行 → separator → 检查更新段头 → 底部 actions
    expect(labels).toEqual([
      '🔔 Pulse · 尚未检测',
      '── 🔄 检查更新 · 尚未检查 ──',
      '打开面板',
      '检查更新',
      '打开配置文件',
      '退出',
    ]);
  });

  it('提供 callbacks: 4 个底部 action 的 click 各自触发正确 callback', () => {
    const onOpenPanel = vi.fn();
    const onCheck = vi.fn();
    const onOpenConfig = vi.fn();
    const onQuit = vi.fn();
    const m = buildMenu({
      results: [],
      aiUsage: null,
      worldcup: null,
      metals: null,
      onOpenPanel,
      onCheck,
      onOpenConfig,
      onQuit,
    });
    m.find((i) => i.label === '打开面板').click();
    m.find((i) => i.label === '检查更新').click();
    m.find((i) => i.label === '打开配置文件').click();
    m.find((i) => i.label === '退出').click();
    expect(onOpenPanel).toHaveBeenCalledOnce();
    expect(onCheck).toHaveBeenCalledOnce();
    expect(onOpenConfig).toHaveBeenCalledOnce();
    expect(onQuit).toHaveBeenCalledOnce();
  });

  it('有 1 个更新: I7 summary + 检查更新段头 + 升级行 + 点击触发 onFocusUpdate', () => {
    const onFocusUpdate = vi.fn();
    const m = buildMenu({
      results: [
        { name: 'Codex', installed_version: '26.609', latest_version: '26.611', has_update: true, status: 'update_available', ts: Date.now() },
      ],
      onFocusUpdate,
    });
    // I7 summary 行在 m[0]
    expect(m[0].label).toBe('🔔 Pulse · 1 应用 · 1 待升级');
    // m[1] separator, m[2] 检查更新段头
    expect(m[2].label).toBe('── 🔄 检查更新 (1 待升级) ──');
    const updateRow = m.find((i) => i.label && i.label.startsWith('Codex'));
    expect(updateRow.label).toContain('26.609');
    expect(updateRow.label).toContain('26.611');
    expect(updateRow.label).toContain('⬆️ 升级');
    updateRow.click();
    expect(onFocusUpdate).toHaveBeenCalledWith({
      rowName: 'Codex',
      action: 'upgrade',
    });
  });

  it('全部最新 (无 update): I7 summary + 检查更新段头 + 提示行', () => {
    const m = buildMenu({
      results: [
        { name: 'Cursor', installed_version: '3.7.42', latest_version: '3.7.42', has_update: false, status: 'up_to_date', ts: Date.now() },
        { name: 'Kimi', installed_version: '3.0.20', latest_version: '3.0.20', has_update: false, status: 'up_to_date', ts: Date.now() },
      ],
    });
    const labels = m.map((i) => i.label).filter(Boolean);
    // I7 summary → separator → 段头 + 提示行 → 4 actions
    expect(labels[0]).toBe('🔔 Pulse · 2 应用 · 全部最新');
    expect(labels[1]).toBe('── 🔄 检查更新 · 全部最新 (2) ──');
    expect(labels[2]).toBe('  点击"检查更新"手动刷新');
    expect(labels).toEqual([
      '🔔 Pulse · 2 应用 · 全部最新',
      '── 🔄 检查更新 · 全部最新 (2) ──',
      '  点击"检查更新"手动刷新',
      '打开面板',
      '检查更新',
      '打开配置文件',
      '退出',
    ]);
  });
});

describe('tray.buildMenu — 📊 AI 用量段 (Task B2)', () => {
  it('两 provider 都 unconfigured → 整段只显示"未配置"', () => {
    const m = buildMenu({
      results: [],
      aiUsage: { minimax: { status: 'unconfigured' }, glm: { status: 'unconfigured' } },
    });
    // 找 "未配置" 行 (在 AI section 中)
    const unconfiguredRow = m.find((i) => i.label && i.label.trim() === '未配置');
    expect(unconfiguredRow).toBeDefined();
  });

  it('minimax ok + glm unconfigured → 显示 MiniMax 行 (含 percent + remainLabel),GLM 不显示', () => {
    const m = buildMenu({
      results: [],
      aiUsage: {
        minimax: { status: 'ok', percent: 72, remainLabel: '1.2h', fetchedAt: Date.now() },
        glm: { status: 'unconfigured' },
      },
    });
    const aiLines = m.filter((i) => i.label && (i.label.includes('MiniMax') || i.label.includes('GLM')));
    expect(aiLines).toHaveLength(1);
    expect(aiLines[0].label).toContain('72%');
    expect(aiLines[0].label).toContain('1.2h');
  });

  it('aiUsage=null → 整段隐藏 (无 AI section 行)', () => {
    const m = buildMenu({ results: [] });
    const aiLines = m.filter((i) => i.label && (i.label.includes('MiniMax') || i.label.includes('GLM') || i.label.trim() === '未配置'));
    expect(aiLines).toHaveLength(0);
  });

  it('陈旧数据 (>1h) → 行尾 (Nh 前)', () => {
    const old = Date.now() - 2 * 60 * 60 * 1000; // 2h 前
    const m = buildMenu({
      results: [],
      aiUsage: {
        minimax: { status: 'ok', percent: 80, remainLabel: '1h', fetchedAt: old },
      },
    });
    const aiLines = m.filter((i) => i.label && i.label.includes('MiniMax'));
    expect(aiLines[0].label).toContain('(2h 前)');
  });
});

describe('tray.buildMenu — ⚽ 世界杯段 (Task C2)', () => {
  it('有今日比赛 → 显示 ⚽ 段 + 至少一行 team1 vs team2', () => {
    const m = buildMenu({
      results: [],
      worldcup: { todayMatches: [{ team1: 'Mexico', team2: 'South Africa', time: '13:00', score: { ft: [1, 0], status: 'live' } }] },
    });
    const headerRow = m.find((i) => i.label && i.label.includes('⚽'));
    expect(headerRow).toBeDefined();
    const matchRow = m.find((i) => i.label && i.label.includes('Mexico') && i.label.includes('South Africa'));
    expect(matchRow).toBeDefined();
  });

  it('live 比赛显示实时比分', () => {
    const m = buildMenu({
      results: [],
      worldcup: { todayMatches: [{ team1: 'Brazil', team2: 'Argentina', time: '20:00', score: { ft: [2, 1], status: 'live' } }] },
    });
    const matchRow = m.find((i) => i.label && i.label.includes('Brazil'));
    expect(matchRow.label).toContain('2-1');
  });

  it('worldcup=null → 整段隐藏', () => {
    const m = buildMenu({ results: [] });
    const wcRows = m.filter((i) => i.label && i.label.includes('⚽'));
    expect(wcRows).toHaveLength(0);
  });

  it('显示即将开始的下一场 (无今日比赛)', () => {
    const m = buildMenu({
      results: [],
      worldcup: {
        todayMatches: [],
        upcoming: [{ team1: 'Spain', team2: 'France', time: '明天 15:00', date: '2026-06-18' }],
      },
    });
    const upcomingRow = m.find((i) => i.label && i.label.includes('下一场') && i.label.includes('Spain'));
    expect(upcomingRow).toBeDefined();
  });
});

describe('tray.buildMenu — ⚽ 世界杯段 clickable (Task C3)', () => {
  it('今日比赛行 → enabled: true (可点击)', () => {
    let captured = null;
    const m = buildMenu({
      results: [],
      worldcup: {
        todayMatches: [{ key: '2026-06-17|13:00|Mexico|South Africa', team1: 'Mexico', team2: 'South Africa', time: '13:00' }],
      },
      onFocusWorldcup: (data) => { captured = data; },
    });
    const matchRow = m.find((i) => i.label && i.label.includes('Mexico') && i.label.includes('South Africa'));
    expect(matchRow).toBeDefined();
    expect(matchRow.enabled).toBe(true);
    // 模拟 click
    matchRow.click();
    expect(captured).toEqual({ matchKey: '2026-06-17|13:00|Mexico|South Africa' });
  });

  it('"下一场" 行 → 也可点击 + 调 onFocusWorldcup', () => {
    let captured = null;
    const m = buildMenu({
      results: [],
      worldcup: {
        todayMatches: [],
        upcoming: [{ key: '2026-06-18|15:00|Spain|France', team1: 'Spain', team2: 'France', time: '明天 15:00' }],
      },
      onFocusWorldcup: (data) => { captured = data; },
    });
    const nextRow = m.find((i) => i.label && i.label.includes('下一场') && i.label.includes('Spain'));
    expect(nextRow).toBeDefined();
    expect(nextRow.enabled).toBe(true);
    nextRow.click();
    expect(captured).toEqual({ matchKey: '2026-06-18|15:00|Spain|France' });
  });

  it('onFocusWorldcup 缺省 → 回调 stub 不抛异常', () => {
    const m = buildMenu({
      results: [],
      worldcup: {
        todayMatches: [{ key: 'k1', team1: 'A', team2: 'B', time: '12:00' }],
      },
    });
    const matchRow = m.find((i) => i.label && i.label.includes('A') && i.label.includes('B'));
    expect(() => matchRow.click()).not.toThrow();
  });
});

describe('tray.buildMenu — 💎 贵金属段 (Task D1)', () => {
  it('有报价 → 显示 💎 段 + XAU 价格行 (USD/oz)', () => {
    const m = buildMenu({
      results: [],
      metals: {
        quotes: { XAU: { price: 3350.42, prevClose: 3340.10, currency: 'USD', unit: 'oz' } },
        holdings: {},
        fetchedAt: Date.now(),
        errors: {},
      },
    });
    const headerRow = m.find((i) => i.label && i.label.includes('💎'));
    expect(headerRow).toBeDefined();
    const priceRow = m.find((i) => i.label && i.label.includes('XAU') && i.label.includes('3350'));
    expect(priceRow).toBeDefined();
  });

  it('无报价 (scheduler 未拉到) → 显示 "加载中..." 而非崩溃', () => {
    const m = buildMenu({
      results: [],
      metals: { quotes: {}, holdings: {}, fetchedAt: null, errors: {} },
    });
    const headerRow = m.find((i) => i.label && i.label.includes('💎'));
    expect(headerRow).toBeDefined();
    const loadingRow = m.find((i) => i.label && i.label.includes('加载中'));
    expect(loadingRow).toBeDefined();
  });

  it('报价有变化 (price vs prevClose) → 行尾带 ↑/↓', () => {
    const m1 = buildMenu({
      results: [],
      metals: { quotes: { XAU: { price: 3400, prevClose: 3340, currency: 'USD', unit: 'oz' } }, holdings: {}, fetchedAt: Date.now(), errors: {} },
    });
    const m2 = buildMenu({
      results: [],
      metals: { quotes: { XAU: { price: 3300, prevClose: 3340, currency: 'USD', unit: 'oz' } }, holdings: {}, fetchedAt: Date.now(), errors: {} },
    });
    const row1 = m1.find((i) => i.label && i.label.includes('XAU'));
    const row2 = m2.find((i) => i.label && i.label.includes('XAU'));
    expect(row1.label).toContain('↑');
    expect(row2.label).toContain('↓');
  });

  it('metals=null → 整段隐藏', () => {
    const m = buildMenu({ results: [] });
    const metalRows = m.filter((i) => i.label && i.label.includes('💎'));
    expect(metalRows).toHaveLength(0);
  });
});
