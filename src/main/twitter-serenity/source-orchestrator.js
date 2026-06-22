/**
 * src/main/twitter-serenity/source-orchestrator.js
 *
 * 镜像轮换 orchestrator (spec §5.2).
 *   - 按 priority 顺序试 enabled source
 *   - 每个 source 记 lastSuccessAt + consecutiveFailures
 *   - 失败 ≥ cooldownThreshold 次 → 冷却 cooldownMs 内跳过
 *   - 全失败 → cacheStore.setDegraded(); 累计 ≥ degradedThreshold → onDegraded()
 *   - 成功 → cacheStore.resetDegraded()
 */

function createOrchestrator(deps) {
  const sources = deps.sources.slice();
  const cacheStore = deps.cacheStore;
  const onDegraded = deps.onDegraded || (() => {});
  const logger = deps.logger || {
    info() {},
    warn() {},
    error() {},
  };
  const degradedThreshold = deps.degradedThreshold || 3;
  const cooldownThreshold = deps.cooldownThreshold || 3;
  const cooldownMs = deps.cooldownMs || 30 * 60 * 1000;
  // 单个 source fetch 总超时 (ms). HttpClient 的 socket timeout 不覆盖 DNS/握手阶段,
  // 镜像不可达时会无限挂起; 这层保证快速失败以触发 degraded 路径.
  const perSourceTimeoutMs = deps.perSourceTimeoutMs || 12000;

  // runtime health per source
  const health = new Map();
  for (const s of sources) {
    health.set(s.id, {
      id: s.id,
      consecutiveFailures: 0,
      lastSuccessAt: 0,
      cooldownUntil: 0,
    });
  }

  function isCoolingDown(sid, now = Date.now()) {
    const h = health.get(sid);
    if (!h) return false;
    return h.cooldownUntil > now;
  }

  async function fetch(handleArg) {
    const now = Date.now();
    let success = false;
    let successMirror = null;
    let tweets = [];

    // enabled + 不在冷却期, 按 priority 升序
    const sorted = sources
      .slice()
      .sort((a, b) => (a.priority || 99) - (b.priority || 99));

    for (const src of sorted) {
      if (src.enabled === false) continue;
      if (isCoolingDown(src.id, now)) {
        logger.info(`[orchestrator] skip ${src.id} (cooldown)`);
        continue;
      }
      try {
        // HttpClient 的 req.setTimeout 只覆盖 socket inactivity, DNS/TCP 握手
        // 阶段挂起时不触发 (镜像不可达时 fetch 无限等待, 永不 degraded).
        // 这里包一层总超时, 保证单个 source 最多 perSourceTimeoutMs 后失败.
        const raw = await Promise.race([
          src.fetchUserTimeline(handleArg),
          new Promise((_resolve, reject) => {
            setTimeout(
              () => reject(new Error(`source ${src.id} timeout`)),
              perSourceTimeoutMs,
            );
          }),
        ]);
        if (Array.isArray(raw)) {
          const hh = health.get(src.id);
          hh.consecutiveFailures = 0;
          hh.lastSuccessAt = now;
          hh.cooldownUntil = 0;
          tweets = raw;
          successMirror = src.id;
          success = true;
          logger.info(
            `[orchestrator] ${src.id} fetched ${raw.length} tweets`,
          );
          break;
        }
      } catch (err) {
        const hh = health.get(src.id);
        hh.consecutiveFailures += 1;
        if (hh.consecutiveFailures >= cooldownThreshold) {
          hh.cooldownUntil = now + cooldownMs;
        }
        logger.warn(
          `[orchestrator] ${src.id} failed: ${err && err.message} (streak ${hh.consecutiveFailures})`,
        );
        continue;
      }
    }

    if (success) {
      cacheStore.resetDegraded();
      return { ok: true, tweets, successMirror, degraded: false };
    }

    // 全失败
    const count = cacheStore.setDegraded();
    const degraded = count >= degradedThreshold;
    if (degraded) {
      try {
        onDegraded();
      } catch (e) {
        logger.error(`[orchestrator] onDegraded threw: ${e.message}`);
      }
    }
    return {
      ok: false,
      tweets: [],
      successMirror: null,
      degraded,
      failureCount: count,
    };
  }

  function getHealth() {
    return sources.map((s) => ({
      ...health.get(s.id),
      enabled: s.enabled !== false,
    }));
  }

  return { fetch, getHealth };
}

module.exports = { createOrchestrator };
