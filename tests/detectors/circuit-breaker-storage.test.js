/**
 * tests/detectors/circuit-breaker-storage.test.js
 *
 * DEVIATION FROM TASK 2 PLAN (2026-06-19-detector-circuit-breaker-plan.md):
 * 原计划用 `vi.mock('../../src/main/state-store.js', () => ({ ... }))` 静态
 * mock. 但 vitest 1.6 的 vi.mock 只 hook ESM `import` 路径, 不 hook CJS
 * `require` 路径 (vitest-dev/vitest#5359). circuit-breaker-storage.js 是
 * CJS, 内部用 `require('../main/state-store.js')`, vi.mock 替换不生效,
 * storage 拿到的还是真实 state-store, 测试全失败.
 *
 * 改用项目已有的 require.cache 注入模式 (见 tests/main/tray.test.js
 * P4 注释 "vitest 1.x 的 CJS require 走 vite module graph, require.cache
 * stub 注入对 vite 视角不生效..." — tray.test.js 是 CJS 内 require
 * electron, 需要独立子进程; 这里 storage 走 require 但模块从 ESM test
 * 加载, vite 视角把它当 ESM 处理, require.cache 注入 *会* 生效, 因为
 * 第一次 require 时 vite 已经把 state-store.js 当 ESM module 加载过,
 * 后续 require 走 node 原生 cache, 而我们注入的 fake export 替换了
 * node 原生 cache entry, 真实 module 不会被执行).
 *
 * 测试用例 6 条 + 行为断言与原计划完全一致.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const mockPatchState = vi.fn();
const mockLoad = vi.fn();

const stateStorePath = require.resolve('../../src/main/state-store.js');
const storagePath = require.resolve('../../src/detectors/circuit-breaker-storage.js');

let loadBreakers;
let saveBreakers;
let upsertBreaker;
let getBreaker;
let removeBreaker;

function loadStorageWithMockedStateStore() {
  delete require.cache[storagePath];
  require.cache[stateStorePath] = {
    id: stateStorePath,
    filename: stateStorePath,
    loaded: true,
    exports: {
      load: mockLoad,
      patchState: mockPatchState,
    },
  };
  const mod = require(storagePath);
  loadBreakers = mod.loadBreakers;
  saveBreakers = mod.saveBreakers;
  upsertBreaker = mod.upsertBreaker;
  getBreaker = mod.getBreaker;
  removeBreaker = mod.removeBreaker;
}

beforeEach(() => {
  mockPatchState.mockReset();
  mockLoad.mockReset();
  loadStorageWithMockedStateStore();
});

afterEach(() => {
  delete require.cache[stateStorePath];
  delete require.cache[storagePath];
});

describe('circuit-breaker-storage', () => {
  it('loadBreakers returns {} when state has no circuitBreakers', async () => {
    mockLoad.mockReturnValue({ v: 1, apps: {} });
    const result = await loadBreakers();
    expect(result).toEqual({});
  });

  it('loadBreakers returns the stored breakers object', async () => {
    mockLoad.mockReturnValue({
      v: 1,
      circuitBreakers: { 'html_changelog:zcode': { state: 'open', openUntil: 12345 } },
    });
    const result = await loadBreakers();
    expect(result).toEqual({
      'html_changelog:zcode': { state: 'open', openUntil: 12345 },
    });
  });

  it('saveBreakers writes via patchState', async () => {
    mockPatchState.mockResolvedValue(undefined);
    await saveBreakers({ 'a:b': { state: 'closed' } });
    expect(mockPatchState).toHaveBeenCalledTimes(1);
    const updater = mockPatchState.mock.calls[0][0];
    const next = updater({ v: 1, ts: 0, apps: {} });
    expect(next.circuitBreakers).toEqual({ 'a:b': { state: 'closed' } });
  });

  it('upsertBreaker merges a single breaker into existing map', async () => {
    mockLoad.mockReturnValue({
      v: 1,
      circuitBreakers: { 'a:b': { state: 'closed' } },
    });
    mockPatchState.mockResolvedValue(undefined);
    await upsertBreaker('c:d', { state: 'open', openUntil: 999 });
    const updater = mockPatchState.mock.calls[0][0];
    const next = updater({});
    expect(next.circuitBreakers).toEqual({
      'a:b': { state: 'closed' },
      'c:d': { state: 'open', openUntil: 999 },
    });
  });

  it('getBreaker returns the breaker for a key, or undefined', async () => {
    mockLoad.mockReturnValue({
      v: 1,
      circuitBreakers: { 'a:b': { state: 'open' } },
    });
    expect(await getBreaker('a:b')).toEqual({ state: 'open' });
    expect(await getBreaker('nope')).toBeUndefined();
  });

  it('removeBreaker drops the entry', async () => {
    mockLoad.mockReturnValue({
      v: 1,
      circuitBreakers: { 'a:b': { state: 'open' }, 'c:d': { state: 'closed' } },
    });
    mockPatchState.mockResolvedValue(undefined);
    await removeBreaker('a:b');
    const updater = mockPatchState.mock.calls[0][0];
    const next = updater({});
    expect(next.circuitBreakers).toEqual({ 'c:d': { state: 'closed' } });
  });
});
