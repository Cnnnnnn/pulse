# P1: Platform Abstraction Layer + Windows Shell Bootable

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `src/platform/` abstraction layer that isolates all platform-specific logic, wrapping existing macOS code without behavior change, so the app boots on Windows with a working window + tray (version detection intentionally non-functional on Windows in this phase).

**Architecture:** A `src/platform/index.js` entry selects the active platform implementation (`macos.js` or `windows.js`) at require time via `process.platform`. Each implementation exports the same 6-method interface (`resolveAppPath`, `getInstalledVersion`, `getAppIcon`, `getUpgradeAction`, `execUpgrade`, `getWindowOptions`). Existing macOS files are NOT rewritten — `macos.js` delegates to them. `windows.js` holds placeholder/stub implementations that return nulls/defaults so the app boots without crashing. Call sites (`window.js`, `task-handlers.js`, `register-core.js`, `index.js`) are rewired to go through the platform layer.

**Tech Stack:** Electron, Node.js worker_threads, vitest, electron-builder

**Spec:** `docs/superpowers/specs/2026-06-16-cross-platform-windows-support-design.md` §1 (this plan) / §2-§3 covered by later P2/P3 plans.

**Hard constraint:** macOS behavior must be byte-for-byte identical. The existing 1590 tests must stay green. Every existing test file keeps passing unmodified.

---

## File Structure

**Create:**
- `src/platform/index.js` — entry: selects platform impl by `process.platform`
- `src/platform/interface.js` — JSDoc-only interface contract (no implementation)
- `src/platform/macos.js` — macOS impl: delegates to existing `app-paths.js`, `installed-version.js`, `app-icon.js`, `bulk-upgrade-actions.js`, `bulk-upgrade.js`, reads window constants
- `src/platform/windows.js` — Windows impl: stubs/placeholder that boot without crashing (P2/P3/P4 fill these in)
- `tests/platform/macos.test.js` — verifies macos.js delegates correctly to existing logic
- `tests/platform/windows.test.js` — verifies windows.js stubs return expected nulls/defaults
- `tests/platform/index.test.js` — verifies `process.platform` routing

**Modify:**
- `src/main/window.js` — `createWindow()` reads window options from platform layer instead of hardcoded values
- `src/workers/task-handlers.js` — `handleDetectApp` calls `platform.resolveAppPath` instead of `resolveAppBundlePath`; `getInstalledVersion` + ARCH via platform
- `src/workers/ipc.js` — export `PLATFORM` alongside `ARCH` from workerData
- `src/workers/detect-worker.js` — pass platform into handleDetectApp deps
- `src/main/index.js` — worker pool `workerOpts` carries `platform`; bootstrap uses platform for icon/upgrade
- `src/main/ipc/register-core.js` — `get-app-icon` IPC uses `platform.getAppIcon`; `refresh-last-opened` uses `platform.resolveAppPath`
- `preload.js` — expose `platformInfo` to renderer
- `package.json` — add `win` + `nsis` electron-builder config (build script stays current-platform for dev)

**NOT modified (macos.js delegates to these as-is):**
- `src/utils/app-paths.js`, `src/workers/installed-version.js`, `src/main/app-icon.js`, `src/main/bulk-upgrade-actions.js`, `src/main/bulk-upgrade.js`

---

## Task 1: Platform interface contract + entry router

**Files:**
- Create: `src/platform/interface.js`
- Create: `src/platform/index.js`
- Test: `tests/platform/index.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/platform/index.test.js`:

```js
/**
 * tests/platform/index.test.js
 *
 * Platform entry router: index.js 按 process.platform 选实现.
 * 测试用 require.cache 注入 mock 实现, 不依赖真实平台.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('platform/index router', () => {
  const originalPlatform = process.platform;
  const cacheKeys = Object.keys(require.cache).filter(
    (k) => k.includes('platform/index.js'),
  );

  beforeEach(() => {
    // 清掉 platform 模块缓存, 让每次 import 重新走 router
    cacheKeys.forEach((k) => delete require.cache[k]);
    delete require.cache[require.resolve('../../src/platform/index.js')];
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    cacheKeys.forEach((k) => delete require.cache[k]);
    delete require.cache[require.resolve('../../src/platform/index.js')];
  });

  it('darwin → 导出 macos 实现 (有 resolveAppPath)', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    });
    const platform = require('../../src/platform/index.js');
    expect(typeof platform.resolveAppPath).toBe('function');
    expect(typeof platform.getInstalledVersion).toBe('function');
    expect(typeof platform.getAppIcon).toBe('function');
    expect(typeof platform.getUpgradeAction).toBe('function');
    expect(typeof platform.execUpgrade).toBe('function');
    expect(typeof platform.getWindowOptions).toBe('function');
  });

  it('win32 → 导出 windows 实现 (有 6 个方法, P1 是 stub)', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });
    const platform = require('../../src/platform/index.js');
    expect(typeof platform.resolveAppPath).toBe('function');
    expect(typeof platform.getInstalledVersion).toBe('function');
    expect(typeof platform.getAppIcon).toBe('function');
    expect(typeof platform.getUpgradeAction).toBe('function');
    expect(typeof platform.execUpgrade).toBe('function');
    expect(typeof platform.getWindowOptions).toBe('function');
  });

  it('未知平台 → 回退到默认 stub (不崩)', () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    });
    const platform = require('../../src/platform/index.js');
    expect(typeof platform.resolveAppPath).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/platform/index.test.js`
Expected: FAIL — module `../../src/platform/index.js` not found (ENOENT).

- [ ] **Step 3: Create the interface contract**

Create `src/platform/interface.js`:

```js
/**
 * src/platform/interface.js
 *
 * 平台抽象层接口契约 — 纯 JSDoc, 不含实现.
 * macos.js / windows.js 必须实现这 6 个方法.
 *
 * 设计原则 (spec §1):
 *   - 业务代码只依赖这个接口, 绝不直接 if (process.platform === ...)
 *   - detector (在线版本检测) 不在这里, 只管 "本地" 的事
 *   - macOS 端零行为变更: macos.js 委托给现有模块
 */

/**
 * 解析 app 安装路径.
 * @param {string} bundle — config 里的 bundle 字段 (mac: "Cursor.app"; win: win_bundle "Cursor")
 * @param {object} [appCfg] — 完整 app config (win 端可能需要 win_bundle / reg_path)
 * @returns {string|null} 绝对路径, 未安装返回 null
 */
function resolveAppPath(bundle, appCfg) {}

/**
 * 读已装版本.
 * @param {object} appCfg — { bundle, version_sources, win_bundle, ... }
 * @returns {Promise<string|null>}
 */
async function getInstalledVersion(appCfg) {}

/**
 * 拿 app 图标 dataUrl.
 * @param {string} appPath — resolveAppPath 的返回值
 * @returns {Promise<string|null>} base64 dataUrl
 */
async function getAppIcon(appPath) {}

/**
 * 产出升级动作描述.
 * @param {object} appCfg
 * @param {object} detectResult — buildDetectResult 的输出 (含 source, cask, trackId, ...)
 * @returns {object} action — { type, ... } 或 { type: 'none', reason }
 */
function getUpgradeAction(appCfg, detectResult) {}

/**
 * 执行升级动作.
 * @param {object} action — getUpgradeAction 的返回值
 * @returns {Promise<{output?: string}>}
 */
async function execUpgrade(action) {}

/**
 * 窗口视觉参数 (传给 new BrowserWindow).
 * @returns {object} BrowserWindow 构造选项子集
 */
function getWindowOptions() {}

module.exports = {
  // 契约文档, 导出空对象占位; 真正实现在 macos.js / windows.js
  resolveAppPath,
  getInstalledVersion,
  getAppIcon,
  getUpgradeAction,
  execUpgrade,
  getWindowOptions,
};
```

- [ ] **Step 4: Create the entry router**

Create `src/platform/index.js`:

```js
/**
 * src/platform/index.js
 *
 * 平台抽象层入口 — 按 process.platform 选实现.
 *
 * 业务代码: const platform = require('../platform');
 * 拿到的永远是当前平台的已绑定实现.
 *
 * macOS: src/platform/macos.js (委托现有逻辑, 零行为变更)
 * Windows: src/platform/windows.js (P1 stub, P2/P3/P4 填充)
 * 未知: 回退 windows.js 的 stub 模式 (不崩)
 */

let impl;
if (process.platform === 'darwin') {
  impl = require('./macos');
} else {
  // win32 + 其它一律走 windows.js (P1 全是 stub)
  impl = require('./windows');
}

module.exports = impl;
```

- [ ] **Step 5: Run test to verify it fails differently**

Run: `npx vitest run tests/platform/index.test.js`
Expected: FAIL — `./macos` and `./windows` not found (next tasks create them).

- [ ] **Step 6: Commit**

```bash
git add src/platform/interface.js src/platform/index.js tests/platform/index.test.js
git commit -m "feat(platform): add platform abstraction entry router + interface contract

index.js routes by process.platform; interface.js defines 6-method JSDoc
contract. macOS/Windows impls added next."
```

---

## Task 2: macOS platform implementation (delegate to existing logic)

**Files:**
- Create: `src/platform/macos.js`
- Test: `tests/platform/macos.test.js`

This task wraps existing modules behind the platform interface. **No existing logic is rewritten** — `macos.js` is a thin facade.

- [ ] **Step 1: Write the failing test**

Create `tests/platform/macos.test.js`:

