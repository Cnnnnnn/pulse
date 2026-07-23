// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type { IpcMain, Shell } from "electron";

const { ipcMain, shell }: { ipcMain: IpcMain; shell: Shell } = require("electron");
const stateStore = require("../state-store.ts");
const { mainLog } = require("../log.ts");
const aiStorage = require("../../ai-sessions/storage");
const { CloudSummarizer, PROVIDER_ENDPOINTS } = require("../../ai-sessions/provider-cloud");
const { HttpClient } = require("../http-client.ts");
const { resolveSharedAiConfig } = require("../../ai/shared-llm");

function localDateKey(offsetDays = 0) {
  const t = Date.now() - (offsetDays | 0) * 86400_000;
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

function registerAiHandlers(ctx) {
  const { safeHandle, sendToRenderer } = ctx;

  function getAiTasksWiring() {
    return global.__pulse_aiTasks || null;
  }

  safeHandle(
    "ai-tasks:list",
    async (_event, opts) => {
      const wiring = getAiTasksWiring();
      if (!wiring) return { ok: false, reason: "not_initialized" };
      const dateKey =
        opts &&
        typeof opts.dateKey === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(opts.dateKey)
          ? opts.dateKey
          : localDateKey(0);
      const r = await wiring.engine.listTasks(dateKey, { now: Date.now() });
      return { ok: true, ...r };
    },
    { logMeta: (_evt, opts) => ({ dateKey: opts && opts.dateKey }) },
  );

  safeHandle(
    "ai-tasks:summarize",
    async (_event, opts) => {
      const wiring = getAiTasksWiring();
      if (!wiring) return { ok: false, reason: "not_initialized" };
      const dateKey =
        opts &&
        typeof opts.dateKey === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(opts.dateKey)
          ? opts.dateKey
          : localDateKey(0);
      const taskKeys =
        opts && Array.isArray(opts.taskKeys)
          ? opts.taskKeys.filter((k) => typeof k === "string" && k.length > 0)
          : [];
      if (taskKeys.length === 0) {
        return { ok: false, reason: "no_tasks_selected" };
      }
      const r = await wiring.engine.summarizeTasks(taskKeys, {
        dateKey,
        now: Date.now(),
        onTaskDone: (event) => {
          sendToRenderer("ai-task-summary-updated", { dateKey, ...event });
        },
      });
      return { ok: r.ok, dateKey, results: r.results, failures: r.failures };
    },
    { logMeta: (_evt, opts) => ({ dateKey: opts && opts.dateKey }) },
  );

  safeHandle(
    "ai-sessions:open-session",
    async (_event, target) => {
      if (typeof target !== "string" || target.length === 0) {
        return { ok: false, reason: "invalid_target" };
      }
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) {
        await shell.openExternal(target);
        return { ok: true, mode: "external" };
      }
      if (target.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(target)) {
        const err = await shell.openPath(target);
        if (err) return { ok: false, reason: "openPath_failed", error: err };
        return { ok: true, mode: "openPath" };
      }
      return { ok: false, reason: "unrecognized_target" };
    },
    { logMeta: (_evt, target) => ({ target }) },
  );

  safeHandle(
    "ai-sessions:set-key",
    async (_event, providerId, apiKey) => {
      if (typeof providerId !== "string" || !/^[a-z0-9_-]+$/i.test(providerId)) {
        return { ok: false, reason: "invalid_providerId" };
      }
      if (typeof apiKey !== "string" || apiKey.length === 0) {
        return { ok: false, reason: "invalid_apiKey" };
      }
      const r = aiStorage.saveApiKey(providerId, apiKey);
      if (!r) {
        return { ok: false, reason: "safeStorage_unavailable" };
      }
      mainLog.info(`[ipc] ai-sessions:set-key ok provider=${providerId}`);
      return { ok: true };
    },
    { logMeta: (_evt, providerId) => ({ providerId }) },
  );

  safeHandle(
    "ai-sessions:clear-key",
    async (_event, providerId) => {
      if (typeof providerId !== "string" || !/^[a-z0-9_-]+$/i.test(providerId)) {
        return { ok: false, reason: "invalid_providerId" };
      }
      const r = aiStorage.clearApiKey(providerId);
      return { ok: true, cleared: r };
    },
    { logMeta: (_evt, providerId) => ({ providerId }) },
  );

  ipcMain.handle("ai-sessions:has-key", async (_event, providerId) => {
    if (typeof providerId !== "string" || !/^[a-z0-9_-]+$/i.test(providerId)) {
      return {
        ok: false,
        hasKey: false,
        available: false,
        reason: "invalid_providerId",
      };
    }
    const available = aiStorage.isAvailable();
    if (!available) {
      return { ok: true, hasKey: false, available: false };
    }
    const hasKey = Boolean(aiStorage.loadApiKey(providerId));
    const hasFile =
      typeof aiStorage.hasApiKeyFile === "function"
        ? aiStorage.hasApiKeyFile(providerId)
        : hasKey;
    return {
      ok: true,
      hasKey: hasKey || hasFile,
      decryptOk: hasKey,
      available: true,
    };
  });

  ipcMain.handle("ai-sessions:healthcheck", async (_event, opts) => {
    const stateCfg = stateStore.loadAISessionsConfig();
    const providerId =
      opts && typeof opts.providerId === "string"
        ? opts.providerId
        : "deepseek";

    if (!PROVIDER_ENDPOINTS[providerId]) {
      return { ok: false, error: "unsupported_providerId" };
    }

    const apiKey =
      opts && typeof opts.apiKey === "string" && opts.apiKey.length > 0
        ? opts.apiKey
        : (() => {
            try {
              return aiStorage.loadApiKey(providerId);
            } catch {
              return null;
            }
          })();
    if (!apiKey) return { ok: false, error: "api_key_missing" };

    const model =
      opts && typeof opts.model === "string" && opts.model.length > 0
        ? opts.model
        : (stateCfg && stateCfg.cloud && stateCfg.cloud.model) || "gpt-4o-mini";

    const httpClient = new HttpClient({ timeout: 10_000, maxRetries: 0 });
    const tmp = new CloudSummarizer();
    try {
      return await tmp.healthcheck({
        provider: providerId,
        model,
        httpClient,
        config: {
          providerId,
          model,
          apiKey,
          baseUrl:
            opts && typeof opts.baseUrl === "string" && opts.baseUrl.length > 0
              ? opts.baseUrl
              : undefined,
        },
      });
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  safeHandle("ai-sessions:get-config", async () => {
    const cfg = stateStore.loadAISessionsConfig();
    return { ok: true, config: cfg };
  });

  safeHandle("ai-sessions:save-config", async (_event, cfg) => {
    if (cfg != null && typeof cfg !== "object") {
      return { ok: false, reason: "invalid_config" };
    }
    const next = stateStore.saveAISessionsConfig(cfg);
    sendToRenderer("ai-sessions-config-updated", {
      config: next.ai_sessions_config || null,
    });
    mainLog.info(
      `[ipc] ai-sessions:save-config ok enabled=${cfg && cfg.enabled} provider=${cfg && cfg.provider}`,
    );

    try {
      const baseCfg = global.__pulse_aiSessionsBaseCfg || {
        enabled: false,
        provider: "minimax",
        cloud: null,
      };
      const { buildTaskSummaryEngine } = require("../../ai-sessions/wiring");
      const wiring = buildTaskSummaryEngine({
        config: baseCfg,
        runtimeOverride: stateStore.loadAISessionsConfig(),
        log: {
          info: (...a) => mainLog.info(...a),
          warn: (...a) => mainLog.warn(...a),
          error: (...a) => mainLog.error(...a),
        },
      });
      global.__pulse_aiTasks = wiring;
    } catch (e) {
      mainLog.warn("[ipc] ai-sessions:save-config failed to rebuild wiring", {
        msg: e && e.message,
      });
    }

    return { ok: true, config: next.ai_sessions_config || null };
  });

  safeHandle(
    "ai:get-shared-config",
    async () => {
      const cfg = stateStore.loadAISessionsConfig();
      const resolved = resolveSharedAiConfig();
      return {
        ok: true,
        config: cfg,
        ready: resolved.ok,
        reason: resolved.ok ? null : resolved.reason,
        providerId: resolved.providerId || null,
        model: resolved.model || null,
      };
    },
    { log: false },
  );
}

module.exports = { registerAiHandlers };
