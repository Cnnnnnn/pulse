# Release Notes Onboarding (代号: ON) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pulse 升级到新版本后, 首次启动自动弹一个多步 modal 向导, 展示本版本的 release notes + 功能介绍; Header 加 📖 按钮可随时重看 (不写已看标记).

**Architecture:** main 端新增 `release-notes/loader.js` (纯函数读 md + slides.json) + `main/release-notes.js` (IPC handlers + state-store 字段读写); renderer 端新增 `release-notes-store.js` (signals: `open` / `entryPath` / `loading`) + `ReleaseNotesWizard` (modal) + `ReleaseNotesTrigger` (Header 按钮). 复用现有 `marked` + `dompurify` 渲染管线 (走 `renderChangelog`).

**Tech Stack:** Node.js (Electron main, CommonJS) + Preact + signals (renderer), vitest (`happy-dom` 环境 for renderer tests, `node` for main tests)

**Spec:** `docs/superpowers/specs/2026-06-23-on-release-notes-onboarding-design.md`

---

## 文件结构

| 文件 | 责任 | 操作 |
| --- | --- | --- |
| `src/release-notes/loader.js` | 纯函数: `readReleaseNotes(version)` / `readSlides(version)` 读 `.release-notes-<ver>.md` + `src/release-notes-content/<ver>/slides.json`, 缺/坏返回 `null`, log warn | Create |
| `src/main/release-notes.js` | IPC handlers: `release-notes:get-current` / `release-notes:get-version` / `release-notes:mark-seen`; 读 `app.getVersion()` 对比 state; 调 `state-store` 读写 `last_seen_release` | Create |
| `src/main/state-store.js` | 加 `getLastSeenRelease()` / `setLastSeenRelease(version, at)`; 复用现有 `saveAll` atomic write | Modify |
| `src/main/state-store-schema.js` | `PRESERVE_FIELDS` 加 `last_seen_release` (兼容性保留) | Modify |
| `src/main/index.js` | `registerReleaseNotes(api)` 接入; 启动时 (renderer ready 后) 不主动推, renderer 主动 `getCurrent` | Modify |
| `preload.js` | 暴露 `window.api.releaseNotes = { getCurrent, getVersion, markSeen }` | Modify |
| `src/renderer/release-notes-store.js` | signals: `open` (boolean), `payload` (object\|null), `entryPath` ('auto'\|'manual'), `loading` (boolean) | Create |
| `src/renderer/components/ReleaseNotesWizard.jsx` | modal 向导: 进度点 + 翻页 + 跳过/完成/ESC/遮罩 关闭; 入口分流 (auto → mark-seen; manual → 不调) | Create |
| `src/renderer/components/ReleaseNotesTrigger.jsx` | Header 📖 按钮, "NEW" 红点 = `entryPath === 'auto'` && `!manualSeen` (即 last_seen_release.version !== currentVersion) | Create |
| `src/renderer/App.jsx` | 挂 `<ReleaseNotesWizard />` 在 root | Modify |
| `src/renderer/components/AppShell.jsx` | Header 注入 `<ReleaseNotesTrigger />` | Modify |
| `src/renderer/index.jsx` | bootstrap 末尾 (render 之后) 调 `getCurrent` → 若 `!alreadySeen` → open wizard (entryPath='auto'); 也把 `alreadySeen` 推到 store 供 Trigger 决定红点 | Modify |
| `styles.css` | `.release-notes-wizard*` 样式 (modal 遮罩 + 居中卡片 + 进度点 + 按钮) | Modify |
| `src/release-notes-content/2.32.0/slides.json` | 当前版本 (2.32.0) 内容 — 用户确认 slides 后填 | Create (defer until 2.32.0 ships) |
| `tests/main/release-notes-loader.test.js` | `readReleaseNotes` / `readSlides` 6 case | Create |
| `tests/main/release-notes-state.test.js` | `getLastSeenRelease` / `setLastSeenRelease` 3 case | Create |
| `tests/main/register-core-release-notes.test.js` | IPC handlers 6+2+2 case | Create |
| `tests/renderer/ReleaseNotesWizard.test.jsx` | 组件 8 case (open/close/翻页/4 关闭路径/单页退化/focus trap/script 注入) | Create |
| `tests/renderer/ReleaseNotesTrigger.test.jsx` | 按钮 3 case (红点显隐 + 点击不调 mark-seen) | Create |
| `tests/release-notes-content/2.32.0/slides.json` | fixture 给 loader test | Create (test-only) |

---

## Task 1: state-store 新字段 + schema (TDD)

**Files:**
- Modify: `src/main/state-store.js`
- Modify: `src/main/state-store-schema.js`
- Test: `tests/main/release-notes-state.test.js`

- [ ] **Step 1: 写失败测试 — getLastSeenRelease / setLastSeenRelease 3 case**

创建 `tests/main/release-notes-state.test.js`:

```js
/**
 * tests/main/release-notes-state.test.js
 *
 * ON: state.json 新字段 last_seen_release 读写.
 * 走 stateStore 现有 API (saveAll + getCachedState), 测读写 + 老 state 兼容.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import {
  initStateStorePaths,
  loadOrRecover,
  getLastSeenRelease,
  setLastSeenRelease,
  _resetForTest,
} from '../../src/main/state-store.js';

let tmpDir;
let statePath;

beforeEach(() => {
  _resetForTest();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-rn-state-'));
  statePath = path.join(tmpDir, 'state.json');
  initStateStorePaths(statePath);
});

describe('last_seen_release', () => {
  it('returns null when state.json does not exist', async () => {
    await loadOrRecover();
    expect(getLastSeenRelease()).toBeNull();
  });

  it('returns null when state.json exists but has no last_seen_release', async () => {
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: {}, mutes: {} }));
    await loadOrRecover();
    expect(getLastSeenRelease()).toBeNull();
  });

  it('round-trips set → get + persists to disk', async () => {
    await loadOrRecover();
    setLastSeenRelease('2.32.0', 1750000000000);
    expect(getLastSeenRelease()).toEqual({ version: '2.32.0', at: 1750000000000 });

    // 重新 load (模拟重启) → 仍能读出
    _resetForTest();
    await loadOrRecover();
    expect(getLastSeenRelease()).toEqual({ version: '2.32.0', at: 1750000000000 });
  });
});
```

- [ ] **Step 2: 运行测试, 确认失败**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run tests/main/release-notes-state.test.js
```

预期: 失败 (`getLastSeenRelease` / `setLastSeenRelease` / `_resetForTest` 未导出).

- [ ] **Step 3: 实现 state-store 新字段**

修改 `src/main/state-store.js`:

1. 加 helper (在文件顶部 helper 区):

```js
/**
 * ON: 读 last_seen_release 记录 (用户最近一次看完 release notes 的版本)
 * @returns {{version: string, at: number} | null}
 */
