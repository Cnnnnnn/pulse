/**
 * src/main/wechat-hot/cache.js
 *
 * 内存 cache + in-flight guard.
 * 不写 state.json (spec §3 YAGNI).
 *
 * 设计原则:
 *   - 工厂 createWechatHotCache({ fetcher, onUpdate }), 无副作用
 *   - load() 返最近一次成功 payload (浅拷, 防外部 mutate 内部 state)
 *   - refresh() 调 fetcher, 成功写 cache + 通知 onUpdate, 失败不写
 *   - in-flight guard: 并发 refresh 共享同一个 promise, 不双 fetch
 *   - 失败后 in-flight 释放, 下次 refresh 会重新 fetch
 */

const EMPTY = { items: [], fetchedAt: 0, source: "xxapi" };

/**
 * @param {object} args
 * @param {(opts: object) => Promise<{items, fetchedAt, source}>} args.fetcher
 * @param {(payload) => void} [args.onUpdate]  — refresh 成功时回调
 */
function createWechatHotCache({ fetcher, onUpdate } = {}) {
  let cache = { ...EMPTY };
  let inflight = null;

  function load() {
    return { ...cache, items: [...cache.items] };
  }

  async function refresh() {
    if (inflight) return inflight;
    if (typeof fetcher !== "function") {
      throw Object.assign(new Error("fetcher missing"), { reason: "fetch_failed" });
    }
    inflight = (async () => {
      try {
        const payload = await fetcher({});
        if (!payload || !Array.isArray(payload.items)) {
          throw Object.assign(new Error("bad payload"), { reason: "parse_failed" });
        }
        cache = { items: payload.items, fetchedAt: payload.fetchedAt || Date.now(), source: payload.source || "xxapi" };
        if (typeof onUpdate === "function") {
          try { onUpdate(cache); } catch { /* noop */ }
        }
        return cache;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  return { load, refresh };
}

module.exports = { createWechatHotCache, EMPTY };