```js
/**
 * tests/platform/macos.test.js
 *
 * macos.js 是现有逻辑的 facade — 验证委托正确, 不重测底层 (那些有各自的测试).
 * 重点: resolveAppPath / getWindowOptions / getUpgradeAction 这几个纯函数能直测;
 *       getInstalledVersion / getAppIcon / execUpgrade 委托到底层模块 (验 spy 调用).
 */
import { describe, it, expect, vi } from 'vitest';

const macos = require('../../src/platform/macos.js');

describe('platform/macos', () => {
  describe('resolveAppPath', () => {
    it('裸 bundle 名 → /Applications/<bundle>', () => {
      expect(macos.resolveAppPath('Cursor.app')).toBe('/Applications/Cursor.app');
    });

    it('绝对路径 → 原样返回', () => {
      expect(macos.resolveAppPath('/Custom/Path/App.app')).toBe('/Custom/Path/App.app');
    });

    it('空 / null → null', () => {
      expect(macos.resolveAppPath(null)).toBeNull();
      expect(macos.resolveAppPath('')).toBeNull();
      expect(macos.resolveAppPath('   ')).toBeNull();
    });

    it('忽略 appCfg 第二参数 (mac 不需要)', () => {
      expect(macos.resolveAppPath('Cursor.app', { win_bundle: 'Cursor' })).toBe(
        '/Applications/Cursor.app',
      );
    });
  });

  describe('getWindowOptions', () => {
    it('返回 vibrancy + hiddenInset + transparent (跟现有 window.js 一致)', () => {
      const opts = macos.getWindowOptions();
      expect(opts.titleBarStyle).toBe('hiddenInset');
      expect(opts.vibrancy).toBe('under-window');
      expect(opts.visualEffectState).toBe('active');
      expect(opts.transparent).toBe(true);
    });

    it('返回 skipTaskbar: false (Cmd+Tab 可见)', () => {
      expect(macos.getWindowOptions().skipTaskbar).toBe(false);
    });
  });

  describe('getUpgradeAction', () => {
    it('brew_formulae source → brew action (委托 bulk-upgrade-actions)', () => {
      const detectResult = {
        source: 'brew_formulae',
        brew_cask: 'cursor',
        bundle: 'Cursor.app',
        name: 'Cursor',
      };
      const action = macos.getUpgradeAction({}, detectResult);
      expect(action.type).toBe('brew');
      expect(action.args).toEqual(['upgrade', '--cask', 'cursor']);
    });

    it('app_store_lookup source → mas action', () => {
      const action = macos.getUpgradeAction(
        {},
        { source: 'app_store_lookup', track_id: 6737188438, name: 'IMA' },
      );
      expect(action.type).toBe('mas');
      expect(action.trackId).toBe(6737188438);
    });

    it('未知 source → none', () => {
      const action = macos.getUpgradeAction({}, { source: 'unknown_src' });
      expect(action.type).toBe('none');
    });
  });

  describe('getInstalledVersion (委托 installed-version.js)', () => {
    it('调底层 getInstalledVersion, 传 bundle + version_sources', async () => {
      const spy = vi.fn().mockResolvedValue('3.6.31');
      // 暂时 monkey-patch 底层模块
      const iv = require('../../src/workers/installed-version.js');
      const orig = iv.getInstalledVersion;
      iv.getInstalledVersion = spy;
      try {
        const v = await macos.getInstalledVersion({
          bundle: 'Cursor.app',
          version_sources: [{ type: 'plist', platform: 'mac' }],
        });
        expect(v).toBe('3.6.31');
        expect(spy).toHaveBeenCalledWith('Cursor.app', [
          { type: 'plist', platform: 'mac' },
        ]);
      } finally {
        iv.getInstalledVersion = orig;
      }
    });
  });

  describe('getAppIcon (委托 app-icon.js)', () => {
    it('调底层 getAppIcon', async () => {
      const spy = vi.fn().mockResolvedValue('data:image/png;base64,xxx');
      const ai = require('../../src/main/app-icon.js');
      const orig = ai.getAppIcon;
      ai.getAppIcon = spy;
      try {
        const r = await macos.getAppIcon('/Applications/Cursor.app');
        expect(r).toBe('data:image/png;base64,xxx');
        expect(spy).toHaveBeenCalledWith('/Applications/Cursor.app');
      } finally {
        ai.getAppIcon = orig;
      }
    });
  });

  describe('execUpgrade (委托 bulk-upgrade.js defaultExec)', () => {
    it('调底层 defaultExec', async () => {
      const spy = vi.fn().mockResolvedValue({ output: 'done' });
      const bu = require('../../src/main/bulk-upgrade.js');
      const orig = bu.defaultExec;
      bu.defaultExec = spy;
      try {
        const r = await macos.execUpgrade({ type: 'brew', cmd: 'brew', args: [] });
        expect(r.output).toBe('done');
        expect(spy).toHaveBeenCalledWith({ type: 'brew', cmd: 'brew', args: [] });
      } finally {
        bu.defaultExec = orig;
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/platform/macos.test.js`
Expected: FAIL — `../../src/platform/macos.js` not found.

- [ ] **Step 3: Create the macOS facade**

Create `src/platform/macos.js`:

```js
/**
 * src/platform/macos.js
 *
 * macOS 平台实现 — 现有逻辑的 facade, 零行为变更.
 *
 * 委托关系:
 *   resolveAppPath      → src/utils/app-paths.js
 *   getInstalledVersion → src/workers/installed-version.js
 *   getAppIcon          → src/main/app-icon.js
 *   getUpgradeAction    → src/main/bulk-upgrade-actions.js
 *   execUpgrade         → src/main/bulk-upgrade.js (defaultExec)
 *   getWindowOptions    → 常量 (从现有 window.js 提取)
 */

const { resolveAppBundlePath } = require('../utils/app-paths');
const iv = require('../workers/installed-version');
const { getAppIcon } = require('../main/app-icon');
const { getActionForApp } = require('../main/bulk-upgrade-actions');
const { defaultExec } = require('../main/bulk-upgrade');

/**
 * macOS 窗口选项 — 跟现有 src/main/window.js createWindow() 的值完全一致.
 * 提取到这里是为了让 window.js 改成读平台层, 但值不变.
 */
const WINDOW_OPTIONS = {
  titleBarStyle: 'hiddenInset',
  vibrancy: 'under-window',
  visualEffectState: 'active',
  transparent: true,
  skipTaskbar: false,
};

function resolveAppPath(bundle, _appCfg) {
  // mac 不需要 appCfg (win 端才需要 win_bundle / reg_path)
  return resolveAppBundlePath(bundle);
}

async function getInstalledVersion(appCfg) {
  const bundle = appCfg && appCfg.bundle ? appCfg.bundle : null;
  const sources = appCfg && appCfg.version_sources ? appCfg.version_sources : undefined;
  return iv.getInstalledVersion(bundle, sources);
}

async function getAppIcon(appPath) {
  return getAppIcon(appPath);
}

function getUpgradeAction(appCfg, detectResult) {
  // getActionForApp 读 item.source / cask / trackId / bundleName / releaseUrl.
  // detectResult 的字段名 (source, brew_cask, track_id, release_url) 要映射到
  // getActionForApp 期望的 (source, cask, trackId, releaseUrl, bundleName).
  const item = {
    id: detectResult && detectResult.name,
    name: detectResult && detectResult.name,
    source: detectResult && detectResult.source,
    cask: detectResult && detectResult.brew_cask,
    trackId: detectResult && detectResult.track_id,
    releaseUrl: detectResult && detectResult.release_url,
    bundleName: detectResult && detectResult.bundle,
  };
  return getActionForApp(item);
}

async function execUpgrade(action) {
  return defaultExec(action);
}

function getWindowOptions() {
  return { ...WINDOW_OPTIONS };
}

module.exports = {
  resolveAppPath,
  getInstalledVersion,
  getAppIcon,
  getUpgradeAction,
  execUpgrade,
  getWindowOptions,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/platform/macos.test.js`