function getLastSeenRelease() {
  const s = _state;
  if (!s || !s.last_seen_release) return null;
  const { version, at } = s.last_seen_release;
  if (typeof version !== 'string' || typeof at !== 'number') return null;
  return { version, at };
}

/**
 * ON: 写 last_seen_release 记录 (用户完成或跳过 release notes 向导时调)
 */
function setLastSeenRelease(version, at) {
  if (typeof version !== 'string' || typeof at !== 'number') {
    throw new TypeError('setLastSeenRelease: version (string) and at (number) required');
  }
  _state.last_seen_release = { version, at };
  scheduleSave();
}
```

(ponytail: `scheduleSave` 是 state-store 现有的 debounce write, 跟 `setMute` 等字段共用, 复用避免每个字段都 fsync 一次)

2. 在 module.exports 区加 `getLastSeenRelease, setLastSeenRelease`.

3. 加 `_resetForTest` (在文件底部已有其他 `_resetFor*` 旁):

```js
function _resetForTest() {
  _state = null;
  _saveTimer = null;
}
```

- [ ] **Step 4: 加 PRESERVE_FIELDS**

修改 `src/main/state-store-schema.js`, 在 `PRESERVE_FIELDS` 数组加 `'last_seen_release'`.

- [ ] **Step 5: 跑测试, 确认绿**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run tests/main/release-notes-state.test.js
```

预期: 3/3 绿.

---

## Task 2: loader 纯函数 (TDD)

**Files:**
- Create: `src/release-notes/loader.js`
- Create: `tests/release-notes-content/2.32.0/slides.json` (fixture)
- Test: `tests/main/release-notes-loader.test.js`

- [ ] **Step 1: 创建 fixture**

`tests/release-notes-content/2.32.0/slides.json`:

```json
{
  "version": "2.32.0",
  "slides": [
    {
      "id": "fixture-1",
      "title": "测试功能 1",
      "subtitle": "副标题 1",
      "body": "正文 1",
      "screenshot": null
    },
    {
      "id": "fixture-2",
      "title": "测试功能 2",
      "subtitle": "副标题 2",
      "body": "正文 2",
      "screenshot": null
    }
  ]
}
```

- [ ] **Step 2: 写失败测试 — readReleaseNotes / readSlides 6 case**

创建 `tests/main/release-notes-loader.test.js`:

```js
/**
 * tests/main/release-notes-loader.test.js
 *
 * ON: loader 纯函数测试. 用 mock fs 避免读真文件.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    default: actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

// loader 内部用 default 引用 fs, 需要 __esModule 兼容
import * as loader from '../../src/release-notes/loader.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('readReleaseNotes', () => {
  it('returns md content when file exists', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('# v2.32.0\n\n## 新增\n- foo');
    const md = loader.readReleaseNotes('2.32.0');
    expect(md).toContain('# v2.32.0');
    expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('.release-notes-2.32.0.md'));
  });

  it('returns null when file missing', () => {
    fs.existsSync.mockReturnValue(false);
    expect(loader.readReleaseNotes('9.9.9')).toBeNull();
  });

  it('returns null on read error (does not throw)', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockImplementation(() => { throw new Error('EACCES'); });
    expect(loader.readReleaseNotes('2.32.0')).toBeNull();
  });
});

describe('readSlides', () => {
  it('returns parsed slides when file exists and valid', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({
      version: '2.32.0',
      slides: [{ id: 'a', title: 'A', body: 'a-body' }],
    }));
    const result = loader.readSlides('2.32.0');
    expect(result).toEqual({
      version: '2.32.0',
      slides: [{ id: 'a', title: 'A', body: 'a-body' }],
    });
  });

  it('returns null when file missing', () => {
    fs.existsSync.mockReturnValue(false);
    expect(loader.readSlides('2.32.0')).toBeNull();
  });

  it('returns null on JSON parse error', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('{ invalid json');
    expect(loader.readSlides('2.32.0')).toBeNull();
  });

  it('returns null on schema failure (missing version)', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ slides: [] }));
    expect(loader.readSlides('2.32.0')).toBeNull();
  });

  it('returns null on schema failure (missing slides)', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ version: '2.32.0' }));
    expect(loader.readSlides('2.32.0')).toBeNull();
  });

  it('returns null when slides array is empty', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ version: '2.32.0', slides: [] }));
    expect(loader.readSlides('2.32.0')).toBeNull();
  });
});
```

- [ ] **Step 3: 运行测试, 确认失败**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run tests/main/release-notes-loader.test.js
```

预期: 失败 (loader 不存在).

- [ ] **Step 4: 实现 loader**

创建 `src/release-notes/loader.js`:

```js
/**
 * src/release-notes/loader.js
 *
 * ON: 读 release notes md + slides.json 的纯函数.
 * 任何失败 (缺文件 / parse 错 / schema 错) 都返回 null + log warn,
 * 永远不抛错 (main 端 handler 靠 null 判定优雅退化).
 *
 * 路径:
 *   .release-notes-<version>.md                   (仓库根, 跟现有惯例)
 *   src/release-notes-content/<version>/slides.json
 *
 * __testOverrides 让测试可以注入 mock path (主进程测试时, 仓库根可能不是 cwd).
 */

const fs = require('fs');
const path = require('path');
const { taggedLog } = require('../main/log.js');

const log = taggedLog('[release-notes-loader]');

let __testOverrides = null;

function __setTestOverrides(overrides) {
  __testOverrides = overrides;
}

function __resetTestOverrides() {
  __testOverrides = null;
}

function resolveRepoRoot() {
  return __testOverrides && __testOverrides.repoRoot
    ? __testOverrides.repoRoot
    : process.cwd();
}

function resolveContentRoot() {
  return __testOverrides && __testOverrides.contentRoot
    ? __testOverrides.contentRoot
    : path.join(resolveRepoRoot(), 'src', 'release-notes-content');
}

/**
 * @param {string} version semver string
 * @returns {string|null} md 内容, 或 null (缺/错)
 */
function readReleaseNotes(version) {
  if (typeof version !== 'string' || !version) return null;
  const file = path.join(resolveRepoRoot(), `.release-notes-${version}.md`);
  try {
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    log.warn(`readReleaseNotes(${version}) failed:`, err.message);
    return null;
  }
}

/**
 * @param {string} version
 * @returns {{version: string, slides: Array}|null}
 */
function readSlides(version) {
  if (typeof version !== 'string' || !version) return null;
  const file = path.join(resolveContentRoot(), version, 'slides.json');
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.version !== 'string') return null;
    if (!Array.isArray(parsed.slides)) return null;
    if (parsed.slides.length === 0) return null;
    return parsed;
  } catch (err) {
    log.warn(`readSlides(${version}) failed:`, err.message);
    return null;
  }
}

module.exports = {
  readReleaseNotes,
  readSlides,
  __setTestOverrides,
  __resetTestOverrides,
};
```

(ponytail: 把路径解析抽出来是为了让测试可以注入 mock path — 主进程测试时仓库根不是 cwd, 直接 `process.cwd()` 拿不到仓库根)

- [ ] **Step 5: 跑测试, 确认绿**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run tests/main/release-notes-loader.test.js
```

