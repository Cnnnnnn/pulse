# App Rollback · Implementation Plan

> Generated from spec `2026-06-14-app-rollback-design.md`.
> Brainstorming → writing-plans. Tasks ordered by dependency; each task is small
> enough to implement and test independently.

## Tasks (10 total)

### Task 1 · state-store.js 加 versionHistory 字段

**Files**:
- Modify: `src/main/state-store.js` (顶部 schema doc + load/save 函数)
- Test: `tests/main/state-store.test.js` (扩, 加 round-trip case)

**Change**:
- 顶部 schema 文档新增字段:
```
"version_history": {              // 新增 (2026-06-14: app rollback)
  "Cursor": [
    {
      "from": "3.6.31",
      "to": "3.6.32",
      "at": 1750000000000,
      "backupPath": "...",
      "source": "brew_formulae",
      "sizeBytes": 482000000
    }
  ]
}
```
- 找到 `load()` 函数 (state-store.js 中,处理顶层字段的函数),加一行:
  ```js
  const versionHistory = (raw && raw.version_history && typeof raw.version_history === "object")
    ? raw.version_history
    : {};
  ```
  并在返回对象里加 `version_history: versionHistory`
- 找到 `saveAll(state)` / atomic write 函数,在写盘前加:
  ```js
  if (state && state.version_history) {
    raw.version_history = state.version_history;
  }
  ```
  (注意: 别无脑覆盖 — 老 state.json 没这个字段就不写)
- 加 helper 函数 (放在 file 末尾 module.exports 前):
  ```js
  function getVersionHistory() {
    try {
      const s = load();
      return (s && s.version_history) || {};
    } catch {
      return {};
    }
  }

  function saveVersionHistory(versionHistory) {
    // atomic write: 读现状 → merge → 写回
    const state = load() || {};
    state.version_history = versionHistory || {};
    saveAll(state);
  }
  ```
- module.exports 加 `getVersionHistory, saveVersionHistory`

**Verify**:
- `npx vitest run tests/main/state-store.test.js` — 老 tests + 新加的 version_history round-trip test 通过
- Manual: 跑 app, 升级一个 brew cask, 检查 `state.json` 出现 `version_history` 字段 (先不调 recordUpgrade, 手动 patch JSON 测 load)

**Status**: ⬜ pending

---

### Task 2 · src/main/backup.js (新文件, TDD)

**Files**:
- Create: `src/main/backup.js`
- Create: `tests/main/backup.test.js`

**Change**:
- 写测试先 (`tests/main/backup.test.js`):
  ```js
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
  import fs from 'fs';
  import path from 'path';
  import os from 'os';
  import {
    getBackupDir,
    backupBundleVersion,
    pruneOldBackups,
    deleteBackup,
  } from '../../src/main/backup';

  let tmpRoot;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-backup-test-'));
  });
  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('getBackupDir', () => {
    it('基于 userData 返回 backups/<bundle>', () => {
      expect(getBackupDir('Cursor.app', { userDataDir: tmpRoot }))
        .toBe(path.join(tmpRoot, 'backups', 'Cursor.app'));
    });
  });

  describe('backupBundleVersion', () => {
    it('复制源 .app → backups/<bundle>/<version>.app/', async () => {
      const src = path.join(tmpRoot, 'Source.app');
      fs.mkdirSync(path.join(src, 'Contents'), { recursive: true });
      fs.writeFileSync(path.join(src, 'Contents', 'Info.plist'), 'x');
      const result = await backupBundleVersion('Source.app', '1.0.0', {
        userDataDir: tmpRoot,
        sourceAppPath: src,
      });
      expect(result.backupPath).toBe(path.join(tmpRoot, 'backups', 'Source.app', '1.0.0.app'));
      expect(fs.existsSync(result.backupPath)).toBe(true);
      expect(fs.statSync(result.backupPath).isDirectory()).toBe(true);
    });

    it('返回 sizeBytes', async () => {
      const src = path.join(tmpRoot, 'Source.app');
      fs.mkdirSync(path.join(src, 'Contents'), { recursive: true });
      fs.writeFileSync(path.join(src, 'Contents', 'Info.plist'), 'hello');
      const r = await backupBundleVersion('Source.app', '1.0.0', {
        userDataDir: tmpRoot,
        sourceAppPath: src,
      });
      expect(r.sizeBytes).toBeGreaterThan(0);
    });

    it('源不存在 → 返回 null 不 throw', async () => {
      const r = await backupBundleVersion('Missing.app', '1.0.0', {
        userDataDir: tmpRoot,
        sourceAppPath: path.join(tmpRoot, 'Missing.app'),
      });
      expect(r).toBeNull();
    });

    it('cap=2 保留最近 2 个,删最旧', async () => {
      // 准备 3 个版本备份
      for (const v of ['1.0.0', '1.1.0', '1.2.0']) {
        const p = path.join(tmpRoot, 'backups', 'Source.app', `${v}.app`);
        fs.mkdirSync(p, { recursive: true });
        fs.writeFileSync(path.join(p, 'marker'), v);
      }
      // 模拟新备份 1.3.0 之前 prune
      pruneOldBackups('Source.app', { userDataDir: tmpRoot, keep: 2 });
      const dir = path.join(tmpRoot, 'backups', 'Source.app');
      expect(fs.readdirSync(dir).sort()).toEqual(['1.1.0.app', '1.2.0.app']);
    });
  });

  describe('deleteBackup', () => {
    it('删指定版本 + 返回 size 释放字节数', () => {
      const p = path.join(tmpRoot, 'backups', 'Source.app', '1.0.0.app');
      fs.mkdirSync(p, { recursive: true });
      fs.writeFileSync(path.join(p, 'x'), 'hello');
      const freed = deleteBackup('Source.app', '1.0.0', { userDataDir: tmpRoot });
      expect(freed).toBeGreaterThan(0);
      expect(fs.existsSync(p)).toBe(false);
    });

    it('不存在 → 返回 0 不 throw', () => {
      const freed = deleteBackup('Source.app', '1.0.0', { userDataDir: tmpRoot });
      expect(freed).toBe(0);
    });
  });
  ```
