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
  it('无结果时: 显示 "尚未检查" 占位 + 4 个底部 action', () => {
    const m = buildMenu({
      results: [],
      aiUsage: null,
      worldcup: null,
      metals: null,
    });
    const labels = m.map((i) => i.label).filter(Boolean);
    // A1 是纯重构, 不动原行为: lastResults.length === 0 时
    // rebuildMenu 会 push "尚未检查" 占位行 (现状保留), 再跟 4 个底部 action.
    expect(labels).toEqual([
      '尚未检查',
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
});