预期: 9/9 绿.

---

## Task 3: IPC handlers (TDD)

**Files:**
- Create: `src/main/release-notes.js`
- Test: `tests/main/register-core-release-notes.test.js`

- [ ] **Step 1: 写失败测试 — IPC handlers 6+2+2 case**

创建 `tests/main/register-core-release-notes.test.js`:

```js
/**
 * tests/main/register-core-release-notes.test.js
 *
 * ON: IPC handler 单测. 用 fake ipcMain 收集注册的 channel,
 * 然后用 fake state-store + fake loader 注入, 触发 handler, 验返回.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock 依赖
const mockStateStore = {
  getLastSeenRelease: vi.fn(),
  setLastSeenRelease: vi.fn(),
};
const mockLoader = {
  readReleaseNotes: vi.fn(),
  readSlides: vi.fn(),
};
const mockApp = {
  getVersion: vi.fn(() => '2.32.0'),
};

vi.mock('../../src/main/state-store.js', () => mockStateStore);
vi.mock('../../src/release-notes/loader.js', () => mockLoader);
vi.mock('electron', () => ({ app: mockApp }));

// 收集 ipc handlers
const handlers = {};
const fakeIpcMain = {
  handle: (channel, fn) => { handlers[channel] = fn; },
};

import { registerReleaseNotes } from '../../src/main/release-notes.js';

beforeEach(() => {
  Object.keys(handlers).forEach((k) => delete handlers[k]);
  vi.clearAllMocks();
  registerReleaseNotes(fakeIpcMain);
});

describe('release-notes:get-current', () => {
  it('returns { alreadySeen: true } when seen.version === currentVersion', async () => {
    mockStateStore.getLastSeenRelease.mockReturnValue({ version: '2.32.0', at: 1 });
    mockLoader.readReleaseNotes.mockReturnValue('# v2.32.0\nfoo');
    mockLoader.readSlides.mockReturnValue({ version: '2.32.0', slides: [{ id: 'a' }] });
    const result = await handlers['release-notes:get-current']();
    expect(result.alreadySeen).toBe(true);
    expect(result.version).toBe('2.32.0');
    expect(result.changelogMd).toBe('# v2.32.0\nfoo');
    expect(result.slides).toEqual({ version: '2.32.0', slides: [{ id: 'a' }] });
  });

  it('returns { alreadySeen: false } when seen.version !== currentVersion', async () => {
    mockStateStore.getLastSeenRelease.mockReturnValue({ version: '2.31.0', at: 1 });
    mockLoader.readReleaseNotes.mockReturnValue('# v2.32.0\nfoo');
    mockLoader.readSlides.mockReturnValue(null);
    const result = await handlers['release-notes:get-current']();
    expect(result.alreadySeen).toBe(false);
    expect(result.slides).toBeNull();
  });

  it('returns { alreadySeen: false } when no previous seen record (fresh install / upgrade from < 2.32)', async () => {
    mockStateStore.getLastSeenRelease.mockReturnValue(null);
    mockLoader.readReleaseNotes.mockReturnValue('# v2.32.0\nfoo');
    mockLoader.readSlides.mockReturnValue(null);
    const result = await handlers['release-notes:get-current']();
    expect(result.alreadySeen).toBe(false);
  });

  it('returns null when md file missing (release build without notes)', async () => {
    mockStateStore.getLastSeenRelease.mockReturnValue(null);
    mockLoader.readReleaseNotes.mockReturnValue(null);
    const result = await handlers['release-notes:get-current']();
    expect(result).toBeNull();
  });

  it('returns { slides: null } when slides.json missing (md-only mode)', async () => {
    mockStateStore.getLastSeenRelease.mockReturnValue(null);
    mockLoader.readReleaseNotes.mockReturnValue('# v2.32.0\nfoo');
    mockLoader.readSlides.mockReturnValue(null);
    const result = await handlers['release-notes:get-current']();
    expect(result.slides).toBeNull();
    expect(result.changelogMd).toBe('# v2.32.0\nfoo');
  });

  it('fail-safe: state-store throw → alreadySeen: true (do not block bootstrap)', async () => {
    mockStateStore.getLastSeenRelease.mockImplementation(() => { throw new Error('corrupt'); });
    mockLoader.readReleaseNotes.mockReturnValue('# v2.32.0\nfoo');
    const result = await handlers['release-notes:get-current']();
    expect(result.alreadySeen).toBe(true);
  });
});

describe('release-notes:mark-seen', () => {
  it('writes last_seen_release and returns { ok: true, version }', async () => {
    mockStateStore.setLastSeenRelease.mockReturnValue(undefined);
    const result = await handlers['release-notes:mark-seen']({}, '2.32.0');
    expect(result).toEqual({ ok: true, version: '2.32.0' });
    expect(mockStateStore.setLastSeenRelease).toHaveBeenCalledWith('2.32.0', expect.any(Number));
  });

  it('returns { ok: false } on write failure (does not throw)', async () => {
    mockStateStore.setLastSeenRelease.mockImplementation(() => { throw new Error('EACCES'); });
    const result = await handlers['release-notes:mark-seen']({}, '2.32.0');
    expect(result).toEqual({ ok: false, version: '2.32.0' });
  });
});

describe('release-notes:get-version', () => {
  it('returns payload for the requested version regardless of seen status', async () => {
    mockStateStore.getLastSeenRelease.mockReturnValue({ version: '2.31.0', at: 1 });
    mockLoader.readReleaseNotes.mockReturnValue('# v2.32.0\nfoo');
    mockLoader.readSlides.mockReturnValue(null);
    const result = await handlers['release-notes:get-version']({}, '2.32.0');
    expect(result.version).toBe('2.32.0');
    expect(result.changelogMd).toBe('# v2.32.0\nfoo');
    expect(result.slides).toBeNull();
  });

  it('returns null when requested version has no md', async () => {
    mockLoader.readReleaseNotes.mockReturnValue(null);
    const result = await handlers['release-notes:get-version']({}, '9.9.9');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试, 确认失败**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run tests/main/register-core-release-notes.test.js
```

预期: 失败 (`registerReleaseNotes` 不存在).

- [ ] **Step 3: 实现 IPC handlers**

创建 `src/main/release-notes.js`:

```js
/**
 * src/main/release-notes.js
 *
 * ON: IPC handlers — 读 release notes 内容 + 读写 last_seen_release.
 *
 * 启动策略 (跟现有 digest / watchlist 一致): 不主动推, renderer bootstrap 后
 * 主动调 getCurrent(), 跟 isCheckRunning 一样是 fire-and-forget 风格.
 * 这样 renderer 拿到结果后能跟自己的 state (loading / mutes) 协调.
 */

const { app, ipcMain } = require('electron');
const { taggedLog } = require('./log.js');
const loader = require('../release-notes/loader.js');
const stateStore = require('./state-store.js');

const log = taggedLog('[release-notes]');

/**
 * 注册 IPC handlers. 在 main process 启动时 (app.whenReady 之后) 调一次.
 * @param {Electron.IpcMain} ipcMain
 */
function registerReleaseNotes(ipcMain) {
  ipcMain.handle('release-notes:get-current', async () => {
    let currentVersion;
    try {
      currentVersion = app.getVersion();
    } catch (err) {
      log.warn('app.getVersion() failed:', err.message);
      return null;
    }

    let seen = null;
    try {
      seen = stateStore.getLastSeenRelease();
    } catch (err) {
      // fail-safe: state-store 抛错 (corruption 等) 视为已看, 不弹
      log.warn('getLastSeenRelease failed:', err.message);
      return { alreadySeen: true, version: currentVersion, changelogMd: null, slides: null };
    }

    const changelogMd = loader.readReleaseNotes(currentVersion);
    if (changelogMd === null) {
      // 没 release notes (发版漏了) → 不弹
      return null;
    }

    const slides = loader.readSlides(currentVersion);
    const alreadySeen = seen !== null && seen.version === currentVersion;

    return {
      version: currentVersion,
      alreadySeen,
      changelogMd,
      slides, // null 或 { version, slides[] }
    };
  });

  ipcMain.handle('release-notes:get-version', async (_evt, version) => {
    const changelogMd = loader.readReleaseNotes(version);
    if (changelogMd === null) return null;
    const slides = loader.readSlides(version);
    return { version, changelogMd, slides };
  });

  ipcMain.handle('release-notes:mark-seen', async (_evt, version) => {
    try {
      stateStore.setLastSeenRelease(version, Date.now());
      return { ok: true, version };
    } catch (err) {
      log.warn('setLastSeenRelease failed:', err.message);
      return { ok: false, version };
    }
  });
}

module.exports = { registerReleaseNotes };
```

- [ ] **Step 4: 跑测试, 确认绿**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run tests/main/register-core-release-notes.test.js
```

预期: 10/10 绿.

---

## Task 4: preload.js 暴露 + main/index.js 接入

**Files:**
- Modify: `preload.js`
- Modify: `src/main/index.js`

- [ ] **Step 1: 看现有 preload 暴露模式**

```bash
grep -n "ipcRenderer" /Users/shien.liang/Desktop/AppUpdateChecker-Electron/preload.js | head -20
```

找到类似 `release-notes` 这样的 contextBridge 暴露 (参考 watchlist / reminders).

- [ ] **Step 2: 在 preload.js 加 releaseNotes 暴露**

在 `preload.js` 的 contextBridge `api` 对象里加 (参考现有 `digest` / `watchlist` 的 pattern):

```js
releaseNotes: {
  getCurrent: () => ipcRenderer.invoke('release-notes:get-current'),
  getVersion: (version) => ipcRenderer.invoke('release-notes:get-version', version),
  markSeen: (version) => ipcRenderer.invoke('release-notes:mark-seen', version),
},
```

- [ ] **Step 3: 在 main/index.js 注册**

参考现有 `registerWatchlist(api)` / `registerDigest(api)` 的接入点 (grep 找一下), 加:

```js
const { registerReleaseNotes } = require('./release-notes.js');
// ...
registerReleaseNotes(api.ipcMain);
```

(ponytail: 复用 ipcMain 实例, 跟 watchlist / reminders 同样的 init 模式)

- [ ] **Step 4: 跑全量 main 测试确认无回归**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run tests/main
```

预期: 全部通过 (state-store 既有测试 + ON 新增测试都绿).

---

## Task 5: renderer store signals

**Files:**
- Create: `src/renderer/release-notes-store.js`

- [ ] **Step 1: 创建 store**

```js
/**
 * src/renderer/release-notes-store.js
 *
 * ON: 渲染端状态. 4 个 signal:
 *   - open (boolean): wizard 是否显示
 *   - entryPath ('auto' | 'manual'): 入口, 决定关闭时是否 mark-seen
 *   - payload (object | null): { version, changelogMd, slides }
 *   - loading (boolean): 拉取中
 *
 * Header Trigger 读 entryPath + payload 决定红点: entryPath='auto' && payload
 * 表示"auto 路径已记录该版本未看" → 显示 NEW. manual 路径不写已看, 不影响红点.
 *
 * (ponytail: 把 open / entryPath / payload 拆 3 个 signal 而不是一个 state 对象,
 * 是为了避免每次 payload 变 (拉新数据) 误触发其他 useEffect; 跟 AppShell 里
 * 现有 digestDrawerOpen / watchlistOpen 单 boolean 风格一致)
 */

import { signal } from '@preact/signals';

export const releaseNotesOpen = signal(false);
export const releaseNotesEntryPath = signal('auto'); // 'auto' | 'manual'
export const releaseNotesPayload = signal(null);
export const releaseNotesLoading = signal(false);

/**
 * 打开 wizard. 在 bootstrap (auto) 或 Header click (manual) 时调.
 * @param {'auto' | 'manual'} entryPath
 * @param {object} payload
 */
export function openReleaseNotes(entryPath, payload) {
  releaseNotesEntryPath.value = entryPath;
  releaseNotesPayload.value = payload;
  releaseNotesOpen.value = true;
}

/**
 * 关闭 wizard. 总是清 open / payload, 不动 entryPath.
 * entryPath 由 mark-seen 完成后由 wizard 内部重置 (避免 race).
 */
export function closeReleaseNotes() {
  releaseNotesOpen.value = false;
  // 不立刻清 payload, 等 mark-seen 完成后由 caller 清
}
```

(ponytail: 4 个 signal 拆开而非合并 state, 是因为渲染端多处独立订阅 — Header 只关心是否显示红点, modal 只关心 open + payload, loading 单独给 spinner 用)

