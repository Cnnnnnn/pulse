/**
 * tests/main/release-notes-state.test.js
 *
 * ON: state.json 新字段 last_seen_release 读写.
 * 走 stateStore 现有 API (load / patchState), 测读写 + 老 state 兼容.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import {
  initStateStorePaths,
  _setStatePathForTest,
  loadOrRecover,
  getLastSeenRelease,
  setLastSeenRelease,
} from '../../src/main/state-store.js';

let tmpDir;
let statePath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-rn-state-'));
  statePath = path.join(tmpDir, 'state.json');
  _setStatePathForTest(statePath);
  initStateStorePaths(statePath);
});

describe('last_seen_release', () => {
  it('returns null when state.json does not exist', () => {
    expect(getLastSeenRelease()).toBeNull();
  });

  it('returns null when state.json exists but has no last_seen_release', () => {
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: {}, mutes: {} }));
    loadOrRecover();
    expect(getLastSeenRelease()).toBeNull();
  });

  it('round-trips set → get + persists to disk', () => {
    setLastSeenRelease('2.32.0', 1750000000000);
    expect(getLastSeenRelease()).toEqual({ version: '2.32.0', at: 1750000000000 });

    // 重新模拟进程重启: 重新指向同一文件即可 (无 in-memory 缓存)
    _setStatePathForTest(statePath);
    initStateStorePaths(statePath);
    expect(getLastSeenRelease()).toEqual({ version: '2.32.0', at: 1750000000000 });
  });
});