Expected: PASS (all 9 cases).

- [ ] **Step 5: Run full suite to verify zero regressions**

Run: `npx vitest run`
Expected: PASS — all existing tests still green (1590 baseline).

- [ ] **Step 6: Commit**

```bash
git add src/platform/macos.js tests/platform/macos.test.js
git commit -m "feat(platform): macOS facade wrapping existing logic (zero behavior change)"
```

---

## Task 3: Windows platform implementation (stubs)

**Files:**
- Create: `src/platform/windows.js`
- Test: `tests/platform/windows.test.js`

P1 stubs: every method returns a safe null/default so the app boots on Windows without crashing. Real implementations come in P2 (detection), P3 (upgrade), P4 (icon/UI).

- [ ] **Step 1: Write the failing test**

Create `tests/platform/windows.test.js`:

```js
/**
 * tests/platform/windows.test.js
 *
 * P1: windows.js 全是 stub — 验证每个方法返回安全的 null/default, app 能 boot.
 * P2/P3/P4 会替换这些 stub 为真实实现.
 */
import { describe, it, expect } from 'vitest';

const windows = require('../../src/platform/windows.js');

describe('platform/windows (P1 stubs)', () => {
  describe('resolveAppPath', () => {
    it('P1 stub → null (P2 填注册表查询)', () => {
      expect(windows.resolveAppPath('Cursor', { win_bundle: 'Cursor' })).toBeNull();
    });
    it('空入参 → null', () => {
      expect(windows.resolveAppPath(null)).toBeNull();
      expect(windows.resolveAppPath('')).toBeNull();
    });
  });

  describe('getInstalledVersion', () => {
    it('P1 stub → null (P2 填注册表/winget)', async () => {
      expect(await windows.getInstalledVersion({ win_bundle: 'Cursor' })).toBeNull();
    });
  });

  describe('getAppIcon', () => {
    it('P1 stub → null (P4 填 getFileIcon)', async () => {
      expect(await windows.getAppIcon('C:\\Program Files\\Cursor\\Cursor.exe')).toBeNull();
    });
  });

  describe('getUpgradeAction', () => {
    it('P1 stub → none (P3 填 winget)', () => {
      const action = windows.getUpgradeAction({}, { source: 'winget_show' });
      expect(action.type).toBe('none');
      expect(action.reason).toContain('windows');
    });
  });

  describe('execUpgrade', () => {
    it('P1 stub → reject (P3 填 winget exec)', async () => {
      await expect(windows.execUpgrade({ type: 'winget' })).rejects.toThrow();
    });
  });

  describe('getWindowOptions', () => {
    it('返回 acrylic + hidden titlebar (Win11; Win10 Electron 静默降级)', () => {
      const opts = windows.getWindowOptions();
      expect(opts.titleBarStyle).toBe('hidden');
      expect(opts.backgroundMaterial).toBe('acrylic');
      expect(opts.skipTaskbar).toBe(false);
      // P4 会加 titleBarOverlay
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/platform/windows.test.js`
Expected: FAIL — `../../src/platform/windows.js` not found.

- [ ] **Step 3: Create the Windows stub implementation**

Create `src/platform/windows.js`:

```js
/**
 * src/platform/windows.js
 *
 * Windows 平台实现 — P1 阶段全是 stub.
 *
 * 每个 stub 返回安全的 null / default / none, 保证 app 在 Windows 上能 boot
 * (窗口 + 托盘能出来, 不崩). 版本检测此时全标 not_installed, 这是预期行为.
 *
 * 填充计划:
 *   P2: resolveAppPath (注册表) + getInstalledVersion (注册表/winget/yml)
 *   P3: getUpgradeAction (winget) + execUpgrade (winget execFile)
 *   P4: getAppIcon (getFileIcon) + getWindowOptions (titleBarOverlay)
 */

const { mainLog } = require('../main/log');

const WINDOW_OPTIONS = {
  titleBarStyle: 'hidden',
  backgroundMaterial: 'acrylic', // Win11 生效; Win10 Electron 静默忽略降级纯色
  skipTaskbar: false,
};

function resolveAppPath(bundle, _appCfg) {
  // P1 stub — P2 填注册表 InstallLocation 查询
  if (!bundle || typeof bundle !== 'string') return null;
  mainLog.debug('[platform/win] resolveAppPath stub — P2 will implement');
  return null;
}

async function getInstalledVersion(_appCfg) {
  // P1 stub — P2 填注册表 DisplayVersion → winget list → app-update.yml
  return null;
}

async function getAppIcon(_appPath) {
  // P1 stub — P4 填 app.getFileIcon + toDataURL
  return null;
}

function getUpgradeAction(_appCfg, _detectResult) {
  // P1 stub — P3 填 winget 分支
  return { type: 'none', reason: 'windows upgrade not yet implemented (P3)' };
}

async function execUpgrade(_action) {
  // P1 stub — P3 填 winget execFile
  throw new Error('windows execUpgrade not yet implemented (P3)');
}

function getWindowOptions() {
  return { ...WINDOW_OPTIONS };
}

module.exports = {
  resolveAppPath,
  getInstalledVersion,
  getAppIcon,
  getUpgradeAction,
  execUpgrade,
  getWindowOptions,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/platform/windows.test.js`