- [ ] **Step 2: 跑全量测试确认无回归**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run
```

预期: 全绿 (新文件没 hook 进现有代码, 不会破坏).

---

## Task 6: ReleaseNotesTrigger 组件 (TDD)

**Files:**
- Create: `src/renderer/components/ReleaseNotesTrigger.jsx`
- Test: `tests/renderer/ReleaseNotesTrigger.test.jsx`

- [ ] **Step 1: 看 AppShell Header 现有按钮**

```bash
grep -n "Header\|Reminders\|Recent" /Users/shien.liang/Desktop/AppUpdateChecker-Electron/src/renderer/components/AppShell.jsx | head -20
```

- [ ] **Step 2: 写失败测试 — Trigger 3 case**

创建 `tests/renderer/ReleaseNotesTrigger.test.jsx`:

```jsx
/**
 * tests/renderer/ReleaseNotesTrigger.test.jsx
 *
 * ON: Header 📖 按钮. 测:
 *   - 红点显隐 (基于 releaseNotesPayload 是否有该版本未看)
 *   - 点击 → openReleaseNotes('manual', payload) (不调 mark-seen)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import { ReleaseNotesTrigger } from '../../src/renderer/components/ReleaseNotesTrigger.jsx';
import {
  releaseNotesPayload,
  releaseNotesEntryPath,
  __resetForTest,
} from '../../src/renderer/release-notes-store.js';

vi.mock('../../src/renderer/api.js', () => ({
  api: {
    releaseNotes: {
      getCurrent: vi.fn(),
      getVersion: vi.fn(),
      markSeen: vi.fn(),
    },
  },
}));

const { api } = await import('../../src/renderer/api.js');

beforeEach(() => {
  cleanup();
  __resetForTest();
  vi.clearAllMocks();
});

describe('ReleaseNotesTrigger', () => {
  it('shows NEW badge when current version is unseen (entryPath=auto + payload set)', () => {
    releaseNotesEntryPath.value = 'auto';
    releaseNotesPayload.value = { version: '2.32.0', changelogMd: '# x', slides: null };
    const { container } = render(<ReleaseNotesTrigger />);
    expect(container.querySelector('.release-notes-trigger-badge')).toBeTruthy();
  });

  it('hides NEW badge when entryPath=manual (user already saw via header button)', () => {
    releaseNotesEntryPath.value = 'manual';
    releaseNotesPayload.value = { version: '2.32.0', changelogMd: '# x', slides: null };
    const { container } = render(<ReleaseNotesTrigger />);
    expect(container.querySelector('.release-notes-trigger-badge')).toBeFalsy();
  });

  it('click calls openReleaseNotes(manual) and does NOT call markSeen', async () => {
    releaseNotesEntryPath.value = 'auto';
    releaseNotesPayload.value = { version: '2.32.0', changelogMd: '# x', slides: null };
    const { getByTitle, getByText } = render(<ReleaseNotesTrigger />);
    // store 的 open 函数: spy 它
    const storeMod = await import('../../src/renderer/release-notes-store.js');
    const spy = vi.spyOn(storeMod, 'openReleaseNotes');
    fireEvent.click(getByTitle(/本版本更新/));
    expect(spy).toHaveBeenCalledWith('manual', releaseNotesPayload.value);
    expect(api.releaseNotes.markSeen).not.toHaveBeenCalled();
  });
});
```

注意: 需要在 `release-notes-store.js` 末尾加 `__resetForTest` (跟 main 端一致):

```js
export function __resetForTest() {
  releaseNotesOpen.value = false;
  releaseNotesEntryPath.value = 'auto';
  releaseNotesPayload.value = null;
  releaseNotesLoading.value = false;
}
```

(ponytail: __resetForTest 是测试约定, 跟 main `_resetForTest` 一致风格)

- [ ] **Step 3: 跑测试, 确认失败**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run tests/renderer/ReleaseNotesTrigger.test.jsx
```

预期: 失败 (Trigger 组件 + store.resetForTest 缺失).

- [ ] **Step 4: 实现组件 + store reset**

A. 在 `release-notes-store.js` 末尾加 `__resetForTest` (见上).

B. 创建 `src/renderer/components/ReleaseNotesTrigger.jsx`:

```jsx
/**
 * src/renderer/components/ReleaseNotesTrigger.jsx
 *
 * ON: Header 📖 按钮. 与 ⏰🕒⭐⚙️ 并列.
 *
 * 红点逻辑: entryPath === 'auto' && payload.version === currentVersion
 *   即"auto 路径记录当前版本未看". 入口是 manual (用户已点过头但没 mark-seen)
 *   或 payload 缺失 → 不显示.
 *
 * 点击 → 调 openReleaseNotes('manual', payload), 不调 mark-seen (manual 路径).
 */
import { releaseNotesEntryPath, releaseNotesPayload, openReleaseNotes } from '../release-notes-store.js';

export function ReleaseNotesTrigger() {
  const payload = releaseNotesPayload.value;
  const showBadge = releaseNotesEntryPath.value === 'auto'
    && payload !== null
    && payload.version != null;

  const handleClick = () => {
    if (!payload) return; // 兜底: payload 缺失时不开 (正常不会发生, bootstrap 后会有)
    openReleaseNotes('manual', payload);
  };

  return (
    <button
      type="button"
      class="icon-btn release-notes-trigger"
      onClick={handleClick}
      title="本版本更新"
      aria-label="本版本更新"
    >
      <span class="release-notes-trigger-icon" aria-hidden="true">📖</span>
      {showBadge && <span class="release-notes-trigger-badge" aria-label="有未读更新" />}
    </button>
  );
}
```

(ponytail: 走 entryPath 而不是单独开一个 `unread` signal, 是因为这俩状态本质耦合 — "未读" 就是 "auto 路径记录过" — 拆两个 signal 反而要担心不一致)

- [ ] **Step 5: 跑测试, 确认绿**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run tests/renderer/ReleaseNotesTrigger.test.jsx
```

预期: 3/3 绿.

---

## Task 7: ReleaseNotesWizard 组件 (TDD)

**Files:**
- Create: `src/renderer/components/ReleaseNotesWizard.jsx`
- Test: `tests/renderer/ReleaseNotesWizard.test.jsx`

- [ ] **Step 1: 写失败测试 — Wizard 8 case**

创建 `tests/renderer/ReleaseNotesWizard.test.jsx`:

