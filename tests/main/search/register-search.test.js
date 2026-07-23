/**
 * tests/main/search/register-search.test.js
 * A3: IPC 薄包装测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerSearchIpc } from '../../../src/main/ipc/register-search.ts';

describe('register-search IPC', () => {
  let ipcMain;
  let handles;
  let searchIndex;

  beforeEach(() => {
    handles = {};
    ipcMain = {
      handle: vi.fn((channel, handler) => { handles[channel] = handler; }),
    };
    searchIndex = {
      query: vi.fn(() => ({ results: [], counts: { news: 0, 'ai-task': 0, reminder: 0, fund: 0, app: 0 } })),
      upsert: vi.fn(),
      buildFromState: vi.fn(),
    };
  });

  it('registers search:query / search:upsert / search:rebuild channels', () => {
    registerSearchIpc({ ipcMain, searchIndex });
    expect(ipcMain.handle).toHaveBeenCalledWith('search:query', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('search:upsert', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('search:rebuild', expect.any(Function));
  });

  it('search:query calls searchIndex.query with parsed args', async () => {
    registerSearchIpc({ ipcMain, searchIndex });
    await handles['search:query']({}, { q: 'Cursor', source: 'news' });
    expect(searchIndex.query).toHaveBeenCalledWith('Cursor', { source: 'news' });
  });

  it('search:query handles missing q gracefully', async () => {
    registerSearchIpc({ ipcMain, searchIndex });
    const out = await handles['search:query']({}, {});
    expect(searchIndex.query).toHaveBeenCalledWith('', { source: null });
    expect(out.results).toEqual([]);
  });

  it('search:upsert calls searchIndex.upsert', async () => {
    registerSearchIpc({ ipcMain, searchIndex });
    const doc = { id: 'news:1', source: 'news', nativeId: '1', title: 'x', snippet: '', searchText: 'x', payload: {} };
    await handles['search:upsert']({}, doc);
    expect(searchIndex.upsert).toHaveBeenCalledWith(doc);
  });

  it('search:rebuild calls buildFromState with state', async () => {
    const stateStore = { load: vi.fn(() => ({ apps: { X: {} } })) };
    registerSearchIpc({ ipcMain, searchIndex, stateStore });
    await handles['search:rebuild']({});
    expect(searchIndex.buildFromState).toHaveBeenCalledWith({ apps: { X: {} } });
  });
});
