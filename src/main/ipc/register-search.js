/**
 * src/main/ipc/register-search.js
 *
 * A3: 搜索 IPC 薄包装. 业务在 searchIndex, 这里只做参数解析 + 错误兜底.
 *
 * Channels:
 *   search:query   { q, source? } → { results, counts }
 *   search:upsert  Doc → void
 *   search:rebuild → void  (诊断用, 从 stateStore 重读重建)
 */

function registerSearchIpc(deps) {
  const { ipcMain, searchIndex, stateStore } = deps;

  ipcMain.handle('search:query', async (event, args) => {
    try {
      const a = args || {};
      return searchIndex.query(a.q || '', { source: a.source || null });
    } catch (err) {
      return { results: [], counts: { news: 0, 'ai-task': 0, reminder: 0, fund: 0, app: 0 } };
    }
  });

  ipcMain.handle('search:upsert', async (event, doc) => {
    try {
      if (doc && doc.id) searchIndex.upsert(doc);
    } catch {
      /* noop */
    }
  });

  ipcMain.handle('search:rebuild', async () => {
    try {
      const state = (stateStore && typeof stateStore.load === 'function') ? stateStore.load() : null;
      searchIndex.buildFromState(state);
    } catch {
      /* noop */
    }
  });
}

module.exports = { registerSearchIpc };