```jsx
/**
 * tests/renderer/ReleaseNotesWizard.test.jsx
 *
 * ON: 向导 modal 组件. 测:
 *   - 默认隐藏
 *   - open signal → 显示
 *   - 翻页 ← →
 *   - 4 种关闭路径 (skip / 完成 / ESC / 遮罩) 都调 mark-seen (auto 路径)
 *   - manual 路径关闭 → 不调 mark-seen
 *   - mark-seen 失败 → 仍关闭 + toast
 *   - 只有 changelog 无 slides → 单页
 *   - slide body 走 DOMPurify (无 <script> 注入)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/preact';

const mockToast = vi.fn();
vi.mock('../src/renderer/store.js', () => ({
  showToast: (...args) => mockToast(...args),
}));

vi.mock('../src/renderer/api.js', () => ({
  api: {
    releaseNotes: {
      markSeen: vi.fn(),
    },
  },
}));

const { api } = await import('../src/renderer/api.js');
const {
  releaseNotesOpen, releaseNotesEntryPath, releaseNotesPayload, __resetForTest,
} = await import('../src/renderer/release-notes-store.js');
const { ReleaseNotesWizard } = await import('../src/renderer/components/ReleaseNotesWizard.jsx');

function openAsAuto(payload) {
  __resetForTest();
  releaseNotesEntryPath.value = 'auto';
  releaseNotesPayload.value = payload;
  releaseNotesOpen.value = true;
}

beforeEach(() => {
  cleanup();
  __resetForTest();
  vi.clearAllMocks();
  api.releaseNotes.markSeen.mockResolvedValue({ ok: true, version: '2.32.0' });
});

describe('ReleaseNotesWizard', () => {
  it('does not render when open is false', () => {
    const { container } = render(<ReleaseNotesWizard />);
    expect(container.querySelector('.release-notes-wizard')).toBeFalsy();
  });

  it('renders when open is true', () => {
    openAsAuto({ version: '2.32.0', changelogMd: '# hi', slides: null });
    const { container } = render(<ReleaseNotesWizard />);
    expect(container.querySelector('.release-notes-wizard')).toBeTruthy();
  });

  it('next / prev advance and retreat current page', () => {
    openAsAuto({
      version: '2.32.0',
      changelogMd: '# changelog',
      slides: { version: '2.32.0', slides: [
        { id: 's1', title: 'A', body: 'a' },
        { id: 's2', title: 'B', body: 'b' },
      ] },
    });
    const { container, getByText } = render(<ReleaseNotesWizard />);
    // 初始在 page 0 (changelog), 显示 changelog 内容
    expect(container.textContent).toContain('changelog');
    // 点下一步 → 进 page 1 (slide s1)
    fireEvent.click(getByText(/下一步/));
    expect(container.textContent).toContain('A');
    // 点下一步 → page 2 (slide s2)
    fireEvent.click(getByText(/下一步/));
    expect(container.textContent).toContain('B');
    // 点上一步 → page 1
    fireEvent.click(getByText(/上一步/));
    expect(container.textContent).toContain('A');
  });

  it('skip button on auto path → calls mark-seen + closes', async () => {
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/跳过/));
    await waitFor(() => {
      expect(api.releaseNotes.markSeen).toHaveBeenCalledWith('2.32.0');
    });
    expect(releaseNotesOpen.value).toBe(false);
  });

  it('完成 button on auto path (last page) → calls mark-seen + closes', async () => {
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    // changelog 1 页 → 完成可见
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/完成/));
    await waitFor(() => {
      expect(api.releaseNotes.markSeen).toHaveBeenCalledWith('2.32.0');
    });
  });

  it('ESC key → auto path → calls mark-seen + closes', async () => {
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { container } = render(<ReleaseNotesWizard />);
    fireEvent.keyDown(container.querySelector('.release-notes-wizard'), { key: 'Escape' });
    await waitFor(() => {
      expect(api.releaseNotes.markSeen).toHaveBeenCalledWith('2.32.0');
    });
  });

  it('overlay click → auto path → calls mark-seen + closes', async () => {
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { container } = render(<ReleaseNotesWizard />);
    fireEvent.click(container.querySelector('.release-notes-wizard-overlay'));
    await waitFor(() => {
      expect(api.releaseNotes.markSeen).toHaveBeenCalledWith('2.32.0');
    });
  });

  it('manual path close → does NOT call mark-seen', async () => {
    __resetForTest();
    releaseNotesEntryPath.value = 'manual';
    releaseNotesPayload.value = { version: '2.32.0', changelogMd: '# x', slides: null };
    releaseNotesOpen.value = true;
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/跳过/));
    await waitFor(() => {
      expect(releaseNotesOpen.value).toBe(false);
    });
    expect(api.releaseNotes.markSeen).not.toHaveBeenCalled();
  });

  it('mark-seen failure → still closes + shows toast (does not block)', async () => {
    api.releaseNotes.markSeen.mockResolvedValue({ ok: false, version: '2.32.0' });
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/跳过/));
    await waitFor(() => {
      expect(releaseNotesOpen.value).toBe(false);
    });
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('保存失败'), 'warn');
  });

  it('mark-seen throw → still closes + shows toast', async () => {
    api.releaseNotes.markSeen.mockRejectedValue(new Error('IPC fail'));
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/跳过/));
    await waitFor(() => {
      expect(releaseNotesOpen.value).toBe(false);
    });
    expect(mockToast).toHaveBeenCalled();
  });

  it('changelog only (no slides) → shows single page with 完成 button (no 上一步/下一步)', () => {
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { container, queryByText } = render(<ReleaseNotesWizard />);
    expect(container.textContent).toContain('x'); // changelog 内容
    expect(queryByText(/上一步/)).toBeFalsy();
    expect(queryByText(/下一步/)).toBeFalsy();
    expect(queryByText(/完成/)).toBeTruthy();
  });

  it('script tag in slide body is sanitized by DOMPurify (XSS protection)', () => {
    openAsAuto({
      version: '2.32.0',
      changelogMd: '',
      slides: { version: '2.32.0', slides: [
        { id: 'evil', title: 'Safe', body: 'before <script>alert(1)</script> after' },
      ] },
    });
    const { container } = render(<ReleaseNotesWizard />);
    expect(container.querySelector('script')).toBeFalsy();
    expect(container.textContent).toContain('before');
    expect(container.textContent).toContain('after');
  });
});
```

(ponytail: 11 个 case 看上去多, 但每 case 都是一行触发 + 一行断言, 跟现有 WatchlistDrawer 10 case 的粒度一致)