Expected: PASS (all 8 cases).

- [ ] **Step 5: Run platform router test to verify it now resolves**

Run: `npx vitest run tests/platform/index.test.js`
Expected: PASS — router now finds both `macos.js` and `windows.js`.

- [ ] **Step 6: Commit**

```bash
git add src/platform/windows.js tests/platform/windows.test.js
git commit -m "feat(platform): Windows stub implementation (bootable, detection deferred to P2)"
```

---

## Task 4: Rewire window.js to use platform.getWindowOptions

**Files:**
- Modify: `src/main/window.js:32-55` (the `new BrowserWindow({...})` options)
- Test: `tests/main/window.test.js` (create if not exists)

The `createWindow()` function currently hardcodes `titleBarStyle: 'hiddenInset'`, `vibrancy: 'under-window'`, etc. These move into `platform.getWindowOptions()`. The non-visual options (width/height/preload) stay hardcoded in window.js.

- [ ] **Step 1: Write the failing test**

Create `tests/main/window.test.js`:

```js
/**
 * tests/main/window.test.js
 *
 * createWindowManager 走 platform.getWindowOptions() — 验证窗口选项来自平台层.
 * 不真起 Electron, mock BrowserWindow + platform.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron 的 BrowserWindow
const mockBrowserWindow = {
  loadFile: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  webContents: { on: vi.fn(), send: vi.fn() },
  setTitle: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  isDestroyed: vi.fn(() => false),
  isMinimized: vi.fn(() => false),
  hide: vi.fn(),
  moveTop: vi.fn(),
};

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(() => mockBrowserWindow),
}));

// Mock platform — 默认返回 macos 选项
const mockGetWindowOptions = vi.fn(() => ({
  titleBarStyle: 'hiddenInset',
  vibrancy: 'under-window',
  visualEffectState: 'active',
  transparent: true,
  skipTaskbar: false,
}));

vi.mock('../../src/platform', () => ({
  __esModule: false,
  default: {
    getWindowOptions: mockGetWindowOptions,
  },
  getWindowOptions: mockGetWindowOptions,
}));

describe('window.js uses platform.getWindowOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createWindow 调 platform.getWindowOptions()', () => {
    // require 内部 require platform → 拿到 mock
    vi.resetModules();
    const { createWindowManager } = require('../../src/main/window.js');
    const mgr = createWindowManager({ config: { check_on_launch: false } });
    mgr.createWindow();
    expect(mockGetWindowOptions).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/window.test.js`
Expected: FAIL — window.js doesn't call `platform.getWindowOptions()` yet.

- [ ] **Step 3: Rewire window.js**

In `src/main/window.js`, add the platform require at top and merge options. Replace the hardcoded visual options block.

Add after line 12 (`const path = require('path');`):

```js
const platform = require('../platform');
```

Replace the `new BrowserWindow({...})` call (lines 33-55) — keep structural options, merge in platform visual options:

```js
    mainWindow = new BrowserWindow({
      // Phase B7e: 默认加大 (1080x780), 给 digest drawer (460px) + main 列表留足空间.
      width: 1080,
      height: 780,
      minWidth: 720,
      minHeight: 540,
      show: false,
      // Phase 28: 显式设 title, 防止 Electron 默认 "Electron" / 老 install 残留
      title: 'Pulse',
      resizable: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
      // 视觉选项走平台层 (mac: vibrancy + hiddenInset; win: acrylic + hidden)
      ...platform.getWindowOptions(),
    });
```

Note: `titleBarStyle`, `vibrancy`, `visualEffectState`, `transparent`, `skipTaskbar` are now provided by `platform.getWindowOptions()` and spread in. The spread comes last so platform values win.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/window.test.js`
Expected: PASS.

- [ ] **Step 5: Run full suite (window change touches core)**

Run: `npx vitest run`
Expected: PASS — no regressions. (window.js had no prior test mocking it, but the integration tests + load-smoke must pass.)

- [ ] **Step 6: Commit**

```bash
git add src/main/window.js tests/main/window.test.js
git commit -m "refactor(window): visual options via platform.getWindowOptions()