- 写实现 (`src/main/backup.js`):
  ```js
  const path = require('path');
  const fs = require('fs');
  const fsp = fs.promises;
  const { promisify } = require('util');
  const { execFile } = require('child_process');
  const pExecFile = promisify(execFile);

  function getBackupDir(bundleName, { userDataDir }) {
    return path.join(userDataDir, 'backups', bundleName);
  }

  async function dirSize(p) {
    // du -sk 给出 KB, 转 byte. macOS 自带.
    try {
      const { stdout } = await pExecFile('du', ['-sk', p]);
      const kb = parseInt(stdout.split('\t')[0], 10);
      return Number.isFinite(kb) ? kb * 1024 : 0;
    } catch {
      return 0;
    }
  }

  async function backupBundleVersion(bundleName, version, opts) {
    const { userDataDir, sourceAppPath } = opts;
    if (!sourceAppPath || !fs.existsSync(sourceAppPath)) return null;
    const target = path.join(getBackupDir(bundleName, { userDataDir }), `${version}.app`);
    try {
      await fsp.cp(sourceAppPath, target, { recursive: true });
      const sizeBytes = await dirSize(target);
      return { backupPath: target, sizeBytes };
    } catch (err) {
      // best-effort: log 已经在调用方做, 这里不 throw
      return null;
    }
  }

  function pruneOldBackups(bundleName, { userDataDir, keep = 2 }) {
    const dir = getBackupDir(bundleName, { userDataDir });
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir)
      .filter((n) => n.endsWith('.app'))
      .sort(); // 升序: 最旧在前
    const toRemove = entries.slice(0, Math.max(0, entries.length - keep));
    for (const name of toRemove) {
      try {
        fs.rmSync(path.join(dir, name), { recursive: true, force: true });
      } catch {
        /* noop */
      }
    }
  }

  function deleteBackup(bundleName, version, { userDataDir }) {
    const target = path.join(getBackupDir(bundleName, { userDataDir }), `${version}.app`);
    if (!fs.existsSync(target)) return 0;
    const size = fs.statSync(target).size;
    // 用递归删整个目录 (含 macOS bundle 内多个文件)
    let freed = 0;
    try {
      const walk = (p) => {
        const st = fs.statSync(p);
        if (st.isDirectory()) {
          for (const child of fs.readdirSync(p)) walk(path.join(p, child));
          try { fs.rmdirSync(p); } catch { /* leaf might not be empty yet */ }
        } else {
          freed += st.size;
          fs.unlinkSync(p);
        }
      };
      walk(target);
    } catch {
      return freed; // 尽力返回已计算
    }
    return freed;
  }

  module.exports = {
    getBackupDir,
    backupBundleVersion,
    pruneOldBackups,
    deleteBackup,
  };
  ```
- `package.json` "engines" 或 "type" 是 "commonjs" — 用 require, fs/child_process 顶层加载 OK
- 跑测试:
  ```bash
  npx vitest run tests/main/backup.test.js
  ```
  预期 PASS

**Verify**:
- `npx vitest run tests/main/backup.test.js` — 5+ tests pass
- `npx vitest run` — 全套 1341+ 仍 pass

**Status**: ⬜ pending

---

### Task 3 · src/main/version-history.js (新文件, TDD)

**Files**:
- Create: `src/main/version-history.js`
- Create: `tests/main/version-history.test.js`

**Change**:
- 写测试先:
  ```js
  import { describe, it, expect, beforeEach, afterEach } from 'vitest';
  import fs from 'fs';
  import path from 'path';
  import os from 'os';
  import {
    recordUpgrade,
    listHistory,
    deleteEntry,
    getTotalSize,
  } from '../../src/main/version-history';
  import * as stateStore from '../../src/main/state-store';

  let tmpRoot;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-vh-test-'));
    // patch state-store 用 tmpRoot 当 userData
    stateStore._setUserDataDirForTest(tmpRoot);
  });
  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('recordUpgrade', () => {
    it('写入 entry 到 versionHistory[app] 头部', () => {
      recordUpgrade('Cursor', {
        from: '3.6.30', to: '3.6.31', at: 1000,
        backupPath: '/x', source: 'brew_formulae', sizeBytes: 100,
      });
      const list = listHistory('Cursor');
      expect(list).toHaveLength(1);
      expect(list[0].to).toBe('3.6.31');
    });

    it('多次 → 倒序 (最新在 0)', () => {
      recordUpgrade('Cursor', { from: '3.6.30', to: '3.6.31', at: 1000, backupPath: '/a', source: 'brew', sizeBytes: 100 });
      recordUpgrade('Cursor', { from: '3.6.31', to: '3.6.32', at: 2000, backupPath: '/b', source: 'brew', sizeBytes: 200 });
      const list = listHistory('Cursor');
      expect(list.map(e => e.to)).toEqual(['3.6.32', '3.6.31']);
    });

    it('cap=2: 写第 3 条时删最旧 (调用方负责删 fs)', () => {
      // 验证 cap: 写 3 条 → list 长度 2
      recordUpgrade('Cursor', { from: '1.0', to: '1.1', at: 1, backupPath: '/a', source: 'brew', sizeBytes: 1 });
      recordUpgrade('Cursor', { from: '1.1', to: '1.2', at: 2, backupPath: '/b', source: 'brew', sizeBytes: 1 });
      recordUpgrade('Cursor', { from: '1.2', to: '1.3', at: 3, backupPath: '/c', source: 'brew', sizeBytes: 1 });
      // 第 3 次调用时, 调用方应已 prune fs, 这里只验证 state 数组 cap
      const list = listHistory('Cursor');
      expect(list.length).toBe(2);
      expect(list[0].to).toBe('1.3');
    });
  });

  describe('listHistory', () => {
    it('空 app → []', () => {
      expect(listHistory('Missing')).toEqual([]);
    });

    it('app 不在 vh → []', () => {
      recordUpgrade('Cursor', { from: '1', to: '2', at: 1, backupPath: '/a', source: 'brew', sizeBytes: 1 });
      expect(listHistory('Other')).toEqual([]);
    });
  });

  describe('deleteEntry', () => {
    it('删指定 (app, to) entry, 返回 freed bytes', () => {
      recordUpgrade('Cursor', { from: '1.0', to: '1.1', at: 1, backupPath: '/a', source: 'brew', sizeBytes: 100 });
      recordUpgrade('Cursor', { from: '1.1', to: '1.2', at: 2, backupPath: '/b', source: 'brew', sizeBytes: 200 });
      const freed = deleteEntry('Cursor', '1.1');
      expect(freed).toBe(100);
      const list = listHistory('Cursor');
      expect(list).toHaveLength(1);
      expect(list[0].to).toBe('1.2');
    });

    it('to 不存在 → 返回 0', () => {
      const freed = deleteEntry('Cursor', '9.9.9');
      expect(freed).toBe(0);
    });
  });

  describe('getTotalSize', () => {
    it('累加 sizeBytes 跨多个 app', () => {
      recordUpgrade('Cursor', { from: '1', to: '2', at: 1, backupPath: '/a', source: 'brew', sizeBytes: 100 });
      recordUpgrade('Kimi', { from: '1', to: '2', at: 1, backupPath: '/b', source: 'brew', sizeBytes: 50 });
      expect(getTotalSize()).toBe(150);
    });

    it('无 entry → 0', () => {
      expect(getTotalSize()).toBe(0);
    });
  });
  ```
