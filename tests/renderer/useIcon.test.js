/**
 * tests/renderer/useIcon.test.js
 *
 * P4: useIcon.resolveAppBundlePath 加平台守卫.
 * - Windows → null (不拼 /Applications/Cursor.exe 错路径)
 * - macOS / unknown / linux → /Applications/${bundle} (默认)
 * - 空 / 非字符串 / 绝对路径 → 各自规则
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';

import { resolveAppBundlePath } from '../../src/renderer/hooks/useIcon.js';

describe('useIcon — resolveAppBundlePath (P4 平台守卫)', () => {
  let originalWindow;

  beforeEach(() => {
    originalWindow = globalThis.window;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it('无 platformInfo → /Applications/${bundle} (macOS 默认)', () => {
    delete globalThis.window;
    expect(resolveAppBundlePath('Cursor.app')).toBe('/Applications/Cursor.app');
  });

  it('macOS (platformInfo.platform === "darwin") → /Applications/${bundle}', () => {
    globalThis.window = { platformInfo: { platform: 'darwin' } };
    expect(resolveAppBundlePath('Cursor.app')).toBe('/Applications/Cursor.app');
  });

  it('Windows (platformInfo.platform === "win32") → null (平台守卫)', () => {
    globalThis.window = { platformInfo: { platform: 'win32' } };
    // 关键 assertion: 即使传 "Cursor.exe" 也返 null, 不会拼 /Applications/Cursor.exe
    expect(resolveAppBundlePath('Cursor.exe')).toBeNull();
    expect(resolveAppBundlePath('Foo.app')).toBeNull();
  });

  it('linux / 其他 → /Applications/${bundle} (fallback, plan 只 guard win)', () => {
    globalThis.window = { platformInfo: { platform: 'linux' } };
    expect(resolveAppBundlePath('Cursor.app')).toBe('/Applications/Cursor.app');
  });

  it('空字符串 / 空白 / 非字符串 → null', () => {
    delete globalThis.window;
    expect(resolveAppBundlePath('')).toBeNull();
    expect(resolveAppBundlePath('   ')).toBeNull();
    expect(resolveAppBundlePath(null)).toBeNull();
    expect(resolveAppBundlePath(undefined)).toBeNull();
    expect(resolveAppBundlePath(42)).toBeNull();
  });

  it('绝对路径 → 直接返回 (不拼 /Applications/)', () => {
    delete globalThis.window;
    expect(resolveAppBundlePath('/Applications/Foo.app')).toBe('/Applications/Foo.app');
    expect(resolveAppBundlePath('/usr/local/bin/x')).toBe('/usr/local/bin/x');
  });
});