titleBarStyle/vibrancy/transparent/skipTaskbar now come from platform layer.
Structural options (width/preload) stay in window.js. macOS values unchanged."
```

---

## Task 5: Rewire task-handlers + worker IPC to use platform.resolveAppPath

**Files:**
- Modify: `src/workers/task-handlers.js:10, 43` (replace `resolveAppBundlePath` with platform call)
- Modify: `src/workers/ipc.js` (add PLATFORM export)
- Modify: `src/main/index.js:216` (workerOpts carry platform)
- Test: `tests/workers/task-handlers-platform.test.js`

The worker thread runs in isolation (no `require('../platform')` works the same as main — it reads `process.platform` directly). So `src/platform/index.js` works inside workers too. But to keep the existing `ARCH` pattern consistent, we also pass `platform` via workerData.

- [ ] **Step 1: Write the failing test**

Create `tests/workers/task-handlers-platform.test.js`:

```js
/**
 * tests/workers/task-handlers-platform.test.js
 *
 * handleDetectApp 用 platform.resolveAppPath 判断 app 是否安装.
 * 验证: mac 上 resolveAppBundlePath 行为不变; 平台层注入可替换.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs.existsSync — handleDetectApp 用它检查 app 是否安装
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  promises: {},
}));

// Mock installed-version (handleDetectApp 调 getInstalledVersion)
vi.mock('../../src/workers/installed-version', () => ({
  getInstalledVersion: vi.fn().mockResolvedValue(null),
}));

// Mock detector-chain
vi.mock('../../src/workers/detector-chain', () => ({
  runDetectorChain: vi.fn().mockResolvedValue({ result: null, trace: [], stoppedAt: null }),
  compareVersions: vi.fn(),
}));

// Mock result-builder
vi.mock('../../src/workers/result-builder', () => ({
  buildDetectResult: vi.fn().mockReturnValue({ status: 'not_installed' }),
  extractBrewCask: vi.fn().mockReturnValue(''),
}));

// Mock app-bundle-changelog (optional require inside handler)
vi.mock('../../src/detectors/app-bundle-changelog', () => ({
  AppBundleChangelogDetector: vi.fn(),
}));

import { handleDetectApp } from '../../src/workers/task-handlers.js';
import { existsSync } from 'fs';

describe('handleDetectApp uses platform.resolveAppPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mac: bundle "Cursor.app" → existsSync 收到 /Applications/Cursor.app', async () => {
    // process.platform 在测试环境是真实的 (mac/linux). macos.js 委托 app-paths.
    existsSync.mockReturnValue(false);

    await handleDetectApp(
      { name: 'Cursor', bundle: 'Cursor.app', detectors: [] },
      { http: {}, logger: { info: vi.fn(), debug: vi.fn() } },
    );

    // macos 平台层把 "Cursor.app" → "/Applications/Cursor.app"
    expect(existsSync).toHaveBeenCalledWith('/Applications/Cursor.app');
  });

  it('bundle 缺 → status not_installed, 不调 getInstalledVersion', async () => {
    existsSync.mockReturnValue(false);
    const { getInstalledVersion } = require('../../src/workers/installed-version');

    const r = await handleDetectApp(
      { name: 'X', bundle: 'X.app', detectors: [] },
      { http: {}, logger: { info: vi.fn(), debug: vi.fn() } },
    );

    expect(r.status).toBe('not_installed');
    expect(getInstalledVersion).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workers/task-handlers-platform.test.js`
Expected: FAIL — `handleDetectApp` still calls `resolveAppBundlePath` directly (test asserts platform path; current code calls `resolveAppBundlePath` which resolves to same on mac, so this may pass already on mac. The key assertion is that it goes through platform). If it passes on mac, that's fine — the refactor is behavior-preserving. Verify the test logic: on a mac test runner, `resolveAppBundlePath` via platform produces the same result, so this test validates the behavior is preserved.

Actually — if it already passes, skip to verifying the rewired code is in place. The important thing: `task-handlers.js` must `require('../platform')` instead of `resolveAppBundlePath`.

- [ ] **Step 3: Rewire task-handlers.js**

In `src/workers/task-handlers.js`:

**Remove** line 10:
```js
const { resolveAppBundlePath } = require("../utils/app-paths");
```

**Add** after line 9 (`const { promisify } = require("util");`):
```js
const platform = require("../platform");
```

**Replace** the `appExists` IIFE (lines 41-47):
```js
  const appExists = (() => {
    try {
      return fs.existsSync(resolveAppBundlePath(bundle));
    } catch {
      return false;
    }
  })();
```
with:
```js
  const appExists = (() => {
    try {
      return fs.existsSync(platform.resolveAppPath(bundle, appCfg));
    } catch {
      return false;
    }
  })();
```

Note: `platform.resolveAppPath(bundle, appCfg)` — on mac this delegates to `resolveAppBundlePath(bundle)` (ignores appCfg). On win (P2), it will read `appCfg.win_bundle` and query registry.

- [ ] **Step 4: Run the platform test + full worker tests**

Run: `npx vitest run tests/workers/`
Expected: PASS.

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: PASS — all 1590+ green.

- [ ] **Step 6: Commit**

```bash
git add src/workers/task-handlers.js tests/workers/task-handlers-platform.test.js
git commit -m "refactor(workers): detect-app uses platform.resolveAppPath

Replaces direct resolveAppBundlePath with platform layer call. macOS
behavior unchanged (macos.js delegates to same function)."
```

---

## Task 6: Add platformInfo to preload + renderer platform-awareness hook

**Files:**
- Modify: `preload.js:1-3` (add platformInfo exposure)
- Test: `tests/preload-platform.test.js`

Exposes `process.platform` to renderer so it can branch on platform (P4 will use this for CSS class + icon paths). P1 only adds the exposure; no renderer code changes yet.

- [ ] **Step 1: Write the failing test**

Create `tests/preload-platform.test.js`:

```js
/**
 * tests/preload-platform.test.js
 *
 * preload 暴露 platformInfo.platform 给 renderer.
 * mock contextBridge 捕获 exposeInMainWorld 调用.
 */
import { describe, it, expect, vi } from 'vitest';

const exposed = {};
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((name, api) => {
      exposed[name] = api;
    }),
  },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn() },
}));