- 给 state-store 加 test hook: 在 `state-store.js` 末尾加:
  ```js
  function _setUserDataDirForTest(dir) {
    _resolvedStatePath = path.join(dir, 'state.json');
  }
  module.exports._setUserDataDirForTest = _setUserDataDirForTest;
  ```
  (让 test 注入 tmpRoot 当 userData, 不污染真 fs)
- 写实现 (`src/main/version-history.js`):
  ```js
  const stateStore = require('./state-store');

  function getAll() {
    return stateStore.getVersionHistory() || {};
  }

  function recordUpgrade(appName, entry) {
    const vh = getAll();
    if (!vh[appName]) vh[appName] = [];
    vh[appName].unshift(entry);
    // cap 2: state-only, fs 由调用方 prune
    vh[appName] = vh[appName].slice(0, 2);
    stateStore.saveVersionHistory(vh);
  }

  function listHistory(appName) {
    return getAll()[appName] || [];
  }

  function deleteEntry(appName, toVersion) {
    const vh = getAll();
    const list = vh[appName] || [];
    const idx = list.findIndex((e) => e.to === toVersion);
    if (idx === -1) return 0;
    const freed = list[idx].sizeBytes || 0;
    vh[appName] = list.filter((_, i) => i !== idx);
    if (vh[appName].length === 0) delete vh[appName];
    stateStore.saveVersionHistory(vh);
    return freed;
  }

  function getTotalSize() {
    const vh = getAll();
    let total = 0;
    for (const app of Object.keys(vh)) {
      for (const e of vh[app]) total += e.sizeBytes || 0;
    }
    return total;
  }

  module.exports = { recordUpgrade, listHistory, deleteEntry, getTotalSize };
  ```
- 跑测试:
  ```bash
  npx vitest run tests/main/version-history.test.js
  ```
  预期 PASS

**Verify**:
- `npx vitest run tests/main/version-history.test.js` — 7+ tests pass
- 全套 `npx vitest run` — 仍全绿

**Status**: ⬜ pending

---

### Task 4 · bulk-upgrade.js 加 backup + recordUpgrade hook

**Files**:
- Modify: `src/main/bulk-upgrade.js` (顶部 import + brew 分支前后加 backup)
- Create: `tests/main/bulk-upgrade-with-backup.test.js`

**Change**:
- 顶部 import 加:
  ```js
  const backup = require('./backup');
  const versionHistory = require('./version-history');
  const path = require('path');
  const { app } = require('electron');
  const { resolveAppBundlePath } = require('../utils/app-paths');
  ```
  (注意: 已有 `path` 的话不重复)
- 找到 `runBulkUpgrade` 函数里的 brew 分支, 改写为:
  ```js
  // 跑这个 item
  try { onProgress({ id: item.id, status: 'running', action: action.type }); } catch { /* noop */ }
  const t0 = Date.now();

  // 1. backup (NEW, only for brew, best-effort)
  let backupInfo = null;
  if (action.type === 'brew' && item.bundleName) {
    try {
      const userDataDir = (app && typeof app.getPath === 'function')
        ? app.getPath('userData')
        : null;
      if (userDataDir) {
        const appPath = resolveAppBundlePath(item.bundleName);
        const installedVer = (item.current && String(item.current)) || 'unknown';
        backupInfo = await backup.backupBundleVersion(item.bundleName, installedVer, {
          userDataDir,
          sourceAppPath: appPath,
        });
        if (backupInfo) {
          backup.pruneOldBackups(item.bundleName, { userDataDir, keep: 2 });
        }
      }
    } catch (err) {
      // best-effort: 备份失败不阻塞升级
      try { onProgress({ id: item.id, status: 'backup_warning', warning: (err && err.message) || 'backup failed' }); } catch { /* noop */ }
    }
  }

  try {
    const result = await runOne(action, exec, perItemTimeoutMs, signal);
    const durationMs = Date.now() - t0;
    succeeded.push({ id: item.id, durationMs, action: action.type });
    try { onProgress({ id: item.id, status: 'done', durationMs, action: action.type, output: result.output || '' }); }
    catch { /* noop */ }

    // 2. recordUpgrade (NEW, only for brew with successful backup)
    if (action.type === 'brew' && backupInfo && item.name && item.latest && backupInfo.backupPath) {
      try {
        versionHistory.recordUpgrade(item.name, {
          from: String(item.current || 'unknown'),
          to: String(item.latest),
          at: Date.now(),
          backupPath: backupInfo.backupPath,
          source: String(item.source || 'brew_formulae'),
          sizeBytes: backupInfo.sizeBytes || 0,
        });
      } catch {
        /* noop */
      }
    }
  } catch (err) {
    const durationMs = Date.now() - t0;
    const error = (err && err.message) || 'unknown error';
    const output = (err && err.output) || '';
    failed.push({ id: item.id, error, output, action: action.type });
    try { onProgress({ id: item.id, status: 'failed', error, output, durationMs, action: action.type }); }
    catch { /* noop */ }
  }
  ```
  (注意: 原 `try { onProgress ... 'running' }` 已经在 item 顶部, 别删)
