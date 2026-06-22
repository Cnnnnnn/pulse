/**
 * src/main/food/food-cache.js
 *
 * Per-location in-memory cache for nearby food queries.
 *
 * ponytail: 单进程 in-memory Map, LRU 简单实现. 单用户单进程够用.
 * 升级路径: 若未来需要跨进程共享 (如主进程 fork worker), 换 LRU-cache npm 包.
 */

function createFoodCache(opts = {}) {
  const defaultTtlMs = opts.ttlMs ?? 30 * 60 * 1000; // 30min
  const maxEntries = opts.maxEntries ?? 100;
  const _store = new Map(); // key → { value, expiresAt }

  function _evictIfFull() {
    while (_store.size > maxEntries) {
      const oldestKey = _store.keys().next().value;
      _store.delete(oldestKey);
    }
  }

  function get(key) {
    const entry = _store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      _store.delete(key);
      return null;
    }
    // 标记为最近使用 (move to end of Map)
    _store.delete(key);
    _store.set(key, entry);
    return entry.value;
  }

  function set(key, value, ttlMs) {
    const ttl = ttlMs ?? defaultTtlMs;
    const entry = { value, expiresAt: Date.now() + ttl };
    _store.set(key, entry);
    _evictIfFull();
  }

  function del(key) {
    _store.delete(key);
  }

  function clear() {
    _store.clear();
  }

  function size() {
    return _store.size;
  }

  return { get, set, delete: del, clear, size };
}

module.exports = { createFoodCache };
