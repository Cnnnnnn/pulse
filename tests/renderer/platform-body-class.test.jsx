// @vitest-environment happy-dom
/**
 * tests/renderer/platform-body-class.test.jsx
 *
 * P4: index.jsx bootstrap 阶段按 window.platformInfo.platform 给 body 加 class.
 * mac → body.platform-mac (默认, 现有 macOS 样式生效)
 * win → body.platform-win (Win10 纯色 fallback 背景)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { applyPlatformBodyClass } from '../../src/renderer/platform-body-class.js';

describe('applyPlatformBodyClass', () => {
  afterEach(() => {
    document.body.className = '';
    delete window.platformInfo;
  });

  it('platform=darwin → body.platform-mac', () => {
    window.platformInfo = { platform: 'darwin' };
    applyPlatformBodyClass();
    expect(document.body.classList.contains('platform-mac')).toBe(true);
    expect(document.body.classList.contains('platform-win')).toBe(false);
  });

  it('platform=win32 → body.platform-win', () => {
    window.platformInfo = { platform: 'win32' };
    applyPlatformBodyClass();
    expect(document.body.classList.contains('platform-win')).toBe(true);
    expect(document.body.classList.contains('platform-mac')).toBe(false);
  });

  it('platformInfo 缺失 → body.platform-mac (default darwin)', () => {
    applyPlatformBodyClass();
    expect(document.body.classList.contains('platform-mac')).toBe(true);
    expect(document.body.classList.contains('platform-win')).toBe(false);
  });

  it('重复调用 → 幂等 (不堆叠 class)', () => {
    window.platformInfo = { platform: 'win32' };
    applyPlatformBodyClass();
    applyPlatformBodyClass();
    applyPlatformBodyClass();
    expect(document.body.classList.contains('platform-win')).toBe(true);
    expect(document.body.className.split(/\s+/).filter(Boolean)).toEqual(['platform-win']);
  });

  it('切换平台 → 旧 class 移除, 新 class 加上', () => {
    window.platformInfo = { platform: 'darwin' };
    applyPlatformBodyClass();
    expect(document.body.classList.contains('platform-mac')).toBe(true);

    window.platformInfo = { platform: 'win32' };
    applyPlatformBodyClass();
    expect(document.body.classList.contains('platform-win')).toBe(true);
    expect(document.body.classList.contains('platform-mac')).toBe(false);
  });

  it('linux / 其他 → platform-mac fallback (plan 只区分 mac/win)', () => {
    window.platformInfo = { platform: 'linux' };
    applyPlatformBodyClass();
    expect(document.body.classList.contains('platform-mac')).toBe(true);
    expect(document.body.classList.contains('platform-win')).toBe(false);
  });
});
