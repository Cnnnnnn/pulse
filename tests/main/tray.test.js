/**
 * tests/main/tray.test.js
 *
 * P4: tray.js Windows 端 ICO + nativeTheme 切换.
 *
 * 测试覆盖:
 *   - process.platform=win32 + light theme → iconTray.ico (走 child_process 隔离执行)
 *   - process.platform=win32 + dark  theme → iconTrayDark.ico (走 child_process 隔离执行)
 *   - process.platform=darwin → iconTemplate@2x.png (现状不变, template image)
 *   - ICO 资源 isEmpty → 走 loadFallbackIcon (1x1 灰)
 *   - install() 在 win32 上挂 nativeTheme.on('updated'), 触发时换图标
 *
 * light/dark theme test 走 child_process spawn 子进程跑 tests/main/tray-helper.cjs.
 * 为什么不用 vitest inline mock:
 *   vitest 1.x 的 CJS require 走 vite module graph, 缓存了第一次 require 的
 *   tray.js (闭包了真 nativeTheme). 后续 require.cache stub 注入对 vite 视角
 *   不生效. 独立 node 进程走 node native require, require.cache 注入 work.
 *   vi.resetModules() 也不重置 vite module graph (issue #3058).
 *
 *   darwin / install / theme listener test 走 inline mock 即可 (不走 nativeTheme.shouldUseDarkColors).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCreateFromPath = vi.fn();
const mockCreateFromBuffer = vi.fn();
const mockShouldUseDarkColors = vi.fn(() => false);
const mockOnThemeUpdated = vi.fn();
const mockTrayInstance = { setToolTip: vi.fn(), setImage: vi.fn(), on: vi.fn(), setContextMenu: vi.fn(), destroy: vi.fn() };
const mockTray = vi.fn(() => mockTrayInstance);
const mockBuildFromTemplate = vi.fn(() => ({}));

const electronStub = {
  Tray: mockTray,
  Menu: { buildFromTemplate: mockBuildFromTemplate },
  nativeImage: {
    createFromPath: mockCreateFromPath,
    createFromBuffer: mockCreateFromBuffer,
  },
  shell: { openExternal: vi.fn(), openPath: vi.fn() },
  nativeTheme: {
    shouldUseDarkColors: mockShouldUseDarkColors,
    on: mockOnThemeUpdated,
  },
};

const electronPath = require.resolve('electron');
const trayModulePath = require.resolve('../../src/main/tray.js');

let createTrayManager;
let _internal;

describe('tray Windows 端 (P4)', () => {
  let origPlatform;

  beforeEach(() => {
    // vitest fork process 内 require cache: 先 reset 所有 module,
    // 然后注入 stub electron, 再 require tray.js. 这样 tray.js 真的拿
    // 最新 stub 跟最新源码.
    vi.resetModules();
    require.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: electronStub,
    };
    const mod = require(trayModulePath);
    createTrayManager = mod.createTrayManager;
    _internal = mod._internal;

    origPlatform = process.platform;
    mockCreateFromPath.mockReset();
    mockCreateFromBuffer.mockReset();
    // mockReset() 会清掉 default impl (vi.fn(() => false) 的 () => false).
    // 重新设回, 否则 light theme test 会拿到上一次的 mockReturnValue(true).
    mockShouldUseDarkColors.mockImplementation(() => false);
    mockOnThemeUpdated.mockReset();
    mockTray.mockClear();
    mockBuildFromTemplate.mockClear();
    mockTrayInstance.setImage.mockClear();
    mockTrayInstance.on.mockClear();

    // 默认: loadTrayIcon 走 happy path, ICO 不空
    mockCreateFromPath.mockReturnValue({ isEmpty: () => false, setTemplateImage: vi.fn() });
  });

  afterEach(() => {
    delete require.cache[electronPath];
    delete require.cache[trayModulePath];
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    vi.restoreAllMocks();
  });

  function setPlatform(p) {
    // Node 18+ 把 process.platform 设为 read-only, 用 Object.defineProperty 改.
    // { value, configurable, writable } 都要设, 否则静默失败.
    Object.defineProperty(process, 'platform', { value: p, configurable: true, writable: true });
  }

  it('win32 + light theme → loadTrayIcon 用 iconTray.ico (不调 iconTemplate)', () => {
    setPlatform('win32');
    // 走 child_process 隔离执行 (见文件头注释): 独立 node 进程注入 stub
    // electron 后 require tray.js, 调 loadTrayIcon, 返 JSON 字符串.
    const { spawnSync } = require('node:child_process');
    const helperPath = require.resolve('./tray-helper.cjs');
    const res = spawnSync(process.execPath, [helperPath, 'light', 'win32'], {
      encoding: 'utf-8',
    });
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.platform).toBe('win32');
    expect(out.file).toMatch(/iconTray\.ico$/);
  });

  it('win32 + dark theme → loadTrayIcon 用 iconTrayDark.ico', () => {
    setPlatform('win32');
    const { spawnSync } = require('node:child_process');
    const helperPath = require.resolve('./tray-helper.cjs');
    const res = spawnSync(process.execPath, [helperPath, 'dark', 'win32'], {
      encoding: 'utf-8',
    });
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.file).toMatch(/iconTrayDark\.ico$/);
  });

  it('darwin → loadTrayIcon 用 iconTemplate@2x.png (现状不变, template image)', () => {
    setPlatform('darwin');

    const icon = _internal.loadTrayIcon();

    const calledPath = mockCreateFromPath.mock.calls[0][0];
    expect(calledPath).toMatch(/iconTemplate@2x\.png$/);
    expect(icon.setTemplateImage).toHaveBeenCalledWith(true);
  });

  it('win32 ICO 资源 isEmpty → 走 loadFallbackIcon (1x1 灰 buffer)', () => {
    setPlatform('win32');
    // ICO 文件找不到 / 损坏 → nativeImage.isEmpty() === true
    mockCreateFromPath.mockReturnValue({ isEmpty: () => true });
    // loadFallbackIcon 走 createFromBuffer, mock 返 valid nativeImage
    mockCreateFromBuffer.mockReturnValue({ isEmpty: () => false });

    const icon = _internal.loadTrayIcon();

    expect(mockCreateFromBuffer).toHaveBeenCalled();
    expect(icon).toBeDefined();
    expect(icon.isEmpty()).toBe(false);
  });

  it('win32 install() 挂 nativeTheme.on("updated") 监听器', () => {
    setPlatform('win32');
    mockShouldUseDarkColors.mockReturnValue(false);

    const mgr = createTrayManager({});
    mgr.install();

    expect(mockOnThemeUpdated).toHaveBeenCalledWith('updated', expect.any(Function));
  });

  it('win32 nativeTheme 触发 updated → tray.setImage(loadTrayIcon 重新选)', () => {
    setPlatform('win32');
    mockShouldUseDarkColors.mockImplementation(() => false); // 初始 light (beforeEach 已设)

    const mgr = createTrayManager({});
    mgr.install();

    // 模拟 OS 切到 dark
    mockShouldUseDarkColors.mockImplementation(() => true);
    // 取出 install 时注册的 listener
    const listener = mockOnThemeUpdated.mock.calls.find((c) => c[0] === 'updated')[1];
    listener();

    // mockCreateFromPath 第一次 install 时调 (loadTrayIcon), 第二次 listener 调
    // last call 应是 iconTrayDark.ico
    const lastCall = mockCreateFromPath.mock.calls[mockCreateFromPath.mock.calls.length - 1][0];
    expect(lastCall).toMatch(/iconTrayDark\.ico$/);
    expect(mockTrayInstance.setImage).toHaveBeenCalled();
  });

  it('darwin install() 不挂 nativeTheme 监听器', () => {
    setPlatform('darwin');

    const mgr = createTrayManager({});
    mgr.install();

    expect(mockOnThemeUpdated).not.toHaveBeenCalled();
  });
});
