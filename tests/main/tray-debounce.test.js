/**
 * tests/main/tray-debounce.test.js
 *
 * v2.22 Task E1: 测 scheduleRebuild 的 debounce (200ms) + Windows throttle (1s).
 *
 * scheduleRebuild 是 createTrayManager 内部闭包 (tray.js:388-401),通过 setter
 * (setResults / setAiUsage / setWorldcup / setMetals) 触发. 本测试不导出
 * 内部 closure (避免改 production code),而是走 createTrayManager().install()
 * 真实路径, 用 vi.mock-style require.cache 注入 stub electron, spy Menu.
 * buildFromTemplate 调用次数, 用 vi.useFakeTimers() 控制时间.
 *
 * 沿用 tests/main/tray.test.js (P4) 的 require.cache + vi.resetModules 模式
 * (见 tray.test.js 注释: vite module graph 下静态 vi.mock('electron') 对
 * CJS require 路径不稳, 走 require.cache stub + resetModules 才是 work 的).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCreateFromPath = vi.fn();
const mockCreateFromBuffer = vi.fn();
const mockShouldUseDarkColors = vi.fn(() => false);
const mockOnThemeUpdated = vi.fn();
const mockTrayInstance = {
  setToolTip: vi.fn(),
  setImage: vi.fn(),
  on: vi.fn(),
  setContextMenu: vi.fn(),
  destroy: vi.fn(),
};
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
const trayModulePath = require.resolve('../../src/main/tray.ts');

let createTrayManager;

function setPlatform(p) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true, writable: true });
}

function freshManager() {
  // createTrayManager 的 opts 字段在 scheduleRebuild / rebuildMenu 路径
  // 全部走 default 即可, 但我们传 stub 显式让意图清楚.
  return createTrayManager({
    getConfig: () => ({ apps: [] }),
    getConfigPath: () => '',
    onCheck: () => {},
    onOpenPanel: () => {},
    onOpenConfig: () => {},
    onQuit: () => {},
    onFocusUpdate: () => {},
    onFocusWorldcup: () => {},
  });
}

describe('tray scheduleRebuild (Task E1) — debounce + Windows throttle', () => {
  let origPlatform;
  let mgr;

  beforeEach(() => {
    vi.resetModules();
    require.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: electronStub,
    };
    const mod = require(trayModulePath);
    createTrayManager = mod.createTrayManager;

    origPlatform = process.platform;
    mockCreateFromPath.mockReset();
    mockCreateFromBuffer.mockReset();
    mockShouldUseDarkColors.mockImplementation(() => false);
    mockOnThemeUpdated.mockReset();
    mockTray.mockClear();
    mockBuildFromTemplate.mockClear();
    mockTrayInstance.setImage.mockClear();
    mockTrayInstance.on.mockClear();
    mockTrayInstance.setContextMenu.mockClear();

    // loadTrayIcon happy path: 任意 platform 都返 non-empty image, 不走 fallback
    mockCreateFromPath.mockReturnValue({
      isEmpty: () => false,
      setTemplateImage: vi.fn(),
    });
  });

  afterEach(() => {
    if (mgr) {
      try { mgr.dispose(); } catch { /* noop */ }
      mgr = null;
    }
    delete require.cache[electronPath];
    delete require.cache[trayModulePath];
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true, writable: true });
    vi.useRealTimers();
  });

  it('macOS: 3 个连续 setResults 在 200ms 内 coalesce 成 1 次 rebuild', () => {
    setPlatform('darwin');
    mgr = freshManager();
    mgr.install();
    // install() 内调一次 rebuildMenu() (同步, 不经 scheduleRebuild) — 清掉计数, 测 setter 行为
    mockBuildFromTemplate.mockClear();

    vi.useFakeTimers();
    vi.setSystemTime(new Date(0)); // 锚定 fake clock=0, scheduleRebuild elapsed 可预测
    mgr.setResults([{ name: 'A', has_update: true, installed_version: '1.0', latest_version: '2.0' }]);
    mgr.setResults([{ name: 'A', has_update: false, status: 'up_to_date' }]);
    mgr.setResults([{ name: 'A', has_update: false }]);

    // 还没到 200ms, debounce timer 未 fire
    expect(mockBuildFromTemplate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(199);
    expect(mockBuildFromTemplate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2); // 201ms 触发
    expect(mockBuildFromTemplate).toHaveBeenCalledTimes(1);
  });

  it('macOS: 4 个不同 setter 同帧调用 → 只 1 次 rebuild (debounce coalesce)', () => {
    setPlatform('darwin');
    mgr = freshManager();
    mgr.install();
    mockBuildFromTemplate.mockClear();

    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    mgr.setResults([{ name: 'A', has_update: false }]);
    mgr.setAiUsage({ minimax: { status: 'ok', percent: 50, remainLabel: '2h' }, glm: { status: 'unconfigured' } });
    mgr.setWorldcup({ todayMatches: [], upcoming: [] });
    mgr.setMetals({ quotes: {}, holdings: {}, fetchedAt: null });

    vi.advanceTimersByTime(250);
    expect(mockBuildFromTemplate).toHaveBeenCalledTimes(1);
  });

  it('macOS: debounce 触发后, 再次 setResults 重新启动 200ms debounce (无 throttle)', () => {
    setPlatform('darwin');
    mgr = freshManager();
    mgr.install();
    mockBuildFromTemplate.mockClear();

    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    mgr.setResults([{ name: 'A', has_update: false }]);
    vi.advanceTimersByTime(200);
    expect(mockBuildFromTemplate).toHaveBeenCalledTimes(1);

    // 250ms 后第二次 setResults, 重新 debounce
    vi.advanceTimersByTime(50); // 累计 250ms
    mgr.setResults([{ name: 'B', has_update: false }]);
    vi.advanceTimersByTime(199);
    expect(mockBuildFromTemplate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2); // 累计 250+200 = 450ms, 第二次 rebuild
    expect(mockBuildFromTemplate).toHaveBeenCalledTimes(2);
  });

  it('Windows: 1s throttle — 第二次 setResults 在 1s 窗口内被推迟到 1s 后才 fire', () => {
    setPlatform('win32');
    mgr = freshManager();
    mgr.install();
    mockBuildFromTemplate.mockClear();

    // 锚定 fake clock=0, lastRebuildAt=0 → 第一次 fire at t=1000.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    mgr.setResults([{ name: 'A', has_update: true }]);
    // scheduleRebuild: elapsed=0, minInterval=1000 → delay=max(200, 1000-0)=1000
    vi.advanceTimersByTime(1000);
    expect(mockBuildFromTemplate).toHaveBeenCalledTimes(1);
    // fake clock=1000, lastRebuildAt=1000, rebuildTimer=null

    // 第二次 setResults: 200ms 后, elapsed=200, delay=max(200, 1000-200)=800
    // → fire at t=2000. 所以 advance 200 后调 setResults, 再 advance 799 仍未 fire,
    // 再 advance 1 → fire.
    vi.advanceTimersByTime(200);
    mgr.setResults([{ name: 'A', has_update: false }]);
    vi.advanceTimersByTime(799);
    expect(mockBuildFromTemplate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(mockBuildFromTemplate).toHaveBeenCalledTimes(2);
  });

  it('Windows: 1s 内连续 5 个 setter → 5 个 coalesce 成 1 个待 fire timer, 1s 后 fire', () => {
    setPlatform('win32');
    mgr = freshManager();
    mgr.install();
    mockBuildFromTemplate.mockClear();

    // 锚定 fake clock=0.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    mgr.setResults([{ name: 'A', has_update: true }]);
    vi.advanceTimersByTime(1000);
    expect(mockBuildFromTemplate).toHaveBeenCalledTimes(1);
    // fake clock=1000, lastRebuildAt=1000, rebuildTimer=null

    // 5 个 setter 连发 (fake clock=1000):
    // 第 1 个: elapsed=0, delay=max(200, 1000-0)=1000 → timer 设到 2000
    // 第 2-5 个: rebuildTimer 已存在, return 忽略
    mgr.setResults([{ name: 'A', has_update: false }]);
    mgr.setAiUsage({ minimax: { status: 'ok', percent: 30, remainLabel: '5h' }, glm: { status: 'unconfigured' } });
    mgr.setWorldcup({ todayMatches: [], upcoming: [] });
    mgr.setMetals({ quotes: {}, holdings: {}, fetchedAt: null });
    expect(vi.getTimerCount()).toBe(1); // 5 个 setter 合并为 1 个待 fire timer
    vi.advanceTimersByTime(999);
    expect(mockBuildFromTemplate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(mockBuildFromTemplate).toHaveBeenCalledTimes(2);
  });
});
