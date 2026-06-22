/**
 * src/main/twitter-serenity/index.js
 *
 * Serenity 模块入口: 组装 source/orchestrator/cache/translator/scheduler,
 * 暴露 startTwitterSerenity(deps) / stopTwitterSerenity() + IPC handlers.
 *
 * spec §3.1 第 4 层 (IPC bridge) + 第 3 层 (main process) 的接线点.
 */

const { HttpClient } = require("../http-client");
const stateStore = require("../state-store");
const { createNitterSource } = require("./sources/nitter-source");
const { createRsshubSource } = require("./sources/rsshub-source");
const { createDirectRssSource } = require("./sources/direct-rss-source");
const { createOrchestrator } = require("./source-orchestrator");
const { createCacheStore } = require("./cache-store");
const { createTranslator } = require("./translator");
const { createScheduler } = require("./scheduler");
const { normalizeTweet } = require("./tweet-source");
const { parseManualPaste } = require("./manual-paste-parser");
const sharedLlm = require("../../ai/shared-llm.js");

const HANDLE = "aleabitoreddit";

const SOURCE_FACTORIES = {
  nitter: createNitterSource,
  rsshub: createRsshubSource,
  rss: createDirectRssSource,
};

let runtime = null;

function buildSources(config, httpClient) {
  return config.map((cfg) => {
    const factory = SOURCE_FACTORIES[cfg.type] || createDirectRssSource;
    return factory({ ...cfg, httpClient });
  });
}

async function doFetch() {
  if (!runtime) return { ok: false, degraded: false };
  const { orchestrator, cacheStore, ipc } = runtime;
  const r = await orchestrator.fetch(HANDLE);
  if (r.ok && r.tweets.length) {
    const now = new Date().toISOString();
    const normalized = r.tweets.map((t) => normalizeTweet(t, now));
    const cache = cacheStore.mergeAndSave(normalized, {
      lastSuccessMirror: r.successMirror,
    });
    if (ipc && ipc.send) {
      ipc.send("twitter:updated", {
        tweets: cache.tweets.slice(0, 50),
        lastFetchedAt: cache.lastFetchedAt,
      });
    }
    return { ok: true, tweets: normalized, degraded: false };
  }
  if (r.degraded && ipc && ipc.send) {
    ipc.send("twitter:degraded", { failureCount: r.failureCount });
  }
  return { ok: false, degraded: r.degraded, failureCount: r.failureCount };
}

function startTwitterSerenity(deps) {
  if (runtime) return runtime;
  const logger = deps.logger || console;
  const httpClient = deps.httpClient || new HttpClient();
  const sourcesConfig = stateStore.loadTwitterSources();
  const sources = buildSources(sourcesConfig, httpClient);
  const cacheStore = createCacheStore({ stateStore });
  const translator = createTranslator({ sharedLlm, logger });
  const orchestrator = createOrchestrator({
    sources,
    cacheStore,
    handle: HANDLE,
    logger,
    onDegraded: () => {
      if (deps.sendEvent) deps.sendEvent("twitter:degraded", {});
    },
  });
  const scheduler = createScheduler({ fetchFn: doFetch, logger });

  // 先建 runtime (doFetch / IPC 闭包会引用它)
  runtime = { orchestrator, cacheStore, translator, scheduler, ipc: deps, logger };

  scheduler.start();

  // IPC handlers (deps.ipcMain 存在时注册)
  if (deps.ipcMain) {
    deps.ipcMain.handle("twitter:list", () => {
      const cache = cacheStore.load();
      return {
        tweets: cache.tweets.slice(0, 100),
        lastFetchedAt: cache.lastFetchedAt,
        degraded: cache.consecutiveFailureCount >= 3,
      };
    });
    deps.ipcMain.handle("twitter:fetch", async () => scheduler.triggerNow());
    deps.ipcMain.handle("twitter:translate", async (_e, tweet) => {
      try {
        const zh = await translator.translateTweet(tweet);
        return { ok: true, id: tweet.id, zh };
      } catch (err) {
        return { ok: false, id: tweet.id, error: err.message };
      }
    });
    deps.ipcMain.handle("twitter:sources:list", () =>
      stateStore.loadTwitterSources(),
    );
    deps.ipcMain.handle("twitter:sources:add", (_e, src) => {
      const list = stateStore.loadTwitterSources();
      list.push(src);
      stateStore.saveTwitterSources(list);
      return { ok: true };
    });
    deps.ipcMain.handle("twitter:sources:remove", (_e, id) => {
      const list = stateStore
        .loadTwitterSources()
        .filter((s) => s.id !== id);
      stateStore.saveTwitterSources(list);
      return { ok: true };
    });
    deps.ipcMain.handle("twitter:sources:test", async (_e, src) => {
      try {
        const factory = SOURCE_FACTORIES[src.type] || createDirectRssSource;
        const tmp = factory({ ...src, httpClient });
        const t0 = Date.now();
        const tweets = await tmp.fetchUserTimeline(HANDLE);
        return {
          ok: true,
          durationMs: Date.now() - t0,
          count: tweets.length,
          preview: tweets[0] || null,
        };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
    deps.ipcMain.handle("twitter:manual-paste", async (_e, text) => {
      const parsed = parseManualPaste(text);
      if (parsed.results.length) {
        const now = new Date().toISOString();
        const normalized = parsed.results.map((t) => normalizeTweet(t, now));
        cacheStore.mergeAndSave(normalized);
      }
      return parsed;
    });
  }

  return runtime;
}

function stopTwitterSerenity() {
  if (!runtime) return;
  try {
    runtime.scheduler.stop();
  } catch {
    /* noop */
  }
  runtime = null;
}

module.exports = {
  startTwitterSerenity,
  stopTwitterSerenity,
  HANDLE,
  doFetch,
  buildSources, // 导出便于测试
};