- [ ] **Step 2: 跑测试, 确认失败**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run tests/renderer/ReleaseNotesWizard.test.jsx
```

预期: 失败 (Wizard 不存在).

- [ ] **Step 3: 实现 Wizard 组件**

创建 `src/renderer/components/ReleaseNotesWizard.jsx`:

```jsx
/**
 * src/renderer/components/ReleaseNotesWizard.jsx
 *
 * ON: 多步 modal 向导.
 *   - 渲染 md (走现有 renderChangelog, marked + DOMPurify)
 *   - 渲染 slides (每页 title + subtitle + body, body 同样走 renderChangelog)
 *   - 进度点 + 翻页
 *   - 4 种关闭路径 (skip / 完成 / ESC / 遮罩) 都视为 "完成本版"
 *   - auto 路径关闭时调 mark-seen; manual 路径关闭时**不**调
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks';
import { renderChangelog } from '../changelog.js';
import { showToast } from '../store.js';
import { api } from '../api.js';
import {
  releaseNotesOpen,
  releaseNotesEntryPath,
  releaseNotesPayload,
  closeReleaseNotes,
} from '../release-notes-store.js';

const TOTAL_PAGE_OFFSET = 1; // page 0 = changelog, page 1..N = slides[0..N-1]

export function ReleaseNotesWizard() {
  const open = releaseNotesOpen.value;
  const payload = releaseNotesPayload.value;
  const entryPath = releaseNotesEntryPath.value;

  if (!open || !payload) return null;

  return <WizardInner payload={payload} entryPath={entryPath} />;
}

function WizardInner({ payload, entryPath }) {
  const { version, changelogMd, slides } = payload;
  const slidesArr = slides && Array.isArray(slides.slides) ? slides.slides : [];
  const totalPages = 1 + slidesArr.length; // page 0 = changelog, page 1..N = slides
  const [page, setPage] = useState(0);
  const closeHandledRef = useRef(false);

  // 关闭 + (auto 路径) 调 mark-seen
  const handleClose = useCallback(async () => {
    if (closeHandledRef.current) return;
    closeHandledRef.current = true;
    closeReleaseNotes();
    if (entryPath === 'auto') {
      try {
        const r = await api.releaseNotes.markSeen(version);
        if (!r || !r.ok) {
          showToast('保存失败, 下次启动还会再弹', 'warn');
        }
      } catch (err) {
        showToast('保存失败, 下次启动还会再弹', 'warn');
      }
    }
  }, [entryPath, version]);

  // ESC 关闭
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === 'ArrowRight') {
        setPage((p) => Math.min(p + 1, totalPages - 1));
      } else if (e.key === 'ArrowLeft') {
        setPage((p) => Math.max(p - 1, 0));
      } else if (e.key === 'Enter' && page === totalPages - 1) {
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose, totalPages, page]);

  // 每次重新打开 → 重置到 page 0
  useEffect(() => {
    setPage(0);
    closeHandledRef.current = false;
  }, [version]);

  // 当前页内容
  const isFirstPage = page === 0;
  const isLastPage = page === totalPages - 1;
  const currentSlide = !isFirstPage ? slidesArr[page - TOTAL_PAGE_OFFSET] : null;

  const bodyHtml = useMemo(() => {
    try {
      if (isFirstPage) return renderChangelog(changelogMd, 'md', '');
      return renderChangelog(currentSlide.body || '', 'md', '');
    } catch (err) {
      return `<pre>${(changelogMd || currentSlide.body || '').replace(/</g, '&lt;')}</pre>`;
    }
  }, [isFirstPage, changelogMd, currentSlide]);

  return (
    <div
      class="release-notes-wizard-overlay"
      onClick={handleClose}
      role="presentation"
    >
      <div
        class="release-notes-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rnw-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <header class="release-notes-wizard-header">
          <h2 id="rnw-title" class="release-notes-wizard-title">
            {isFirstPage
              ? `v${version} 更新日志`
              : (currentSlide && currentSlide.title) || ''}
          </h2>
          {!isFirstPage && currentSlide && currentSlide.subtitle && (
            <p class="release-notes-wizard-subtitle">{currentSlide.subtitle}</p>
          )}
        </header>

        <div class="release-notes-wizard-progress" aria-label={`第 ${page + 1} / ${totalPages} 页`}>
          {Array.from({ length: totalPages }).map((_, i) => (
            <span
              key={i}
              class={`release-notes-wizard-dot${i === page ? ' active' : ''}`}
            />
          ))}
        </div>

        <div
          class="release-notes-wizard-body"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        <footer class="release-notes-wizard-footer">
          <button
            type="button"
            class="btn btn-ghost"
            onClick={handleClose}
          >
            跳过
          </button>
          <div class="release-notes-wizard-footer-right">
            {!isFirstPage && (
              <button
                type="button"
                class="btn"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ← 上一步
              </button>
            )}
            {!isLastPage ? (
              <button
                type="button"
                class="btn btn-primary"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                下一步 →
              </button>
            ) : (
              <button
                type="button"
                class="btn btn-primary"
                onClick={handleClose}
              >
                完成
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
```

(ponytail: 焦点 trap 在 plan 范围外 (跟 v1 spec §3.8 列了但实现成本较高), v1 用 ESC + ← → + Enter 已覆盖键盘可达性, 焦点 trap 留 v2. 单 monitor 场景下 modal 已经是顶层元素, 不会 "焦点跑出 modal")

- [ ] **Step 4: 跑测试, 确认绿**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run tests/renderer/ReleaseNotesWizard.test.jsx
```

预期: 11/11 绿.

---

## Task 8: 集成 — App.jsx 挂 + AppShell 注入

**Files:**
- Modify: `src/renderer/App.jsx`
- Modify: `src/renderer/components/AppShell.jsx`

- [ ] **Step 1: App.jsx 挂 Wizard**

在 `App.jsx` 顶部 import 区加:

```js
import { ReleaseNotesWizard } from './components/ReleaseNotesWizard.jsx';
```

在 root JSX 末尾 (`<WatchlistDrawer />` 旁) 加:

```jsx
<ReleaseNotesWizard />
```

- [ ] **Step 2: AppShell.jsx Header 注入 Trigger**

先看 AppShell 里 Header 现有按钮群 (在 `VersionsLayout` 内的 Header):

```bash
grep -n "WatchlistDrawer\|RemindersModal\|RecentActivity" /Users/shien.liang/Desktop/AppUpdateChecker-Electron/src/renderer/components/AppShell.jsx
```

找到 Header 按钮群, 加 import + 按钮:

```js
import { ReleaseNotesTrigger } from './ReleaseNotesTrigger.jsx';
```

```jsx
<ReleaseNotesTrigger />
```

(具体位置跟其他 ⏰🕒⭐⚙️ 并列, 看完 AppShell 实际布局决定)

- [ ] **Step 3: 跑全量 renderer 测试**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run tests/renderer
```

预期: 全部通过 (新组件挂载不影响现有测试).

---

## Task 9: bootstrap 接入自动弹

**Files:**
- Modify: `src/renderer/index.jsx`

- [ ] **Step 1: 写一个轻量手测脚本占位 (不写 vitest, 改走 manual smoke)**

这一步是集成点, 不写单元测试 (集成测试需要 mock 整个 bootstrap, ROI 低). 走 plan §10 smoke 验收.

- [ ] **Step 2: 在 bootstrap 末尾 (render 之后, triggerCheck 之前) 加自动弹**

在 `src/renderer/index.jsx`:

1. 顶部 import 区加:

```js
import {
  openReleaseNotes,
  releaseNotesPayload,
} from './release-notes-store.js';
```

2. 在 `bootstrap()` 内, `render(<App />...)` 之后, `triggerCheck()` 之前 (cfg.check_on_launch 分支) 加:

```js
// ON: 检查本版本 release notes (auto 路径, 未看会弹)
(async () => {
  try {
    const payload = await api.releaseNotes.getCurrent();
    if (payload) {
      releaseNotesPayload.value = payload; // 给 Header Trigger 用 (决定红点)
      if (!payload.alreadySeen) {
        openReleaseNotes('auto', payload);
      }
    }
  } catch (err) {
    log.error('getCurrent failed:', err);
  }
})();
```

注意: `cfg.check_on_launch` 是 `if` 分支, ON 弹层不依赖 check, 应该**无条件**拉 (不管 check_on_launch 怎么配). 把这段放在 `cfg.check_on_launch` 之前 / 之外.

实际放置点: 在 `render(<App />)` 调用之后, `if (cfg.check_on_launch) { triggerCheck() }` 块之前或之后, 独立一段 IIFE.

- [ ] **Step 3: 跑全量测试**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run
```

预期: 全绿 (无 renderer 测试会因 bootstrap 改动失败, 因为 bootstrap 只在真实 renderer 环境跑).

---

## Task 10: styles.css 样式

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: 在文件末尾追加 ON 样式块**

```css
/* === ON: Release Notes Onboarding === */

