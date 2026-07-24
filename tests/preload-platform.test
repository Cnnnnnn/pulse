/**
 * tests/preload-platform.test.js
 *
 * preload 暴露 platformInfo.platform 给 renderer.
 *
 * electron 包的 contextBridge 在非 renderer 进程不存在, vi.mock('electron') 也
 * 拦不住 (electron 有自定义 interop). 所以这里直接往 require.cache 注入一个
 * stub electron 模块, 让 dist/preload.js (esbuild 从 preload.ts 编译的
 * CommonJS 产物) require('electron') 时拿到我们的 stub.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const exposed = {};
const electronStub = {
  contextBridge: {
    exposeInMainWorld: (name, api) => {
      exposed[name] = api;
    },
  },
  ipcRenderer: { invoke: () => {}, on: () => {} },
};

const electronPath = require.resolve('electron');

describe('preload exposes platformInfo', () => {
  beforeEach(() => {
    // 注入 stub electron
    require.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: electronStub,
    };
  });

  afterEach(() => {
    // 清掉 stub + preload 缓存, 不污染其它测试
    delete require.cache[electronPath];
    const preloadPath = require.resolve('../dist/preload.js');
    delete require.cache[preloadPath];
    for (const k of Object.keys(exposed)) delete exposed[k];
  });

  it('exposeInMainWorld("platformInfo", { platform }) 被调', () => {
    require('../dist/preload.js');
    expect(exposed.platformInfo).toBeDefined();
    expect(typeof exposed.platformInfo.platform).toBe('string');
  });

  it('platformInfo.platform === process.platform', () => {
    require('../dist/preload.js');
    expect(exposed.platformInfo.platform).toBe(process.platform);
  });
});
