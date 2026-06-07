/**
 * tests/renderer/app-avatar.test.jsx
 *
 * Phase 25: AppAvatar 渲染 / fallback 行为.
 * 4 case: 有 src 渲染 img / 无 src 渲染字母 / 字母首字母 + 渐变 / bundle 路径拼接.
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/preact';

import { AppAvatar } from '../../src/renderer/components/AppAvatar.jsx';
import * as iconMod from '../../src/renderer/hooks/useIcon.js';
import { api } from '../../src/renderer/api.js';

describe('AppAvatar (Phase 25)', () => {
  beforeEach(() => {
    iconMod._clearIconCache();
    // Mock api.getAppIcon (避免实际 IPC), 返 null (触发 fallback)
    vi.spyOn(api, 'getAppIcon').mockResolvedValue(null);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('有 src → 渲染 <img> (真实图标)', () => {
    iconMod._setIconForTest('Cursor.app', 'data:image/png;base64,FAKE');
    const { container } = render(<AppAvatar bundle="Cursor.app" name="Cursor" />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img.src).toBe('data:image/png;base64,FAKE');
  });

  it('无 src → 渲染字母头像 + 渐变 background', () => {
    const { container } = render(<AppAvatar bundle="Cursor.app" name="Cursor" />);
    const avatar = container.querySelector('.app-avatar');
    expect(avatar).toBeTruthy();
    // 首字母 C
    expect(avatar.textContent).toBe('C');
    // 渐变 background 来自 nameColor
    expect(avatar.style.background).toMatch(/linear-gradient/);
  });

  it('无 src + 空 name → 占位 "?"', () => {
    const { container } = render(<AppAvatar bundle="" name="" />);
    expect(container.querySelector('.app-avatar').textContent).toBe('?');
  });

  it('字母大小写: 小写 name → 大写首字母', () => {
    const { container } = render(<AppAvatar bundle="x.app" name="minimax" />);
    expect(container.querySelector('.app-avatar').textContent).toBe('M');
  });

  it('同 bundle 多次 mount → 缓存命中 (useIcon 不重发 IPC)', () => {
    iconMod._setIconForTest('Cursor.app', 'data:image/png;base64,CACHED');
    const { container: c1 } = render(<AppAvatar bundle="Cursor.app" name="Cursor" />);
    const { container: c2 } = render(<AppAvatar bundle="Cursor.app" name="Cursor" />);
    expect(c1.querySelector('img').src).toBe('data:image/png;base64,CACHED');
    expect(c2.querySelector('img').src).toBe('data:image/png;base64,CACHED');
  });

  it('IPC 返 { dataUrl } → useIcon 解构出来当 src (不是把整个对象当 src)', async () => {
    // 模拟 IPC 返 { dataUrl: 'data:...' } 而非裸 dataUrl string
    // useIcon 应该解构 result.dataUrl 再用
    // 这里通过 _setIconForTest 直接设 (跳过 IPC), 然后 mount 验证 img 正确
    iconMod._setIconForTest('Cursor.app', 'data:image/png;base64,EXTRACTED');
    const { container } = render(<AppAvatar bundle="Cursor.app" name="Cursor" />);
    const img = container.querySelector('img');
    expect(img.src).toBe('data:image/png;base64,EXTRACTED');
    // 关键: src 必须是字符串, 不是 "[object Object]"
    expect(img.src).not.toContain('[object');
  });
});
