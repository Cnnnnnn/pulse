// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type { IpcMain, Shell, BrowserWindow as BrowserWindowType } from "electron";

const { ipcMain, shell, BrowserWindow }: { ipcMain: IpcMain; shell: Shell; BrowserWindow: typeof BrowserWindowType } = require("electron");
import * as stateStore from "../state-store";
import { mainLog } from "../log";
import * as aiStorage from "../../ai-sessions/storage";
import { readEntryFull } from "../vault/secret-vault";
import { CloudSummarizer, PROVIDER_ENDPOINTS } from "../../ai-sessions/provider-cloud";
import { HttpClient } from "../http-client";
import { resolveSharedAiConfig } from "../../ai/shared-llm";
import { createMiniMaxDeltaFilter } from "../../ai/minimax-tool-markup";
import { sanitizePersistedThreads } from "../../ai/assistant-threads-migrate";
import { classifyOpenSessionTarget } from "../security/open-targets";
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
      // 白名单：codex:// / minimax:// → openExternal；会话 transcript 绝对路径
      // (~/.codex|~/.cursor|~/.minimax) → openPath。其余拒绝，防 renderer 注入
      // 后 shell.openPath 任意本地路径 / openExternal 任意 scheme。
      const classified = classifyOpenSessionTarget(target);
      if (!classified) {
        mainLog.warn("[ipc] ai-sessions:open-session rejected target", {
          target:
            typeof target === "string" ? target.slice(0, 200) : typeof target,
        });
        return { ok: false, reason: "target_not_allowed" };
      }
      if (classified.mode === "external") {
        await shell.openExternal(classified.url);
        return { ok: true, mode: "external" };
      }
      const err = await shell.openPath(classified.path);
      if (err) return { ok: false, reason: "openPath_failed", error: err };
      return { ok: true, mode: "openPath" };
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

  safeHandle(
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

  safeHandle(
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
      // #10 熔断状态 + #9 今日用量 — 供助手抽屉状态条展示
      const { getLlmBreakerInfo } = require("../../ai/llm-circuit-breaker");
      const breaker = resolved.ok
        ? getLlmBreakerInfo(resolved.providerId as string)
        : null;
      const spend = stateStore.loadTokenSpend();
      const dayKey = localDateKey(0);
      const todayTokens =
        spend && typeof spend[dayKey] === "number" ? spend[dayKey] : 0;
      return {
        ok: true,
        config: cfg,
        ready: resolved.ok,
        reason: resolved.ok ? null : resolved.reason,
        providerId: resolved.providerId || null,
        model: resolved.model || null,
        breaker,
        todayTokens,
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
      // MiniMax 原生工具标记流式过滤 — 气泡不出现中间态乱码
      const deltaFilter = wantStream ? createMiniMaxDeltaFilter() : null;
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
            ? (delta: string) => {
                const clean = deltaFilter ? deltaFilter.push(delta) : delta;
                if (clean) sendToRenderer("ai:chat-delta", { delta: clean });
              }
            : undefined,
          onStatus: (status: string) =>
            sendToRenderer("ai:chat-status", { status }),
          onToolResults: (toolResults: unknown) =>
            sendToRenderer("ai:chat-tool-results", { toolResults }),
          isAborted: session.isAborted,
          onAbortRegister: session.setAbortHandler,
        });
        if (deltaFilter) {
          const tail = deltaFilter.flush();
          if (tail) sendToRenderer("ai:chat-delta", { delta: tail });
        }
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

  // P3-12: 助手会话持久化备份 (state.json assistantThreads)
  safeHandle("assistant-threads:save", async (_evt: unknown, payload: any) => {
    try {
      if (!payload || !Array.isArray(payload.threads)) {
        return { ok: false, reason: "invalid_payload" };
      }
      stateStore.saveAssistantThreads({
        threads: payload.threads,
        activeId: typeof payload.activeId === "string" ? payload.activeId : null,
      });
      return { ok: true };
    } catch {
      return { ok: false, reason: "save_failed" };
    }
  });

  safeHandle("assistant-threads:load", async () => {
    const { threads, activeId } = stateStore.loadAssistantThreads();
    // 旧版本把 MiniMax 原生工具标记原样持久化过 — 读取时统一清洗
    return {
      ok: true,
      threads: sanitizePersistedThreads(threads),
      activeId,
    };
  });

  // 长期记忆管理 (设置页) — 读写走 assistant-memory 纯模块
  safeHandle(
    "assistant-memory:list",
    async () => {
      const { listMemory } = require("../../ai/assistant-memory");
      return { ok: true, items: listMemory() };
    },
    { log: false },
  );
  safeHandle(
    "assistant-memory:remove",
    async (_evt: unknown, payload: any) => {
      const { removeMemory } = require("../../ai/assistant-memory");
      const sel = payload && typeof payload === "object" ? payload : {};
      return { ok: true, removed: removeMemory(sel) };
    },
    { log: false },
  );
  safeHandle(
    "assistant-memory:clear",
    async () => {
      const { clearMemory } = require("../../ai/assistant-memory");
      clearMemory();
      return { ok: true };
    },
    { log: false },
  );
  // 自动沉淀：抽屉关闭时对最近 user 消息做一次轻量偏好抽取
  safeHandle(
    "assistant-memory:auto-extract",
    async (_evt: unknown, payload: any) => {
      const messages =
        payload && Array.isArray(payload.messages) ? payload.messages : [];
      const { autoExtractMemories } = require("../../ai/assistant-memory-auto");
      try {
        return await autoExtractMemories(messages);
      } catch (err: any) {
        return {
          ok: false,
          added: 0,
          reason: "threw",
          error: err && err.message,
        };
      }
    },
    { log: false },
  );

  // P3-13: 当前页面截图 (供助手多模态附加)
  safeHandle("assistant:screenshot", async (event: any) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) {
        return { ok: false, reason: "no_window" };
      }
      const image = await win.webContents.capturePage();
      if (!image || (typeof image.isEmpty === "function" && image.isEmpty())) {
        return { ok: false, reason: "capture_empty" };
      }
      const buf = image.toPNG();
      if (!buf || buf.length === 0) {
        return { ok: false, reason: "capture_empty" };
      }
      return { ok: true, dataUrl: `data:image/png;base64,${buf.toString("base64")}` };
    } catch (err: any) {
      return { ok: false, reason: "capture_failed", error: err?.message };
    }
  });
}