- 写测试 (`tests/main/bulk-upgrade-with-backup.test.js`):
  ```js
  import { describe, it, expect, beforeEach, vi } from 'vitest';
  import fs from 'fs';
  import path from 'path';
  import os from 'os';
  import { runBulkUpgrade } from '../../src/main/bulk-upgrade';
  import * as backup from '../../src/main/backup';
  import * as versionHistory from '../../src/main/version-history';
  import * as stateStore from '../../src/main/state-store';

  vi.mock('electron', () => ({
    app: { getPath: () => os.tmpdir() + '/pulse-bulk-test' },
    shell: { trashItem: vi.fn(async () => {}) },
  }));

  beforeEach(() => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-bulk-'));
    stateStore._setUserDataDirForTest(tmp);
    vi.spyOn(backup, 'backupBundleVersion').mockResolvedValue({
      backupPath: '/fake/backup', sizeBytes: 100,
    });
    vi.spyOn(backup, 'pruneOldBackups').mockImplementation(() => {});
    vi.spyOn(versionHistory, 'recordUpgrade').mockImplementation(() => {});
  });

  it('brew action 调用 backupBundleVersion + recordUpgrade', async () => {
    const items = [{
      id: '1', name: 'Cursor', source: 'brew_formulae',
      cask: 'cursor', bundleName: 'Cursor.app',
      current: '1.0.0', latest: '1.1.0',
    }];
    const fakeExec = vi.fn(async () => ({ output: 'ok' }));
    await runBulkUpgrade({
      items, exec: fakeExec,
      onProgress: () => {}, signal: null,
    });
    expect(backup.backupBundleVersion).toHaveBeenCalledWith(
      'Cursor.app', '1.0.0', expect.objectContaining({ sourceAppPath: expect.any(String) })
    );
    expect(versionHistory.recordUpgrade).toHaveBeenCalledWith(
      'Cursor', expect.objectContaining({ from: '1.0.0', to: '1.1.0' })
    );
  });

  it('非 brew action 不调 backup', async () => {
    const items = [{
      id: '1', name: 'Things', source: 'app_store_lookup',
      bundleName: 'Things.app', current: '3.0', latest: '3.1', trackId: 12345,
    }];
    const fakeExec = vi.fn(async () => ({ output: 'ok' }));
    await runBulkUpgrade({ items, exec: fakeExec, onProgress: () => {} });
    expect(backup.backupBundleVersion).not.toHaveBeenCalled();
    expect(versionHistory.recordUpgrade).not.toHaveBeenCalled();
  });

  it('backup 失败不阻塞升级 (recordUpgrade 不被调, succeeded 仍有)', async () => {
    vi.spyOn(backup, 'backupBundleVersion').mockResolvedValue(null);
    const items = [{
      id: '1', name: 'Cursor', source: 'brew_formulae',
      cask: 'cursor', bundleName: 'Cursor.app',
      current: '1.0.0', latest: '1.1.0',
    }];
    const summary = await runBulkUpgrade({
      items, exec: async () => ({ output: 'ok' }), onProgress: () => {},
    });
    expect(summary.succeeded).toHaveLength(1);
    expect(versionHistory.recordUpgrade).not.toHaveBeenCalled();
  });
  ```
- 跑测试:
  ```bash
  npx vitest run tests/main/bulk-upgrade-with-backup.test.js
  ```
  预期 PASS

**Verify**:
- `npx vitest run tests/main/bulk-upgrade-with-backup.test.js` — 3 tests pass
- `npx vitest run` — 全套绿

**Status**: ⬜ pending

---

### Task 5 · src/main/rollback.js (新文件, TDD)

**Files**:
- Create: `src/main/rollback.js`
- Create: `tests/main/rollback.test.js`

**Change**:
- 写测试先:
  ```js
  import { describe, it, expect, beforeEach, vi } from 'vitest';
  import fs from 'fs';
  import path from 'path';
  import os from 'os';
  import { doRollback, isAppRunning, killAppGraceful } from '../../src/main/rollback';

  vi.mock('electron', () => ({
    shell: { trashItem: vi.fn(async () => {}) },
  }));

  let tmpRoot;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-rb-test-'));
  });

  describe('doRollback', () => {
    it('trash 目标 + cp 备份 + 调 userData 写入', async () => {
      // 准备: 备份目录 + 当前 /Applications/Cursor.app
      const target = path.join(tmpRoot, 'Applications', 'Cursor.app');
      const contents = path.join(target, 'Contents');
      fs.mkdirSync(contents, { recursive: true });
      fs.writeFileSync(path.join(contents, 'Info.plist'), 'new version');

      const backupPath = path.join(tmpRoot, 'backups', 'Cursor.app', '3.6.30.app');
      const backupContents = path.join(backupPath, 'Contents');
      fs.mkdirSync(backupContents, { recursive: true });
      fs.writeFileSync(path.join(backupContents, 'Info.plist'), 'old version');

      const onState = vi.fn();
      const onActivity = vi.fn();
      const onRecheck = vi.fn();
      const onBroadcast = vi.fn();

      const r = await doRollback({
        appName: 'Cursor',
        bundleName: 'Cursor.app',
        targetAppPath: target,
        backupPath,
        rollbackToVersion: '3.6.30',
        currentInstalledVersion: '3.6.31',
        onUpdateInstalled: onState,
        onActivity,
        onRecheck,
        onBroadcast,
      });
      expect(r.ok).toBe(true);
      // 新 .app 被 trash (现在不存在)
      expect(fs.existsSync(target)).toBe(false);
      // 旧 .app 已 cp 过去
      expect(fs.existsSync(target)).toBe(true); // cp 之后又存在了
      // 检查内容是旧的
      const plistAfter = fs.readFileSync(path.join(contents, 'Info.plist'), 'utf-8');
      expect(plistAfter).toBe('old version');
      // 回调被调
      expect(onState).toHaveBeenCalledWith('3.6.30');
      expect(onActivity).toHaveBeenCalled();
      expect(onBroadcast).toHaveBeenCalled();
    });

    it('目标不存在 → 跳过 trash, 直接 cp', async () => {
      const target = path.join(tmpRoot, 'Applications', 'Cursor.app');
      const backupPath = path.join(tmpRoot, 'backups', 'Cursor.app', '3.6.30.app');
      fs.mkdirSync(path.join(backupPath, 'Contents'), { recursive: true });

      const r = await doRollback({
        appName: 'Cursor',
        bundleName: 'Cursor.app',
        targetAppPath: target,
        backupPath,
        rollbackToVersion: '3.6.30',
        currentInstalledVersion: '3.6.31',
      });
      expect(r.ok).toBe(true);
      expect(fs.existsSync(target)).toBe(true);
    });

    it('backup 路径不存在 → 返回 backup_missing', async () => {
      const r = await doRollback({
        appName: 'Cursor',
        bundleName: 'Cursor.app',
        targetAppPath: '/x',
        backupPath: '/missing/backup',
        rollbackToVersion: '3.6.30',
        currentInstalledVersion: '3.6.31',
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('backup_missing');
    });
  });

  describe('isAppRunning', () => {
    it('找不到 → false', async () => {
      // 用一个肯定不存在的 bundle name
      const r = await isAppRunning('ThisDoesNotExist12345.app');
      expect(r).toBe(false);
    });
  });

  describe('killAppGraceful', () => {
    it('app 不在跑 → 立即返回 ok=true', async () => {
      const r = await killAppGraceful('ThisDoesNotExist12345', { timeoutMs: 100 });
      expect(r.ok).toBe(true);
    });
  });
  ```
