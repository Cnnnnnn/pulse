/**
 * src/main/twitter-serenity/cache-store.js
 *
 * Twitter Serenity cache (state.json.twitterCache).
 * LRU 1000 条, 增量合并 (id 主键, 新帖插前, 旧帖更新 metrics).
 * 数据契约见 spec §4.2.
 */

const DEFAULT_HANDLE = "aleabitoreddit";
const LRU_LIMIT = 1000;

/**
 * 合并两批 tweets, 按 id 去重 (spec §4.3 mergeTweets).
 * @param {object[]} existing
 * @param {object[]} incoming
 * @param {number} [limit=1000]
 * @returns {object[]} 合并后 (incoming 的新 id 在前, existing 按 原序跟后, 截断到 limit)
 */
function mergeTweets(existing, incoming, limit = LRU_LIMIT) {
  const existList = Array.isArray(existing) ? existing : [];
  const inList = Array.isArray(incoming) ? incoming : [];
  const existMap = new Map(existList.map((t) => [String(t.id), t]));
  const newOnes = [];
  for (const t of inList) {
    const id = String(t.id);
    if (!existMap.has(id)) {
      newOnes.push(t);
    } else {
      // 更新 metrics (text/publishedAt 不覆盖, 保 cache 原值避免镜像差异)
      const old = existMap.get(id);
      if (t.metrics) old.metrics = t.metrics;
    }
  }
  const merged = [...newOnes, ...existList];
  return merged.slice(0, limit);
}

function createCacheStore(deps) {
  const stateStore = deps.stateStore;

  function load() {
    const cached = stateStore.loadTwitterCache();
    return {
      handle: (cached && cached.handle) || DEFAULT_HANDLE,
      lastFetchedAt: (cached && cached.lastFetchedAt) || null,
      lastSuccessMirror: (cached && cached.lastSuccessMirror) || null,
      consecutiveFailureCount: (cached && cached.consecutiveFailureCount) || 0,
      tweets: cached && Array.isArray(cached.tweets) ? cached.tweets : [],
      translations: (cached && cached.translations) || {},
    };
  }

  function save(cache) {
    stateStore.saveTwitterCache(cache);
  }

  function mergeAndSave(incoming, meta = {}) {
    const cache = load();
    cache.tweets = mergeTweets(cache.tweets, incoming);
    cache.lastFetchedAt = new Date().toISOString();
    if (meta.lastSuccessMirror) {
      cache.lastSuccessMirror = meta.lastSuccessMirror;
      cache.consecutiveFailureCount = 0;
    }
    save(cache);
    return cache;
  }

  function setDegraded() {
    const cache = load();
    cache.consecutiveFailureCount = (cache.consecutiveFailureCount || 0) + 1;
    cache.lastFetchedAt = new Date().toISOString();
    save(cache);
    return cache.consecutiveFailureCount;
  }

  function resetDegraded() {
    const cache = load();
    cache.consecutiveFailureCount = 0;
    save(cache);
  }

  return {
    load,
    save,
    mergeAndSave,
    setDegraded,
    resetDegraded,
    LRU_LIMIT,
  };
}

module.exports = {
  createCacheStore,
  mergeTweets,
  LRU_LIMIT,
  DEFAULT_HANDLE,
};
