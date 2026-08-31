// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type { IpcMain, Shell } from "electron";

const { ipcMain, shell }: { ipcMain: IpcMain; shell: Shell } = require("electron");
import * as stateStore from "../state-store";
import { mainLog } from "../log";
import * as aiStorage from "../../ai-sessions/storage";
import { readEntryFull } from "../vault/secret-vault";
import { CloudSummarizer, PROVIDER_ENDPOINTS } from "../../ai-sessions/provider-cloud";
import { HttpClient } from "../http-client";
import { resolveSharedAiConfig } from "../../ai/shared-llm";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcChannelMap } from "../../shared/ipc-contracts";

const { runAssistantAgent } = require("../../ai/assistant-agent.js");
const {
  beginChatSession,
  cancelChatSession,
  endChatSession,
} = require("../../ai/chat-session.js");

function localDateKey(offsetDays = 0) {
  const t = Date.now() - (offsetDays | 0) * 86400_000;
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

export function registerAiHandlers(ctx: any) {
  const { safeHandle, sendToRenderer } = ctx;

  function getAiTasksWiring() {
    return (globalThis as any).__pulse_aiTasks || null;
  }

  safeHandle(
    "ai-tasks:list",
    async (
      _event: unknown,
      opts: IpcChannelMap["ai-tasks:list"]["args"][0],
    ) => {
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
    {
      logMeta: (
        _evt: unknown,
        opts: IpcChannelMap["ai-tasks:list"]["args"][0],
      ) => ({ dateKey: opts && opts.dateKey }),
    },
  );

  safeHandle(
    "ai-tasks:summarize",
    async (
      _event: unknown,
      opts: IpcChannelMap["ai-tasks:summarize"]["args"][0],
    ) => {
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
          ? opts.taskKeys.filter((k: any) => typeof k === "string" && k.length > 0)
          : [];
      if (taskKeys.length === 0) {
        return { ok: false, reason: "no_tasks_selected" };
      }
      const r = await wiring.engine.summarizeTasks(taskKeys, {
        dateKey,
        now: Date.now(),
        onTaskDone: (event: any) => {
          sendToRenderer("ai-task-summary-updated", { dateKey, ...event });
        },
      });
      return { ok: r.ok, dateKey, results: r.results, failures: r.failures };
    },
    {
      logMeta: (
        _evt: unknown,
        opts: IpcChannelMap["ai-tasks:summarize"]["args"][0],
      ) => ({ dateKey: opts && opts.dateKey }),
    },
  );

  safeHandle(
    "ai-sessions:open-session",
    async (
      _event: unknown,
      target: IpcChannelMap["ai-sessions:open-session"]["args"][0],
    ) => {
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
    { logMeta: (_evt: unknown, target: IpcChannelMap["ai-sessions:open-session"]["args"][0]) => ({ target }) },
  );

  safeHandle(
    "ai-sessions:set-key",
    async (
      _event: unknown,
      providerId: IpcChannelMap["ai-sessions:set-key"]["args"][0],
      apiKey: IpcChannelMap["ai-sessions:set-key"]["args"][1],
    ) => {
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
    { logMeta: (_evt: unknown, providerId: IpcChannelMap["ai-sessions:set-key"]["args"][0]) => ({ providerId }) },
  );

  safeHandle(
    "ai-sessions:clear-key",
    async (
      _event: unknown,
      providerId: IpcChannelMap["ai-sessions:clear-key"]["args"][0],
    ) => {
      if (typeof providerId !== "string" || !/^[a-z0-9_-]+$/i.test(providerId)) {
        return { ok: false, reason: "invalid_providerId" };
      }
      const r = aiStorage.clearApiKey(providerId);
      return { ok: true, cleared: r };
    },
    { logMeta: (_evt: unknown, providerId: IpcChannelMap["ai-sessions:clear-key"]["args"][0]) => ({ providerId }) },
  );

  // v2.83: 从密钥库引用 key → 主进程直接把密文解密后写入 ai-keys, renderer 不经手明文
  safeHandle(
    "ai-sessions:use-vault-key",
    async (
      _event: unknown,
      payload: IpcChannelMap["ai-sessions:use-vault-key"]["args"][0],
    ) => {
      const providerId = payload && typeof payload === "object" ? payload.providerId : null;
      const vaultId = payload && typeof payload === "object" ? payload.vaultId : null;
      if (typeof providerId !== "string" || !/^[a-z0-9_-]+$/i.test(providerId)) {
        return { ok: false, reason: "invalid_providerId" };
      }
      if (typeof vaultId !== "string" || !vaultId) {
        return { ok: false, reason: "invalid_vaultId" };
      }
      const full = readEntryFull(vaultId);
      if (!full || !full.value) {
        return { ok: false, reason: "vault_entry_unreadable" };
      }
      const r = aiStorage.saveApiKey(providerId, full.value);
      if (!r) {
        return { ok: false, reason: "safeStorage_unavailable" };
      }
      mainLog.info(`[ipc] ai-sessions:use-vault-key ok provider=${providerId}`);
      return { ok: true };
    },
    { logMeta: (_evt: unknown, payload: any) => ({ providerId: payload && payload.providerId }) },
  );

  ipcMain.handle(
    "ai-sessions:has-key",
    async (
      _event: IpcMainInvokeEvent,
      providerId: IpcChannelMap["ai-sessions:has-key"]["args"][0],
    ) => {
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
    // ponytail: hasApiKeyFile 从未 export；loadApiKey 已覆盖“有文件且能解密”。
    const hasKey = Boolean(aiStorage.loadApiKey(providerId));
    return {
      ok: true,
      hasKey,
      decryptOk: hasKey,
      available: true,
    };
    },
  );

  ipcMain.handle(
    "ai-sessions:healthcheck",
    async (
      _event: IpcMainInvokeEvent,
      opts: IpcChannelMap["ai-sessions:healthcheck"]["args"][0],
    ) => {
    const stateCfg = stateStore.loadAISessionsConfig();
    const providerId =
      opts && typeof opts.providerId === "string"
        ? opts.providerId
        : "deepseek";

    if (!(PROVIDER_ENDPOINTS as any)[providerId]) {
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
    } catch (err: any) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    },
  );

  safeHandle("ai-sessions:get-config", async () => {
    const cfg = stateStore.loadAISessionsConfig();
    return { ok: true, config: cfg };
  });

  safeHandle(
    "ai-sessions:save-config",
    async (
      _event: unknown,
      cfg: IpcChannelMap["ai-sessions:save-config"]["args"][0],
    ) => {
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
      const baseCfg = (globalThis as any).__pulse_aiSessionsBaseCfg || {
        enabled: false,
        provider: "minimax",
        cloud: null,
      };
      const { buildTaskSummaryEngine } = require("../../ai-sessions/wiring.js");
      const wiring = buildTaskSummaryEngine({
        config: baseCfg,
        runtimeOverride: stateStore.loadAISessionsConfig(),
        log: {
          info: (...a: any) => (mainLog as any).info(...a),
          warn: (...a: any) => (mainLog as any).warn(...a),
          error: (...a: any) => (mainLog as any).error(...a),
        },
      });
      (globalThis as any).__pulse_aiTasks = wiring;
    } catch (e: any) {
      mainLog.warn("[ipc] ai-sessions:save-config failed to rebuild wiring", {
        msg: e instanceof Error ? e.message : String(e),
      });
    }

    return { ok: true, config: next.ai_sessions_config || null };
    },
  );

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

  safeHandle(
    "ai:chat",
    async (
      _event: unknown,
      opts: IpcChannelMap["ai:chat"]["args"][0],
    ) => {
      const messages = opts && Array.isArray(opts.messages) ? opts.messages : [];
      if (messages.length === 0) {
        return { ok: false, reason: "empty_messages" };
      }
      const ctx = (opts && opts.context) || {};
      const wantStream = Boolean(opts && opts.stream);
      const session = beginChatSession();
      try {
        const result = await runAssistantAgent(messages, {
          activeNav: typeof ctx.activeNav === "string" ? ctx.activeNav : undefined,
          route: typeof ctx.route === "string" ? ctx.route : undefined,
          pageSnapshot:
            typeof ctx.pageSnapshot === "string" ? ctx.pageSnapshot : undefined,
          pageData:
            ctx.pageData && typeof ctx.pageData === "object"
              ? (ctx.pageData as Record<string, unknown>)
              : undefined,
        }, {
          searchIndex: (globalThis as any).__pulse_searchIndex || null,
          fundScheduler: (globalThis as any).__pulse_fundScheduler || null,
          pageData:
            ctx.pageData && typeof ctx.pageData === "object"
              ? (ctx.pageData as Record<string, unknown>)
              : undefined,
          model:
            typeof opts.model === "string" && opts.model.trim()
              ? opts.model.trim()
              : undefined,
          onDelta: wantStream
            ? (delta: string) => sendToRenderer("ai:chat-delta", { delta })
            : undefined,
          onStatus: (status: string) =>
            sendToRenderer("ai:chat-status", { status }),
          isAborted: session.isAborted,
          onAbortRegister: session.setAbortHandler,
        });
        if (session.isAborted()) {
          return { ok: false, reason: "cancelled" };
        }
        return result;
      } finally {
        endChatSession(session.id);
      }
    },
    {
      logMeta: (
        _evt: unknown,
        opts: IpcChannelMap["ai:chat"]["args"][0],
      ) => ({ messageCount: opts && opts.messages ? opts.messages.length : 0 }),
    },
  );

  safeHandle("ai:chat-cancel", async () => {
    cancelChatSession();
    return { ok: true };
  });
}

module.exports = { registerAiHandlers };