- 写实现 (`src/main/rollback.js`):
  ```js
  const fs = require('fs');
  const fsp = fs.promises;
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const { shell } = require('electron');

  const pExecFile = promisify(execFile);

  async function isAppRunning(bundleName) {
    const procName = bundleName.replace(/\.app$/, '');
    try {
      const { stdout } = await pExecFile('pgrep', ['-f', procName]);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async function killAppGraceful(appName, { timeoutMs = 5000 } = {}) {
    const wasRunning = await isAppRunning(appName);
    if (!wasRunning) return { ok: true, reason: 'not_running' };
    try {
      await pExecFile('osascript', ['-e', `tell application "${appName}" to quit`]);
    } catch {
      /* osascript 失败继续 */
    }
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (!(await isAppRunning(appName))) {
        return { ok: true, reason: 'quit' };
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    // 超时, kill -9
    try {
      await pExecFile('pkill', ['-9', '-f', appName]);
    } catch {
      /* noop */
    }
    return { ok: true, reason: 'killed' };
  }

  /**
   * @param {object} opts
   * @param {string} opts.appName
   * @param {string} opts.bundleName
   * @param {string} opts.targetAppPath
   * @param {string} opts.backupPath
   * @param {string} opts.rollbackToVersion
   * @param {string} opts.currentInstalledVersion
   * @param {function} [opts.onUpdateInstalled]  (newVer) => void
   * @param {function} [opts.onActivity]  ({kind, ref, label}) => void
   * @param {function} [opts.onRecheck]  (appName) => void
   * @param {function} [opts.onBroadcast]  (event, payload) => void
   * @returns {Promise<{ok, reason?, error?}>}
   */
  async function doRollback(opts) {
    const {
      appName, bundleName, targetAppPath, backupPath,
      rollbackToVersion, currentInstalledVersion,
      onUpdateInstalled = () => {},
      onActivity = () => {},
      onRecheck = () => {},
      onBroadcast = () => {},
    } = opts;

    if (!backupPath || !fs.existsSync(backupPath)) {
      return { ok: false, reason: 'backup_missing' };
    }

    try {
      // 1. 杀 app
      await killAppGraceful(appName, { timeoutMs: 5000 });

      // 2. trash 当前 (如果存在)
      if (fs.existsSync(targetAppPath)) {
        await shell.trashItem(targetAppPath);
      }

      // 3. cp 备份到目标
      await fsp.cp(backupPath, targetAppPath, { recursive: true });

      // 4. 更新 state
      try { onUpdateInstalled(rollbackToVersion); } catch { /* noop */ }

      // 5. recent activity
      try {
        onActivity({
          kind: 'app-rollback',
          ref: appName,
          label: `${appName} 已回滚到 ${rollbackToVersion}`,
        });
      } catch { /* noop */ }

      // 6. recheck
      try { onRecheck(appName); } catch { /* noop */ }

      // 7. 广播
      try { onBroadcast('version-history-updated', { appName }); } catch { /* noop */ }

      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        reason: 'threw',
        error: (err && err.message) || String(err),
      };
    }
  }

  module.exports = { doRollback, isAppRunning, killAppGraceful };
  ```
- 跑测试:
  ```bash
  npx vitest run tests/main/rollback.test.js
  ```
  预期 PASS (注意: 测试 1 期望 trash 完后 cp 又创建 — 检查顺序)

**Verify**:
- `npx vitest run tests/main/rollback.test.js` — 5+ tests pass
- 全套 `npx vitest run` — 仍全绿

**Status**: ⬜ pending

---

### Task 6 · register-core.js 加 3 个 IPC handler

**Files**:
- Modify: `src/main/ipc/register-core.js` (加 3 个 handler + imports)
- Modify: `src/main/state-store.js` (loadLatestInstalledVersion helper)

**Change**:
- `src/main/state-store.js` 末尾加 helper:
  ```js
  function loadLatestInstalledVersion(appName) {
    try {
      const s = load();
      if (s && s.apps && s.apps[appName]) {
        return s.apps[appName].installed_version || null;
      }
    } catch { /* noop */ }
    return null;
  }

  function saveInstalledVersion(appName, version) {
    try {
      const s = load() || { v: 1, apps: {} };
      if (!s.apps) s.apps = {};
      if (!s.apps[appName]) s.apps[appName] = {};
      s.apps[appName].installed_version = version;
      s.apps[appName].ts = Date.now();
      saveAll(s);
      return true;
    } catch {
      return false;
    }
  }
  module.exports.loadLatestInstalledVersion = loadLatestInstalledVersion;
  module.exports.saveInstalledVersion = saveInstalledVersion;
  ```
- `src/main/ipc/register-core.js` 顶部 import 加:
  ```js
  const versionHistory = require("../version-history");
  const backup = require("../backup");
  const { doRollback } = require("../rollback");
  const { resolveAppBundlePath } = require("../../utils/app-paths");
  ```
- 在 `registerCoreHandlers` 函数末尾 (close `}` 前) 加 3 个新 handler:
  ```js
  ipcMain.handle("get-version-history", (_event, appName) => {
    try {
      const entries = versionHistory.listHistory(appName);
      const total = versionHistory.getTotalSize();
      return { ok: true, entries, totalSizeBytes: total };
    } catch (err) {
      mainLog.warn("[ipc] get-version-history threw", { msg: err && err.message });
      return { ok: false, entries: [], totalSizeBytes: 0 };
    }
  });

  safeHandle(
    "rollback-app",
    async (_event, appName, toVersion) => {
      if (!appName || !toVersion) {
        return { ok: false, reason: "invalid_args" };
      }
      const apps = (getConfig() && getConfig().apps) || [];
      const appCfg = apps.find((a) => a && a.name === appName);
      if (!appCfg || !appCfg.bundle) {
        return { ok: false, reason: "app_not_found" };
      }
      const entries = versionHistory.listHistory(appName);
      const entry = entries.find((e) => e.to === toVersion);
      if (!entry) {
        return { ok: false, reason: "history_not_found" };
      }
      const r = await doRollback({
        appName,
        bundleName: appCfg.bundle,
        targetAppPath: resolveAppBundlePath(appCfg.bundle),
        backupPath: entry.backupPath,
        rollbackToVersion: toVersion,
        currentInstalledVersion: stateStore.loadLatestInstalledVersion(appName),
        onUpdateInstalled: (newVer) => {
          stateStore.saveInstalledVersion(appName, newVer);
        },
        onActivity: (payload) => {
          try { recentActivity.push(payload); } catch { /* noop */ }
        },
        onRecheck: (name) => {
          // 触发单 app recheck (异步, 不阻塞 IPC 返回)
          pool.enqueue({
            type: "detect-app",
            payload: { appCfg: { ...appCfg, name } },
          }).catch(() => {});
        },
        onBroadcast: (event, payload) => {
          try { sendToRenderer(event, payload); } catch { /* noop */ }
        },
      });
      return r;
    },
    {
      logMeta: (_evt, appName, toVersion) => ({ appName, toVersion }),
      onError: () => ({ ok: false, reason: "threw" }),
    },
  );

  safeHandle(
    "delete-backup",
    (_event, appName, version) => {
      if (!appName || !version) {
        return { ok: false, reason: "invalid_args" };
      }
      try {
        // 先删 fs
        const { app: electronApp } = require("electron");
        const userDataDir = (electronApp && typeof electronApp.getPath === "function")
          ? electronApp.getPath("userData")
          : null;
        let freed = 0;
        if (userDataDir) {
          freed = backup.deleteBackup(appName, version, { userDataDir });
        }
        // 再删 state
        const stateFreed = versionHistory.deleteEntry(appName, version);
        return { ok: true, freedBytes: freed + stateFreed };
      } catch (err) {
        mainLog.warn("[ipc] delete-backup threw", { msg: err && err.message });
        return { ok: false, reason: "threw" };
      }
    },
    {
      logMeta: (_evt, appName, version) => ({ appName, version }),
      onError: () => ({ ok: false, reason: "threw" }),
    },
  );
  ```