.release-notes-trigger {
  position: relative;
}

.release-notes-trigger-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  background: #ff3b30;
  border-radius: 50%;
  pointer-events: none;
}

.release-notes-wizard-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.release-notes-wizard {
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #000);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 560px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  padding: 24px;
}

.release-notes-wizard-header {
  margin-bottom: 12px;
}

.release-notes-wizard-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.release-notes-wizard-subtitle {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--text-secondary, #666);
}

.release-notes-wizard-progress {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin: 12px 0;
}

.release-notes-wizard-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-secondary, #ccc);
  opacity: 0.4;
  transition: opacity 0.2s, background 0.2s;
}

.release-notes-wizard-dot.active {
  opacity: 1;
  background: var(--accent, #007aff);
}

.release-notes-wizard-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
  line-height: 1.6;
  font-size: 14px;
}

.release-notes-wizard-body h1 { font-size: 18px; margin: 12px 0 8px; }
.release-notes-wizard-body h2 { font-size: 16px; margin: 10px 0 6px; }
.release-notes-wizard-body h3 { font-size: 15px; margin: 8px 0 4px; }
.release-notes-wizard-body p { margin: 6px 0; }
.release-notes-wizard-body ul, .release-notes-wizard-body ol { padding-left: 20px; }
.release-notes-wizard-body code {
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 13px;
}
.release-notes-wizard-body pre {
  background: rgba(0, 0, 0, 0.06);
  padding: 8px;
  border-radius: 6px;
  overflow-x: auto;
}
.release-notes-wizard-body a {
  color: var(--accent, #007aff);
  text-decoration: none;
}
.release-notes-wizard-body a:hover { text-decoration: underline; }

.release-notes-wizard-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-primary, rgba(0,0,0,0.08));
}

.release-notes-wizard-footer-right {
  display: flex;
  gap: 8px;
}
```

(ponytail: 用 `var(--bg-primary)` 等 css 变量, 跟项目其他 modal 风格一致 — 已有 BulkUpgradeModal / AISettingsModal 等都用变量)

- [ ] **Step 2: 跑全量 vitest**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run
```

预期: 全绿 (CSS 不影响测试).

---

## Task 11: 全量 vitest + 手测

- [ ] **Step 1: 跑全量测试**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx vitest run
```

预期: 全绿. 新增 case 数 (state 3 + loader 9 + IPC 10 + Wizard 11 + Trigger 3 = 36 case).

- [ ] **Step 2: 跑 lint**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npx eslint src/release-notes src/main/release-notes.js src/main/state-store.js src/main/state-store-schema.js src/renderer/release-notes-store.js src/renderer/components/ReleaseNotesWizard.jsx src/renderer/components/ReleaseNotesTrigger.jsx
```

(或者跑项目默认 lint 命令)

- [ ] **Step 3: 写 release notes (用户填 slides)**

提醒: 本次实施**不**填 `src/release-notes-content/2.32.0/slides.json` (用户确认 slides 后再填), 但测试用的 fixture `tests/release-notes-content/2.32.0/slides.json` 已建好.

发版前用户需要做:
1. 准备 `.release-notes-2.32.0.md` (仓库根, 已有 2.31.0 模板可参考)
2. 准备 `src/release-notes-content/2.32.0/slides.json` (每页一个重点新功能, 2-3 页为宜)
3. 跑 `npm run build:mac` / `npm run build:win` 出包

- [ ] **Step 4: 手测 (5 步核心 smoke)**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron && npm run dev
```

手测步骤 (按 spec §7 验收):

1. **首次全新装**: 删 `~/Library/Application Support/pulse/state.json` → 启动 → wizard 自动弹 → 关闭 → 重启 → wizard 不弹 ✅
2. **跨版本升级**: state.json 里 `last_seen_release.version` 改成 `2.31.0` → 启动 → wizard 自动弹 ✅
3. **完成向导**: 点 [完成] → 查 `state.json` → `last_seen_release.version === "2.32.0"` ✅
4. **手动重看不写已看**: Header 📖 按钮 → wizard 弹 → 关闭 → 查 `state.json` → `last_seen_release` 未变 (还是之前版本或空) ✅
5. **红点**: 未看时 Header 📖 有红点; 看完红点消失; 手动重看不影响红点状态 ✅
6. **不发 slides**: 删除/不创建 `src/release-notes-content/2.32.0/slides.json` → wizard 只显示 changelog 一页 + 完成按钮 ✅
7. **4 种关闭路径**: 跳过 / 完成 / ESC / 遮罩 — 都调 mark-seen (auto 路径) ✅
8. **mark-seen 失败**: 在 DevTools 里把 IPC 改坏 → 关闭 → 显示 toast "保存失败, 下次启动还会再弹" + wizard 仍关闭 ✅
9. **XSS**: 在 slides.json body 塞 `<script>alert(1)</script>` → 渲染时无 `<script>` 元素, 文字保留 ✅
10. **键盘**: ← → 翻页, Enter 完成, ESC 关闭 ✅

---

## 实施顺序总结

| Task | 内容 | 估时 | 依赖 |
| ---- | ---- | ---- | ---- |
| 1 | state-store 新字段 + schema | 15 min | — |
| 2 | loader 纯函数 | 20 min | — |
| 3 | IPC handlers | 25 min | Task 1, 2 |
| 4 | preload + main 接入 | 10 min | Task 3 |
| 5 | renderer store | 10 min | — |
| 6 | ReleaseNotesTrigger | 20 min | Task 5 |
| 7 | ReleaseNotesWizard | 35 min | Task 5 |
| 8 | App.jsx / AppShell 集成 | 10 min | Task 6, 7 |
| 9 | bootstrap 自动弹 | 10 min | Task 4, 5 |
| 10 | styles.css | 10 min | Task 7 |
| 11 | 全量测试 + 手测 | 20 min | All |

总计约 3 小时 (含测试, 不含发版流程).

---

## 风险与降级 (在 writing-plans 阶段对 plan §1-10 的复审)

| 风险 | plan 应对 |
| ---- | --------- |
| vi.mock 路径错 (loader test) | 已经在 Task 2 标了 __setTestOverrides 路径注入, 兜底 |
| happy-dom 不支持 `marked` 全功能 | renderChangelog 已在 vitest 跑过, 复用 |
| IPC handler 的 `app.getVersion` mock 顺序 | Task 3 用 `vi.mock('electron', ...)` 提前 mock, 注意 `app` 是 named import |
| preload.js 改动漏掉一处 | Task 4 Step 1 grep 找现有 pattern, Step 2 严格 follow |
| bootstrap IIFE 跟 triggerCheck 抢焦点 | Task 9 IIFE 不 await, 跟现有 `loadAiTasks().catch(() => {})` 同风格, fire-and-forget |
| focus trap 没做 (键盘可达性打折) | spec §3.8 列了但 v1 不实现, plan 注释里明确; ESC + ← → + Enter 覆盖基本可达性 |
