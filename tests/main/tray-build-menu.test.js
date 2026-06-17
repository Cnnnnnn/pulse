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
  it('results=[] 时: 显示 "── 🔄 检查更新 · 尚未检查 ──" 段头 + 4 个底部 action', () => {
    const m = buildMenu({
      results: [],
      aiUsage: null,
      worldcup: null,
      metals: null,
    });
    const labels = m.map((i) => i.label).filter(Boolean);
    expect(labels).toEqual([
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

  it('有 1 个更新: 显示段头 + 升级行 + 点击触发 onFocusUpdate', () => {
    const onFocusUpdate = vi.fn();
    const m = buildMenu({
      results: [
        { name: 'Codex', installed_version: '26.609', latest_version: '26.611', has_update: true, status: 'update_available' },
      ],
      onFocusUpdate,
    });
    expect(m[0].label).toBe('── 🔄 检查更新 (1 待升级) ──');
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

  it('全部最新 (无 update): 显示 "全部最新 (N)" 段头 + 提示行', () => {
    const m = buildMenu({
      results: [
        { name: 'Cursor', installed_version: '3.7.42', latest_version: '3.7.42', has_update: false, status: 'up_to_date' },
        { name: 'Kimi', installed_version: '3.0.20', latest_version: '3.0.20', has_update: false, status: 'up_to_date' },
      ],
    });
    const labels = m.map((i) => i.label).filter(Boolean);
    // 段头 + 提示行 + 4 个底部 action (无 rowName, 因为不点)
    expect(labels[0]).toBe('── 🔄 检查更新 · 全部最新 (2) ──');
    expect(labels[1]).toBe('  点击"检查更新"手动刷新');
    // 段后 separator (type:'separator') + 4 actions
    expect(labels).toEqual([
      '── 🔄 检查更新 · 全部最新 (2) ──',
      '  点击"检查更新"手动刷新',
      '打开面板',
      '检查更新',
      '打开配置文件',
      '退出',
    ]);
  });
});
