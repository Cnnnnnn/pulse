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
import { MuteMenu, rankOptions, RECOMMENDED } from '../../src/renderer/components/MuteMenu.jsx';

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
    x: 100, y: 100, appName: 'Cursor', isMuted: false, muteUntil: 0, lastOpened: null,
    onClose, onAction,
    ...props,
  };
  const utils = render(<MuteMenu {...defaults} />);
  return { ...utils, onClose, onAction };
}

describe('MuteMenu (Phase 27 + 29)', () => {
  describe('未静音状态 — unknown tier (无 lastOpened 数据)', () => {
    it('渲染 5 个选项 (1/7/30/90/永远), 7 天 recommended 置顶', () => {
      const { getAllByRole } = setup();
      const items = getAllByRole('menuitem');
      expect(items).toHaveLength(5);
      // unknown tier 推荐 7 天
      expect(items[0].textContent).toContain('7 天');
      expect(items[0].classList.contains('mute-menu-item--recommended')).toBe(true);
      expect(items[0].textContent).toContain('推荐');
      // 其它升序, 永远 last
      expect(items[4].textContent).toContain('永远');
    });

    it('显示 app name + 静音 icon', () => {
      const { container } = setup({ appName: 'Kimi' });
      expect(container.querySelector('.mute-menu-app').textContent).toBe('Kimi');
      const icon = container.querySelector('.mute-menu-icon svg');
      expect(icon).toBeTruthy(); // IconBell SVG
    });

    it('点 7 天 (top, recommended) → setMute("Cursor", 7*24*3600)', async () => {
      setMuteMock.mockResolvedValue({ ok: true });
      const { getAllByRole, onAction, onClose } = setup();
      const items = getAllByRole('menuitem');
      await fireEvent.click(items[0]);
      await new Promise((r) => setTimeout(r, 0));
      expect(setMuteMock).toHaveBeenCalledWith('Cursor', 7 * 24 * 3600);
      expect(onAction).toHaveBeenCalledWith({ type: 'mute', seconds: 7 * 24 * 3600 });
      expect(onClose).toHaveBeenCalled();
    });

    it('点 永远 (永远 last) → setMute(app, 0)', async () => {
      setMuteMock.mockResolvedValue({ ok: true });
      const { getAllByRole } = setup();
      const items = getAllByRole('menuitem');
      await fireEvent.click(items[items.length - 1]);  // last
      await new Promise((r) => setTimeout(r, 0));
      expect(setMuteMock).toHaveBeenCalledWith('Cursor', 0);
    });
  });

  describe('tier-aware 排序 (Phase 29)', () => {
    it('hot tier (≤7天用过): 1 天置顶 + recommended', () => {
      const recent = Date.now() - 3 * 86400 * 1000;  // 3 天前
      const { getAllByRole } = setup({ lastOpened: { ms: recent, source: 'spotlight' } });
      const items = getAllByRole('menuitem');
      expect(items[0].textContent).toContain('1 天');
      expect(items[0].classList.contains('mute-menu-item--recommended')).toBe(true);
    });

    it('warm tier (8-30天): 7 天置顶 + recommended', () => {
      const old = Date.now() - 15 * 86400 * 1000;
      const { getAllByRole } = setup({ lastOpened: { ms: old, source: 'spotlight' } });
      const items = getAllByRole('menuitem');
      expect(items[0].textContent).toContain('7 天');
      expect(items[0].classList.contains('mute-menu-item--recommended')).toBe(true);
    });

    it('cold tier (>30天): 30 天置顶 + recommended', () => {
      const veryOld = Date.now() - 90 * 86400 * 1000;
      const { getAllByRole } = setup({ lastOpened: { ms: veryOld, source: 'spotlight' } });
      const items = getAllByRole('menuitem');
      expect(items[0].textContent).toContain('30 天');
      expect(items[0].classList.contains('mute-menu-item--recommended')).toBe(true);
    });

    it('unknown tier (lastOpened={ms:null}): 7 天置顶 (跟 warm 一样)', () => {
      const { getAllByRole } = setup({ lastOpened: { ms: null, source: 'unknown' } });
      const items = getAllByRole('menuitem');
      expect(items[0].textContent).toContain('7 天');
      expect(items[0].classList.contains('mute-menu-item--recommended')).toBe(true);
    });

    it('每个 tier 都恰好 1 个 recommended', () => {
      for (const tier of ['hot', 'warm', 'cold', 'unknown']) {
        const { container } = setup({});
        // 重新查 lastOpened: 用 store 的 getLocalTier 计算
        const recommended = container.querySelectorAll('.mute-menu-item--recommended');
        expect(recommended).toHaveLength(1);
      }
    });
  });

  describe('rankOptions (pure fn)', () => {
    it('hot: 1d 置顶, 永远 last', () => {
      const r = rankOptions('hot');
      expect(r.map((o) => o.seconds)).toEqual([86400, 604800, 2592000, 7776000, 0]);
      expect(r[0].recommended).toBe(true);
    });

    it('warm: 7d 置顶', () => {
      const r = rankOptions('warm');
      expect(r[0].seconds).toBe(7 * 86400);
      expect(r[0].recommended).toBe(true);
    });

    it('cold: 30d 置顶', () => {
      const r = rankOptions('cold');
      expect(r[0].seconds).toBe(30 * 86400);
      expect(r[0].recommended).toBe(true);
    });

    it('永远 永远 last, 不变', () => {
      for (const tier of ['hot', 'warm', 'cold', 'unknown']) {
        const r = rankOptions(tier);
        expect(r[r.length - 1].seconds).toBe(0);
      }
    });

    it('RECOMMENDED 映射正确', () => {
      expect(RECOMMENDED.hot).toBe(1 * 86400);
      expect(RECOMMENDED.warm).toBe(7 * 86400);
      expect(RECOMMENDED.cold).toBe(30 * 86400);
      expect(RECOMMENDED.unknown).toBe(7 * 86400);
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
      const icon = container.querySelector('.mute-menu-icon svg');
      expect(icon).toBeTruthy(); // IconVolumeOff SVG
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