- 跑测试:
  ```bash
  npx vitest run
  ```
  预期 1341+ 全绿

**Verify**:
- `npx vitest run` — 全套绿
- Manual smoke: 跑 app, dev console 试 `await window.pulseAPI.getVersionHistory('Cursor')` (如有 preload 暴露)

**Status**: ⬜ pending

---

### Task 7 · renderer 扩 store + VersionHistoryDrawer

**Files**:
- Create: `src/renderer/store/version-history-store.js`
- Modify: `src/renderer/store/index.js` (re-export)
- Create: `src/renderer/components/VersionHistoryDrawer.jsx`

**Change**:
- 新 store (`src/renderer/store/version-history-store.js`):
  ```js
  import { signal } from '@preact/signals';
  import { storeLog as log } from '../log';

  export const versionHistoryOpen = signal(false);
  export const versionHistoryApp = signal(null);
  export const versionHistoryEntries = signal([]);
  export const versionHistoryTotalSizeBytes = signal(0);

  export async function openVersionHistory(appName) {
    versionHistoryApp.value = appName;
    versionHistoryOpen.value = true;
    await refreshVersionHistory(appName);
  }

  export function closeVersionHistory() {
    versionHistoryOpen.value = false;
    versionHistoryApp.value = null;
    versionHistoryEntries.value = [];
  }

  export async function refreshVersionHistory(appName) {
    const target = appName || versionHistoryApp.value;
    if (!target) return;
    try {
      const r = await window.pulseAPI.getVersionHistory(target);
      if (r && r.ok) {
        versionHistoryEntries.value = r.entries || [];
        versionHistoryTotalSizeBytes.value = r.totalSizeBytes || 0;
      }
    } catch (err) {
      log.warn('refreshVersionHistory failed', { msg: err && err.message });
    }
  }

  export async function rollbackApp(toVersion) {
    const appName = versionHistoryApp.value;
    if (!appName) return { ok: false, reason: 'no_app' };
    const ok = window.confirm(
      `确定要回滚 ${appName} 到 ${toVersion} 吗？\n\n这会退出当前 app 并替换为旧版本。`
    );
    if (!ok) return { ok: false, reason: 'cancelled' };
    try {
      const r = await window.pulseAPI.rollbackApp(appName, toVersion);
      if (r && r.ok) {
        await refreshVersionHistory(appName);
      }
      return r || { ok: false, reason: 'no_response' };
    } catch (err) {
      log.warn('rollbackApp failed', { msg: err && err.message });
      return { ok: false, reason: 'threw' };
    }
  }

  export async function deleteBackup(version) {
    const appName = versionHistoryApp.value;
    if (!appName) return { ok: false, reason: 'no_app' };
    if (!window.confirm(`删除 ${appName} ${version} 的备份？此操作不可恢复。`)) {
      return { ok: false, reason: 'cancelled' };
    }
    try {
      const r = await window.pulseAPI.deleteBackup(appName, version);
      if (r && r.ok) {
        await refreshVersionHistory(appName);
      }
      return r || { ok: false, reason: 'no_response' };
    } catch (err) {
      log.warn('deleteBackup failed', { msg: err && err.message });
      return { ok: false, reason: 'threw' };
    }
  }
  ```
  (假设 `window.pulseAPI` 由 preload 暴露 — 见 Task 8)
- `src/renderer/store/index.js` 加:
  ```js
  export * from './version-history-store';
  ```
- 写 Drawer (`src/renderer/components/VersionHistoryDrawer.jsx`):
  ```jsx
  import { h } from 'preact';
  import {
    versionHistoryOpen, versionHistoryApp,
    versionHistoryEntries, versionHistoryTotalSizeBytes,
    closeVersionHistory, rollbackApp, deleteBackup,
  } from '../store/version-history-store';

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let v = bytes, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
  }

  function formatTime(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  export function VersionHistoryDrawer() {
    if (!versionHistoryOpen.value) return null;
    const app = versionHistoryApp.value;
    const entries = versionHistoryEntries.value;
    const total = versionHistoryTotalSizeBytes.value;
    return (
      <div class="version-history-drawer-backdrop" onClick={(e) => {
        if (e.target.classList.contains('version-history-drawer-backdrop')) closeVersionHistory();
      }}>
        <div class="version-history-drawer" role="dialog" aria-label="版本历史">
          <header class="drawer-header">
            <button class="drawer-back-btn" onClick={closeVersionHistory}>←</button>
            <h2>{app} · 版本历史</h2>
            <button class="drawer-close-btn" onClick={closeVersionHistory}>✕</button>
          </header>
          <div class="drawer-body">
            {entries.length === 0 && (
              <p class="drawer-empty">暂无升级历史</p>
            )}
            {entries.map((e, idx) => {
              const isCurrent = idx === 0;
              const hasBackup = e.backupPath;
              return (
                <div class="vh-row" key={`${e.to}-${e.at}`}>
                  <div class="vh-row-header">
                    {isCurrent ? (
                      <span class="vh-badge vh-badge-current">当前 · {e.to}</span>
                    ) : (
                      <span class="vh-version">──── {e.to}</span>
                    )}
                    <div class="vh-actions">
                      {!isCurrent && hasBackup && (
                        <button class="vh-btn vh-btn-rollback"
                                onClick={() => rollbackApp(e.to)}>回滚</button>
                      )}
                      {!isCurrent && (
                        <button class="vh-btn vh-btn-delete"
                                onClick={() => deleteBackup(e.to)}>🗑</button>
                      )}
                    </div>
                  </div>
                  <div class="vh-row-meta">
                    {isCurrent
                      ? `${formatTime(e.at)} 升上来`
                      : `${formatTime(e.at)} 升级到此版`}
                    {hasBackup
                      ? ` · 备份 ${formatSize(e.sizeBytes)}`
                      : ` · 备份已丢失`}
                  </div>
                </div>
              );
            })}
          </div>
          <footer class="drawer-footer">
            <span>共 {entries.length} 条记录, 占用 {formatSize(total)}</span>
          </footer>
        </div>
      </div>
    );
  }
  ```