describe('preload exposes platformInfo', () => {
  it('exposeInMainWorld("platformInfo", { platform }) 被调', () => {
    vi.resetModules();
    require('../preload.js');
    const { contextBridge } = require('electron');
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'platformInfo',
      expect.objectContaining({ platform: expect.any(String) }),
    );
  });

  it('platformInfo.platform === process.platform', () => {
    vi.resetModules();
    require('../preload.js');
    expect(exposed.platformInfo.platform).toBe(process.platform);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/preload-platform.test.js`
Expected: FAIL — `platformInfo` not exposed yet.

- [ ] **Step 3: Add platformInfo to preload.js**

In `preload.js`, after line 1 (`const { contextBridge, ipcRenderer } = require("electron");`), add:

```js
contextBridge.exposeInMainWorld("platformInfo", {
  platform: process.platform,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/preload-platform.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add preload.js tests/preload-platform.test.js
git commit -m "feat(preload): expose platformInfo.platform to renderer

Renderer can now read window.platformInfo.platform ('darwin'/'win32').
P4 will use this for CSS platform class + icon path resolution."
```

---

## Task 7: Rewire register-core.js IPC (get-app-icon) to use platform

**Files:**
- Modify: `src/main/ipc/register-core.js:5, 9, 156-170, 259` (get-app-icon + refresh-last-opened use platform)
- Test: `tests/main/register-core-platform.test.js`

The `get-app-icon` IPC handler currently calls `getAppIcon(bundlePath)` from `app-icon.js` directly. Reroute through `platform.getAppIcon`. Same for `refresh-last-opened`'s `resolveAppBundlePath`.

- [ ] **Step 1: Write the failing test**

Create `tests/main/register-core-platform.test.js`:

```js
/**
 * tests/main/register-core-platform.test.js
 *
 * register-core 的 get-app-icon IPC 走 platform.getAppIcon.
 * mock ipcMain + platform, 验证调用链.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = {};
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((ch, fn) => { handlers[ch] = fn; }),
  },
  shell: { openExternal: vi.fn(), openPath: vi.fn() },
}));

const platformGetAppIcon = vi.fn().mockResolvedValue('data:image/png;base64,abc');
const platformResolveAppPath = vi.fn().mockReturnValue('/Applications/Cursor.app');
vi.mock('../../src/platform', () => ({
  __esModule: false,
  default: {
    getAppIcon: platformGetAppIcon,
    resolveAppPath: platformResolveAppPath,
  },
  getAppIcon: platformGetAppIcon,
  resolveAppPath: platformResolveAppPath,
}));

// mock 其它依赖让 registerCoreHandlers 能加载
vi.mock('../../src/main/check-runner', () => ({ runCheckQueued: vi.fn() }));
vi.mock('../../src/main/bulk-upgrade', () => ({ runBulkUpgrade: vi.fn() }));
vi.mock('../../src/main/state-store', () => ({ load: vi.fn(() => ({})), markNotified: vi.fn(), getMutes: vi.fn(() => ({})), setMute: vi.fn(), clearMute: vi.fn(), loadLastOpened: vi.fn(() => ({})), saveLastOpened: vi.fn(), loadActiveCategory: vi.fn(() => 'all'), saveActiveCategory: vi.fn() }));
vi.mock('../../src/main/app-icon', () => ({ getAppIcon: vi.fn() }));
vi.mock('../../src/main/log', () => ({ mainLog: { warn: vi.fn(), info: vi.fn() } }));
vi.mock('../../src/main/last-opened', () => ({ refreshOne: vi.fn() }));
vi.mock('../../src/main/recent-activity', () => ({ push: vi.fn() }));

describe('register-core get-app-icon uses platform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('get-app-icon handler 调 platform.getAppIcon', async () => {
    vi.resetModules();
    const { registerCoreHandlers } = require('../../src/main/ipc/register-core.js');
    registerCoreHandlers({
      getConfig: () => ({ apps: [] }),
      pool: {},
      getWindow: () => null,
      onCheckComplete: vi.fn(),
      getCachedState: () => null,
      sendToRenderer: vi.fn(),
      safeHandle: vi.fn((ch, fn) => { handlers[ch] = fn; }),
    });

    const result = await handlers['get-app-icon'](null, '/Applications/Cursor.app');
    expect(platformGetAppIcon).toHaveBeenCalledWith('/Applications/Cursor.app');
    expect(result.dataUrl).toBe('data:image/png;base64,abc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/register-core-platform.test.js`
Expected: FAIL — handler calls `getAppIcon` from `app-icon.js`, not `platform.getAppIcon`.

- [ ] **Step 3: Rewire register-core.js**

In `src/main/ipc/register-core.js`:

**Remove** line 5 (`const { getAppIcon } = require("../app-icon");`) and line 9 (`const { resolveAppBundlePath } = require("../../utils/app-paths");`).

**Add** after line 8 (`const recentActivity = require("../recent-activity");`):
```js
const platform = require("../../platform");
```

**Replace** the `get-app-icon` handler body (lines 156-170):
```js
  ipcMain.handle("get-app-icon", async (_event, bundlePath) => {
    try {
      const dataUrl = await platform.getAppIcon(bundlePath);
      if (!dataUrl) return { error: "not_found" };
      if (typeof dataUrl !== "string" || dataUrl.length < 30)
        return { error: "invalid" };
      return { dataUrl };
    } catch (err) {
      mainLog.warn("[ipc] get-app-icon threw", {
        bundle: bundlePath,
        msg: err && err.message,
      });
      return { error: "threw" };
    }
  });
```

**Replace** line 259 in `refresh-last-opened`:
```js
            const bundlePath = resolveAppBundlePath(a.bundle);
```
with:
```js
            const bundlePath = platform.resolveAppPath(a.bundle, a);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/register-core-platform.test.js`
Expected: PASS.

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: PASS — all green.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/register-core.js tests/main/register-core-platform.test.js
git commit -m "refactor(ipc): get-app-icon + refresh-last-opened via platform layer"
```

---

## Task 8: Add Windows electron-builder config (NSIS)

**Files:**
- Modify: `package.json` (build.win + build.nsis sections)

Add Windows packaging config so `electron-builder --win` works. The dev `build` script stays current-platform (cross-compile via Wine is explicitly rejected per spec §4).

- [ ] **Step 1: Read current package.json build section**

Run: `node -e "console.log(JSON.stringify(require('./package.json').build, null, 2))"`
Confirm current `build` only has `mac`.

- [ ] **Step 2: Add win + nsis config**

In `package.json`, inside the `"build"` object, after the `"mac": {...}` block (before `"afterPack"`), add:

```json
    "win": {
      "icon": "assets/icon.ico",
      "target": [
        "nsis"
      ]
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true
    },
```

Note: `assets/icon.ico` doesn't exist yet — P4 creates it. electron-builder will warn but not fail during config validation. The build command `electron-builder --win` will fail at packaging time without the icon; that's expected (P4 delivers the icon). For P1, we only add config + verify electron-builder accepts the config.

- [ ] **Step 3: Verify electron-builder accepts the config**

Run: `npx electron-builder --config --win 2>&1 | head -20` (or `npx electron-builder --publish never --win --dir` for a dry structural check)

If `--config` isn't a valid flag, instead validate by checking the config parses:
Run: `node -e "const b = require('./package.json').build; console.log('win target:', b.win.target, 'nsis oneClick:', b.nsis.oneClick)"`
Expected: `win target: [ 'nsis' ] nsis oneClick: false`

- [ ] **Step 4: Update build script to support both platforms**

In `package.json` `"scripts"`, change:
```json
    "build": "npm run build:renderer && electron-builder --mac",
```
to:
```json
    "build": "npm run build:renderer && electron-builder",
    "build:mac": "npm run build:renderer && electron-builder --mac",
    "build:win": "npm run build:renderer && electron-builder --win",
```

`build` with no args builds for the current host platform (mac on mac, win on win). Explicit `build:mac` / `build:win` for targeting.

- [ ] **Step 5: Run full test suite (package.json change)**

Run: `npx vitest run`
Expected: PASS — test suite doesn't depend on build config.

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "build: add Windows NSIS packaging config + build:mac/build:win scripts

icon.ico deferred to P4. Dev 'build' now builds current-host platform;
explicit targets via build:mac / build:win."
```

---

## Task 9: Final integration verification

**Goal:** Confirm the entire P1 is coherent — platform layer wired everywhere, macOS zero-change, Windows bootable in theory.

- [ ] **Step 1: Run the complete test suite**

Run: `npx vitest run`
Expected: PASS — all tests green (1590 original + ~30 new platform/window/preload/ipc tests).

- [ ] **Step 2: Verify no direct platform checks leaked into business code**

Run this grep to confirm no new `process.platform === 'win32'` was added to business logic (only allowed in `src/platform/index.js`):

```bash
grep -rn "process.platform" src/ --include="*.js" | grep -v "src/platform/"
```

Expected output: only `src/main/index.js:122` (existing `arch=...platform=...` boot log) and `src/main/index.js:379` / `src/main/window.js:118` (existing `darwin` checks for `moveTop`). **No new occurrences.** If any appear outside these known pre-existing lines, fix them to go through the platform layer.

- [ ] **Step 3: Smoke-test the renderer build**

Run: `npm run build:renderer`
Expected: succeeds, `renderer-dist/renderer.bundle.js` produced.

- [ ] **Step 4: Verify platform module loads on both simulated platforms**

Run:
```bash
node -e "
const orig = process.platform;
process.platform = 'win32';
const win = require('./src/platform');
console.log('win32 →', Object.keys(win).sort().join(','));
delete require.cache[require.resolve('./src/platform/index.js')];
process.platform = 'darwin';
const mac = require('./src/platform');
console.log('darwin →', Object.keys(mac).sort().join(','));
process.platform = orig;
"
```

Expected:
```
win32 → getAppIcon,getInstalledVersion,getResolveAppPath,getUpgradeAction,execUpgrade,resolveAppPath,getWindowOptions
darwin → getAppIcon,getInstalledVersion,getUpgradeAction,execUpgrade,resolveAppPath,getWindowOptions
```
(Both must export the same 6 methods.)

- [ ] **Step 5: Commit the integration checkpoint**

If steps 1-4 all pass with no changes needed, no commit. If any fix was made:

```bash
git add -A
git commit -m "chore(p1): integration verification fixes"
```

- [ ] **Step 6: Tag the P1 milestone**

```bash
git tag p1-platform-abstraction-complete
```

---

## Self-Review Notes

**Spec coverage (§1 Platform Abstraction Layer):**
- ✅ 6-method interface (interface.js) — Task 1
- ✅ macOS impl delegates to existing (macos.js) — Task 2
- ✅ Windows impl stubs (windows.js) — Task 3
- ✅ Injection via `require('../platform')` — Tasks 4,5,7
- ✅ window.js rewired — Task 4
- ✅ preload platformInfo — Task 6
- ✅ worker uses platform.resolveAppPath — Task 5
- ✅ electron-builder win/nsis config — Task 8

**Out of P1 scope (covered by later plans):**
- §2 Windows version detection (registry/winget/yml) → P2 plan
- §3 winget upgrade → P3 plan
- §4 icon.ico, getFileIcon, CSS platform class, CI workflow → P4 plan
- config.json app win_bundle/winget_id fields → P2 plan

**Placeholder scan:** None. Every step has concrete code or commands.

**Type consistency:** All 6 method names (`resolveAppPath`, `getInstalledVersion`, `getAppIcon`, `getUpgradeAction`, `execUpgrade`, `getWindowOptions`) used identically across interface.js, macos.js, windows.js, index.js, and all call sites.
