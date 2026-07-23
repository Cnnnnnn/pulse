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
  _setStatePathForTest,
  loadOrRecover,
  getLastSeenRelease,
  setLastSeenRelease,
} from '../../src/main/state-store.ts';

let tmpDir;
let statePath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-rn-state-'));
  statePath = path.join(tmpDir, 'state.json');
  // 只用 _setStatePathForTest. initStateStorePaths() 在 vitest 环境会把路径
  // 重置回 LEGACY_STATE_PATH, 覆盖我们设的 tmpDir 路径.
  _setStatePathForTest(statePath);
});

describe('last_seen_release', () => {
  it('returns null when state.json does not exist', () => {
    // tmpDir 是新创建的, state.json 不存在
    expect(fs.existsSync(statePath)).toBe(false);
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

    // 重新模拟进程重启: store 是无状态的 (每次 load 都读盘),
    // 重新指向同一文件即可. 注意不能调 initStateStorePaths() —
    // 它在 vitest 环境里 _tryGetUserDataDir() 返回空, 会把路径重置回 LEGACY_STATE_PATH,
    // 覆盖我们设的 tmpDir.
    _setStatePathForTest(statePath);
    expect(getLastSeenRelease()).toEqual({ version: '2.32.0', at: 1750000000000 });
  });
});