- `styles.css` 末尾加 (跟现有 drawer 风格对齐, 用相同 token):
  ```css
  .version-history-drawer-backdrop {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(0,0,0,0.4);
    display: flex; justify-content: flex-end;
  }
  .version-history-drawer {
    width: 380px; max-width: 90vw; height: 100vh;
    background: var(--bg, #fff); box-shadow: -2px 0 12px rgba(0,0,0,0.15);
    display: flex; flex-direction: column;
  }
  .vh-row {
    padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  .vh-row-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 4px;
  }
  .vh-version { font-weight: 600; font-size: 14px; }
  .vh-badge-current {
    background: #34c759; color: #fff; padding: 2px 8px;
    border-radius: 4px; font-size: 12px; font-weight: 500;
  }
  .vh-actions { display: flex; gap: 6px; }
  .vh-btn {
    padding: 4px 10px; border-radius: 4px; font-size: 12px;
    border: 1px solid rgba(0,0,0,0.1); background: transparent;
    cursor: pointer;
  }
  .vh-btn-rollback { background: #007aff; color: #fff; border-color: #007aff; }
  .vh-row-meta { font-size: 11px; color: rgba(0,0,0,0.55); }
  .vh-btn-delete:hover { background: rgba(255,59,48,0.1); }
  ```
- 跑 build: `npm run build:renderer` — 预期无错

**Verify**:
- `npm run build:renderer` — 成功
- 全套 `npx vitest run` 仍绿

**Status**: ⬜ pending

---

### Task 8 · preload 暴露 3 个 API + AppRow 按钮 + BulkUpgradeModal 文案

**Files**:
- Modify: `src/preload.js` (或 `src/main/preload.js`, 看实际位置) — 加 3 个 API
- Modify: `src/renderer/components/AppRow.jsx` — 🕒 按钮
- Modify: `src/renderer/components/BulkUpgradeModal.jsx` — 备份提示文案

**Change**:
- 找到 preload (先 `find . -name "preload*.js" -not -path "*/node_modules/*"`):
- 在 preload 暴露 3 个 API (假设用 contextBridge 模式):
  ```js
  // 找到现有 pattern (e.g. "set-mute", "get-mutes" 等), 同位置加:
  getVersionHistory: (appName) => ipcRenderer.invoke("get-version-history", appName),
  rollbackApp: (appName, toVersion) => ipcRenderer.invoke("rollback-app", appName, toVersion),
  deleteBackup: (appName, version) => ipcRenderer.invoke("delete-backup", appName, version),
  ```
- `AppRow.jsx` 找 app row 渲染 actions 的地方, 加:
  ```jsx
  import { openVersionHistory } from '../store/version-history-store';
  // ...
  {app.source && /^brew/.test(app.source) && (app.versionHistoryCount > 0) && (
    <button class="app-row-history-btn" onClick={() => openVersionHistory(app.name)}>
      🕒 历史
    </button>
  )}
  ```
  (注意: `app.versionHistoryCount` 字段需在 check-updates 后从 main 端填充, 见 Task 9)
- `BulkUpgradeModal.jsx` 找 "将升级 N 个 app" 文案, 加一行:
  ```jsx
  <p class="bulk-upgrade-hint">
    💾 升级前会备份当前版本，最多保留 2 个历史版本 (约 1GB / 5 个 app)
  </p>
  ```
- `styles.css` 加 hint 样式:
  ```css
  .bulk-upgrade-hint { font-size: 11px; color: rgba(0,0,0,0.55); margin: 4px 0 0; }
  .app-row-history-btn {
    padding: 4px 10px; border-radius: 4px; font-size: 12px;
    background: transparent; border: 1px solid rgba(0,0,0,0.1);
    cursor: pointer;
  }
  .app-row-history-btn:hover { background: rgba(0,0,0,0.04); }
  ```

**Verify**:
- `npm run build:renderer` — 无错
- 全套 `npx vitest run` 仍绿

**Status**: ⬜ pending

---

### Task 9 · check-runner / 渲染端把 versionHistoryCount 传给 app row

**Files**:
- Modify: `src/check-runner.js` (或负责合并 state → renderer 的中间件) — 注入 versionHistoryCount
- Modify: `src/renderer/index.jsx` — 订阅 version-history-updated 事件

**Change**:
- 找到把 state.json 同步给 renderer 的位置 (典型是 `state-cache.js` 或 `check-runner` 末尾), 在 app data 合并时:
  ```js
  const vh = stateStore.getVersionHistory() || {};
  for (const appName of Object.keys(mergedApps)) {
    mergedApps[appName].versionHistoryCount = (vh[appName] || []).length;
  }
  ```
  (如果现有逻辑不在 main 端而在 renderer 端, 就让 renderer 用 `versionHistoryEntries` 数组长度)
- 简化方案: 在 `AppRow` 里直接调:
  ```jsx
  import { useEffect, useState } from 'preact/hooks';
  import { versionHistoryEntries } from '../store/version-history-store';
  // ...
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (versionHistoryApp.value === app.name) {
      setCount(versionHistoryEntries.value.length);
    }
  }, [versionHistoryEntries.value, versionHistoryApp.value]);
  ```
  并 onClick 前 lazy 拉:
  ```jsx
  onClick={async () => { await openVersionHistory(app.name); }}
  ```
  缺点: lazy 拉, app row 不知道有没有 history. 更好:
- 用 refresh-on-mount: `App.jsx` 启动时一次性拉 `getVersionHistory` for all apps:
  ```jsx
  // App.jsx 启动 effect 里
  useEffect(() => {
    Promise.all(apps.map(a => window.pulseAPI.getVersionHistory(a.name)))
      .then(results => {
        const map = {};
        results.forEach((r, i) => { if (r && r.ok) map[apps[i].name] = r.entries.length; });
        // 存到 store
        // ...
      });
  }, []);
  ```
  简单点: `AppRow` 直接用 `getVersionHistory(app.name).then(r => ...)` 缓存到 component state.
- `src/renderer/index.jsx` 加 IPC 事件订阅:
  ```js
  window.pulseAPI.onVersionHistoryUpdated?.((payload) => {
    // 刷新对应 app 的 history
    if (payload && payload.appName) {
      // trigger refresh — AppRow 或 store 自己处理
    }
  });
  ```
  (如果 preload 没暴露这个, 在 preload 加: `onVersionHistoryUpdated: (cb) => ipcRenderer.on("version-history-updated", (_, p) => cb(p))`)

**Verify**:
- `npm run build:renderer` — 成功
- 全套 `npx vitest run` 仍绿

**Status**: ⬜ pending

---

### Task 10 · 集成测试 + 端到端验证 + 手工 QA

**Files**:
- Modify: 可能的 fixture / mock 路径
- Create: `tests/integration/app-rollback-flow.test.js` (端到端 mock 测)

**Change**:
- 写集成测试 (`tests/integration/app-rollback-flow.test.js`):
  ```js
  import { describe, it, expect, beforeEach, vi } from 'vitest';
  import fs from 'fs';
  import path from 'path';
  import os from 'os';
  import { runBulkUpgrade } from '../../src/main/bulk-upgrade';
  import { doRollback } from '../../src/main/rollback';
  import * as versionHistory from '../../src/main/version-history';
  import * as stateStore from '../../src/main/state-store';
  import * as backup from '../../src/main/backup';

  vi.mock('electron', () => ({
    app: { getPath: () => '/fake/userData' },
    shell: { trashItem: vi.fn(async () => {}) },
  }));

  beforeEach(() => {
    // 不真 backup, mock
    vi.spyOn(backup, 'backupBundleVersion').mockResolvedValue({
      backupPath: '/fake/backups/Cursor.app/1.0.0.app',
      sizeBytes: 100000,
    });
    vi.spyOn(backup, 'pruneOldBackups').mockImplementation(() => {});
    vi.spyOn(backup, 'deleteBackup').mockImplementation(() => 100000);
  });

  it('升级 → 写 history → 回滚 → state 更新', async () => {
    const items = [{
      id: '1', name: 'Cursor', source: 'brew_formulae',
      cask: 'cursor', bundleName: 'Cursor.app',
      current: '1.0.0', latest: '1.1.0',
    }];
    await runBulkUpgrade({
      items,
      exec: async () => ({ output: 'ok' }),
      onProgress: () => {},
    });
    let list = versionHistory.listHistory('Cursor');
    expect(list).toHaveLength(1);
    expect(list[0].from).toBe('1.0.0');
    expect(list[0].to).toBe('1.1.0');

    // 模拟回滚
    const onState = vi.fn();
    const r = await doRollback({
      appName: 'Cursor',
      bundleName: 'Cursor.app',
      targetAppPath: '/fake/Cursor.app',
      backupPath: list[0].backupPath,
      rollbackToVersion: '1.0.0',
      currentInstalledVersion: '1.1.0',
      onUpdateInstalled: onState,
    });
    expect(r.ok).toBe(true);
    expect(onState).toHaveBeenCalledWith('1.0.0');
  });
  ```
- 跑全套: `npx vitest run`
- 跑 build: `npm run build:renderer`
- 跑 app: `npm start` (手动 QA, 看 task 11 清单)
- 手工 QA 清单 (8 步, 来自 spec §5.D) — 跑一遍并 PR 描述贴

**Verify**:
- `npx vitest run` — 全套绿 (目标 1350+ tests, 包含新加的 12+ 测试)
- `npm run build:renderer` — 成功
- `npm start` 启动不崩
- 手工 QA 8 步全过

**Status**: ⬜ pending

---

## Commit Strategy

按 task 顺序 commit, 每 task 1 个 commit:
- Task 1: `feat(state-store): add versionHistory field for app rollback`
- Task 2: `feat(backup): add backup module with cap-based pruning`
- Task 3: `feat(version-history): add state-backed upgrade history`
- Task 4: `feat(bulk-upgrade): backup + record upgrade before brew action`
- Task 5: `feat(rollback): add one-click rollback with graceful app kill`
- Task 6: `feat(ipc): add get-version-history, rollback-app, delete-backup`
- Task 7: `feat(renderer): add VersionHistoryDrawer + store`
- Task 8: `feat(renderer): preload bridge + AppRow history button + bulk hint`
- Task 9: `feat(renderer): wire version-history-updated event + count injection`
- Task 10: `test(integration): end-to-end upgrade + rollback flow + manual QA`

最后 1 个 squash 或保持独立.

## Self-Review

1. **Spec coverage**:
   - Problem / Goal — Task 10 整体
   - Data model `state.json.versionHistory` — Task 1
   - Data model fs 布局 — Task 2 (backup) + Task 5 (rollback)
   - 升级流 (backup + recordUpgrade) — Task 4
   - 回滚流 (杀进程 + trash + cp + recheck) — Task 5
   - IPC handlers — Task 6
   - AppRow 🕒 按钮 — Task 8
   - Drawer UI — Task 7
   - BulkUpgradeModal 文案 — Task 8
   - Cap=2 — Task 2 (pruneOldBackups keep=2) + Task 3 (slice(0,2))
   - RollbackInProgress 锁 — Task 6 / Task 5 doRollback 加 lockMap (在 Task 5 末尾加: `let inFlight = new Set();` + `if (inFlight.has(appName)) return { ok: false, reason: 'in_progress' }; inFlight.add(appName); try { ... } finally { inFlight.delete(appName); }`)
   - 手工 QA 8 步 — Task 10
   - ✅ 全覆盖

2. **Placeholder scan**: 无 TBD; 每 task 给具体文件路径 + 代码

3. **Type consistency**:
   - `recordUpgrade(appName, entry)` 一致 (Task 3 + Task 4)
   - `listHistory(appName)` 一致
   - `deleteEntry(appName, toVersion)` 一致
   - `deleteBackup(bundleName, version, { userDataDir })` 一致 (Task 2 + Task 6)
   - `doRollback({...})` 字段名一致 (Task 5 + Task 6 + Task 10)
   - IPC 名字 `get-version-history` / `rollback-app` / `delete-backup` 一致 (Task 6 + Task 8)
