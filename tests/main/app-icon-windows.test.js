/**
 * tests/main/app-icon-windows.test.js
 *
 * P4: Windows app-icon 实现 — 走 Electron native API.
 * macOS 走 sips (src/main/app-icon.js); Windows 走 app.getFileIcon().
 * Windows 上没有 macOS nativeImage GC race (spec §4 line 273), 直接 .toDataURL().
 *
 * electron 包有自定义 interop, vi.mock('electron') 拦不住 CJS require,
 * 跟 tests/preload-platform.test.js / tests/main/window.test.js 同样的
 * 套路: 直接 require.cache 注入 stub electron, 让被测模块拿到我们的
 * mockGetFileIcon.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

const mockGetFileIcon = vi.fn();

const electronPath = require.resolve('electron');
const electronStub = {
  app: {
    getFileIcon: mockGetFileIcon,
  },
};

const modulePath = mainArtifactPath('app-icon-windows');

let getAppIcon;
let _clearIconCache;

describe('app-icon-windows — getAppIcon', () => {
  beforeEach(() => {
    // 注入 stub electron (覆盖默认 require cache)
    require.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: electronStub,
    };
    // 清掉被测模块 cache, 让它在 beforeEach 重新 require electron (拿到 stub)
    delete require.cache[modulePath];
    const mod = require(modulePath);
    getAppIcon = mod.getAppIcon;
    _clearIconCache = mod._clearIconCache;

    _clearIconCache();
    mockGetFileIcon.mockReset();
  });

  afterEach(() => {
    delete require.cache[electronPath];
    delete require.cache[modulePath];
    vi.restoreAllMocks();
  });

  it('空路径 → null (不调 getFileIcon)', async () => {
    expect(await getAppIcon('')).toBeNull();
    expect(await getAppIcon(null)).toBeNull();
    expect(await getAppIcon(undefined)).toBeNull();
    expect(mockGetFileIcon).not.toHaveBeenCalled();
  });

  it('空 icon (isEmpty) → null', async () => {
    const emptyIcon = { isEmpty: () => true, toDataURL: () => 'data:,' };
    mockGetFileIcon.mockResolvedValueOnce(emptyIcon);

    expect(await getAppIcon('C:\\Program Files\\Cursor\\Cursor.exe')).toBeNull();
    expect(mockGetFileIcon).toHaveBeenCalledTimes(1);
  });

  it('happy path → toDataURL() 返回值 (data:image/png;base64,...)', async () => {
    const fakeDataUrl = 'data:image/png;base64,iVBORw0KGgo...';
    const icon = { isEmpty: () => false, toDataURL: () => fakeDataUrl };
    mockGetFileIcon.mockResolvedValueOnce(icon);

    const result = await getAppIcon('C:\\Program Files\\Cursor\\Cursor.exe');

    expect(mockGetFileIcon).toHaveBeenCalledWith('C:\\Program Files\\Cursor\\Cursor.exe', {
      size: 'large',
    });
    expect(result).toBe(fakeDataUrl);
  });

  it('in-flight 复用: 并发 N 次同 path → 只调 1 次 getFileIcon', async () => {
    const icon = { isEmpty: () => false, toDataURL: () => 'data:image/png;base64,X' };
    let resolveCall;
    mockGetFileIcon.mockReturnValueOnce(new Promise((r) => { resolveCall = r; }));

    const p1 = getAppIcon('C:\\X.exe');
    const p2 = getAppIcon('C:\\X.exe');
    const p3 = getAppIcon('C:\\X.exe');

    resolveCall(icon);
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(mockGetFileIcon).toHaveBeenCalledTimes(1);
    expect(r1).toBe('data:image/png;base64,X');
    expect(r2).toBe('data:image/png;base64,X');
    expect(r3).toBe('data:image/png;base64,X');
  });

  it('cache 命中: 第二次同 path → 0 getFileIcon 调用', async () => {
    const icon = { isEmpty: () => false, toDataURL: () => 'data:image/png;base64,Y' };
    mockGetFileIcon.mockResolvedValueOnce(icon);

    await getAppIcon('C:\\X.exe');
    const r2 = await getAppIcon('C:\\X.exe');

    expect(mockGetFileIcon).toHaveBeenCalledTimes(1);
    expect(r2).toBe('data:image/png;base64,Y');
  });

  it('getFileIcon reject → null (不抛)', async () => {
    mockGetFileIcon.mockRejectedValueOnce(new Error('ENOENT'));

    const r = await getAppIcon('C:\\Missing.exe');

    expect(r).toBeNull();
  });

  it('toDataURL 抛错 → null', async () => {
    const icon = {
      isEmpty: () => false,
      toDataURL: () => { throw new Error('nativeImage destroyed'); },
    };
    mockGetFileIcon.mockResolvedValueOnce(icon);

    const r = await getAppIcon('C:\\Bad.exe');

    expect(r).toBeNull();
  });
});
