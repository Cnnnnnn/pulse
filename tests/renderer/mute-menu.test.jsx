/**
 * tests/renderer/mute-menu.test.jsx
 *
 * Phase 27: MuteMenu 组件测试
 *   - 未静音: 渲染 4 个 mute 选项 (7/30/90/forever)
 *   - 已静音: 渲染 "取消静音" + 状态文字
 *   - 点选项 → 调 setMute + onClose
 *   - 点取消 → 调 clearMute + onClose
 *   - Esc 关闭
 *   - 点击外部关闭
 *   - 视口边缘 clamp
 */

// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';
import { MuteMenu } from '../../src/renderer/components/MuteMenu.jsx';

// mock store 里的 setMute / clearMute, 因为它们走 IPC, 测试里要拦截
const setMuteMock = vi.fn();
const clearMuteMock = vi.fn();
vi.mock('../../src/renderer/store.js', async () => {
  const actual = await vi.importActual('../../src/renderer/store.js');
  return {
    ...actual,
    setMute: (...args) => setMuteMock(...args),
    clearMute: (...args) => clearMuteMock(...args),
  };
});

afterEach(() => {
  cleanup();
  setMuteMock.mockReset();
  clearMuteMock.mockReset();
});

function setup(props = {}) {
  const onClose = vi.fn();
  const onAction = vi.fn();
  const defaults = {
    x: 100, y: 100, appName: 'Cursor', isMuted: false, muteUntil: 0,
    onClose, onAction,
    ...props,
  };
  const utils = render(<MuteMenu {...defaults} />);
  return { ...utils, onClose, onAction };
}

describe('MuteMenu (Phase 27)', () => {
  describe('未静音状态', () => {
    it('渲染 4 个选项 (7天/30天/90天/永远)', () => {
      const { getAllByRole } = setup();
      const items = getAllByRole('menuitem');
      expect(items).toHaveLength(4);
      expect(items[0].textContent).toContain('7 天');
      expect(items[1].textContent).toContain('30 天');
      expect(items[2].textContent).toContain('90 天');
      expect(items[3].textContent).toContain('永远');
    });

    it('显示 app name + 静音 icon', () => {
      const { container } = setup({ appName: 'Kimi' });
      expect(container.querySelector('.mute-menu-app').textContent).toBe('Kimi');
      expect(container.querySelector('.mute-menu-icon').textContent).toBe('🔔');
    });

    it('点 7 天 → setMute("Cursor", 7*24*3600) + onAction + onClose', async () => {
      setMuteMock.mockResolvedValue({ ok: true });
      const { getAllByRole, onAction, onClose } = setup();
      const items = getAllByRole('menuitem');
      await fireEvent.click(items[0]);
      // 等待 microtask 让 async 流程跑完
      await new Promise((r) => setTimeout(r, 0));
      expect(setMuteMock).toHaveBeenCalledWith('Cursor', 7 * 24 * 3600);
      expect(onAction).toHaveBeenCalledWith({ type: 'mute', seconds: 7 * 24 * 3600 });
      expect(onClose).toHaveBeenCalled();
    });

    it('点 永远 → setMute(app, 0)', async () => {
      setMuteMock.mockResolvedValue({ ok: true });
      const { getAllByRole } = setup();
      const items = getAllByRole('menuitem');
      await fireEvent.click(items[3]);
      await new Promise((r) => setTimeout(r, 0));
      expect(setMuteMock).toHaveBeenCalledWith('Cursor', 0);
    });
  });

  describe('已静音状态', () => {
    it('渲染 "取消静音" 按钮 + 状态行 (到期时间)', () => {
      const until = Date.now() + 7 * 24 * 3600 * 1000;
      const { getAllByRole, container } = setup({ isMuted: true, muteUntil: until });
      const items = getAllByRole('menuitem');
      expect(items).toHaveLength(1);
      expect(items[0].textContent).toContain('取消静音');
      expect(container.querySelector('.mute-menu-status').textContent).toMatch(/已静音至/);
      expect(container.querySelector('.mute-menu-icon').textContent).toBe('🔇');
    });

    it('永远 (until=0) → 显示 "永远"', () => {
      const { container } = setup({ isMuted: true, muteUntil: 0 });
      expect(container.querySelector('.mute-menu-status').textContent).toContain('永远');
    });

    it('点取消 → clearMute + onAction + onClose', async () => {
      clearMuteMock.mockResolvedValue({ ok: true });
      const { getAllByRole, onAction, onClose } = setup({ isMuted: true, muteUntil: 12345 });
      await fireEvent.click(getAllByRole('menuitem')[0]);
      await new Promise((r) => setTimeout(r, 0));
      expect(clearMuteMock).toHaveBeenCalledWith('Cursor');
      expect(onAction).toHaveBeenCalledWith({ type: 'unmute' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('关闭', () => {
    it('Esc → onClose', () => {
      const { onClose } = setup();
      // happy-dom: 用 dispatchEvent 模拟 keydown
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('点击菜单外部 → onClose', () => {
      const { onClose } = setup();
      // 创建一个菜单外元素并点击
      const outside = document.createElement('div');
      outside.id = 'outside';
      document.body.appendChild(outside);
      fireEvent.mouseDown(outside);
      document.body.removeChild(outside);
      expect(onClose).toHaveBeenCalled();
    });

    it('点击菜单内部 → 不关', () => {
      const { container, onClose } = setup();
      const menu = container.querySelector('.mute-menu');
      fireEvent.mouseDown(menu);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('边界', () => {
    it('setMute 失败 → 仍关闭 (但 onAction 不调)', async () => {
      setMuteMock.mockResolvedValue({ ok: false, reason: 'threw' });
      const { getAllByRole, onAction, onClose } = setup();
      await fireEvent.click(getAllByRole('menuitem')[0]);
      await new Promise((r) => setTimeout(r, 0));
      expect(setMuteMock).toHaveBeenCalled();
      expect(onAction).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
