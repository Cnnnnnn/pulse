/**
 * tests/platform/windows-app-icon.test.js
 *
 * P4: platform/windows.js getAppIcon 委托给 src/main/app-icon-windows.js
 * (跟 macos.js 委托给 src/main/app-icon.js 对称).
 *
 * vi.mock 不拦截 require (vitest 已知限制), 走 require.cache 注入 stub module
 * 跟 tests/preload-platform.test.js / tests/main/app-icon-windows.test.js 同套路.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetAppIcon = vi.fn();

const stubModulePath = require.resolve('../../src/main/app-icon-windows.js');
const stubExports = {
  getAppIcon: mockGetAppIcon,
  _clearIconCache: vi.fn(),
};

const windowsModulePath = require.resolve('../../src/platform/windows.js');

let getAppIcon;

describe('platform/windows — getAppIcon (P4)', () => {
  beforeEach(() => {
    // 注入 stub 替代 src/main/app-icon-windows.js
    require.cache[stubModulePath] = {
      id: stubModulePath,
      filename: stubModulePath,
      loaded: true,
      exports: stubExports,
    };
    // 清掉 platform/windows.js cache 让它重新 require 拿 stub
    delete require.cache[windowsModulePath];
    const mod = require(windowsModulePath);
    getAppIcon = mod.getAppIcon;

    mockGetAppIcon.mockReset();
  });

  afterEach(() => {
    delete require.cache[stubModulePath];
    delete require.cache[windowsModulePath];
    vi.restoreAllMocks();
  });

  it('委托给 app-icon-windows.getAppIcon, 透传 path', async () => {
    mockGetAppIcon.mockResolvedValueOnce('data:image/png;base64,X');

    const r = await getAppIcon('C:\\Program Files\\Cursor\\Cursor.exe');

    expect(mockGetAppIcon).toHaveBeenCalledWith('C:\\Program Files\\Cursor\\Cursor.exe');
    expect(r).toBe('data:image/png;base64,X');
  });

  it('app-icon-windows 返 null → 透传 null (不抛)', async () => {
    mockGetAppIcon.mockResolvedValueOnce(null);

    const r = await getAppIcon('C:\\Missing.exe');

    expect(r).toBeNull();
  });

  it('空 path → null (早返, 不调下层)', async () => {
    const r = await getAppIcon('');

    expect(r).toBeNull();
    expect(mockGetAppIcon).not.toHaveBeenCalled();
  });
});
