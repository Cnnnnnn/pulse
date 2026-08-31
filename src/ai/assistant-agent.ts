/**
 * src/ai/assistant-agent.ts
 *
 * AI 助手 Agent 循环：LLM → 工具 → 再 LLM 综合（最多 4 轮）.
 */
import { chatCompletion, resolveSharedAiConfig } from "./shared-llm";
import { chatCompletionStream } from "./chat-stream";
import { chatWithTools } from "./chat-with-tools";
import {
  buildAssistantSystemPrompt,
  parseAssistantActions,
  stripActionTags,
  type AssistantAction,
} from "./assistant-prompt";
import { executeMainTool, splitActions, type ToolResult } from "./assistant-tools";
import { formatToolStatusMessage } from "../shared/assistant-tool-labels";
import { trimMessagesForLlmAsync } from "./chat-truncate-llm";
import {
  appendFcToolResults,
  type FcRoundMeta,
} from "./chat-fc-followup";
import {
  pickFastModel,
  shouldUseFastAssistantPath,
  lastUserText,
} from "./assistant-model-route";
import { ensureUiActions, assistantTextBeforeLastUser } from "./assistant-nav-infer";
import { extractFcPageContext } from "./fc-tool-policy";
export type AgentDeps = {
  searchIndex?: any;
  fundScheduler?: any;
  pageData?: Record<string, unknown>;
  model?: string;
  onDelta?: (delta: string) => void;
  onStatus?: (status: string) => void;
  isAborted?: () => boolean;
  onAbortRegister?: (fn: () => void) => void;
};

export type AgentResult = {
  ok: boolean;
  text?: string;
  reason?: string;
  error?: string;
  actions?: AssistantAction[];
  toolResults?: Array<{
    tool: string;
    summary: string;
    items?: ToolResult["items"];
  }>;
};

export type AgentContext = {
  activeNav?: string;
  route?: string;
  pageSnapshot?: string;
  pageData?: Record<string, unknown>;
};

export const MAX_ROUNDS = 4;

function finalizeRendererActions(
  history: Array<{ role: string; content: string }>,
  actions: AssistantAction[],
  assistantText = "",
  activeNav?: string,
): AssistantAction[] {
  return ensureUiActions(lastUserText(history), actions, {
    priorAssistantText: assistantTextBeforeLastUser(history),
    assistantText,
    activeNav,
  });
}

function formatToolResultsForLlm(results: ToolResult[]): string {
  return results
    .map((r) => `[${r.tool}]\n${r.summary}`)
    .join("\n\n");
}

function resolveAgentModel(deps: AgentDeps, providerId?: string): string | undefined {
  const raw = deps.model;
  if (!raw) return undefined;
  if (raw === "__fast__" && providerId) {
    return pickFastModel(providerId) || undefined;
  }
  return raw;
}

async function callLlmRound0(
  llmMessages: Array<Record<string, unknown>>,
  ctx: AgentContext | undefined,
  deps: AgentDeps,
  history: Array<{ role: string; content: string }>,
): Promise<{
  ok: boolean;
  text?: string;
  actions: AssistantAction[];
  fcMeta?: FcRoundMeta;
  reason?: string;
  error?: string;
}> {
  if (deps.isAborted?.()) {
    return { ok: false, reason: "cancelled", actions: [] };
  }
  const fc = await chatWithTools(
    llmMessages as Array<{ role: string; content: string }>,
    {
      isAborted: deps.isAborted,
      onAbortRegister: deps.onAbortRegister,
      model: deps.model,
      onDelta: deps.onDelta,
      uiInferContext: {
        userText: lastUserText(history),
        priorAssistantText: assistantTextBeforeLastUser(history),
        activeNav: ctx?.activeNav,
      },
      pageCtx: extractFcPageContext(ctx?.pageData, {
        activeNav: ctx?.activeNav,
        route: ctx?.route,
      }),
    },
  );
  if (fc.ok) {
    const rawText = fc.text || "";
    const actions =
      fc.toolCalls && fc.toolCalls.length > 0
        ? fc.toolCalls
        : parseAssistantActions(rawText);
    return {
      ok: true,
      text: rawText,
      actions,
      fcMeta: fc.fcMeta,
    };
  }

  if (deps.isAborted?.()) {
    return { ok: false, reason: "cancelled", actions: [] };
  }

  // FC 请求失败 → 降级纯文本协议：换回 <action> XML 版 system prompt。
  // 沿用 FC 版 prompt 的话模型只有 FC 说明却没有 tools 参数可发，
  // 只会回一句"好的，我帮你查…"式的开场白然后无路可走。
  const plainThread = llmMessages.map((m, i) =>
    i === 0
      ? {
          role: "system",
          content: buildAssistantSystemPrompt({
            activeNav: ctx?.activeNav,
            route: ctx?.route,
            pageSnapshot: ctx?.pageSnapshot,
            useFunctionCalling: false,
          }),
        }
      : m,
  );
  const llm = deps.onDelta
    ? await chatCompletionStream(plainThread, {
        model: deps.model,
        onDelta: deps.onDelta,
        isAborted: deps.isAborted,
        onAbortRegister: deps.onAbortRegister,
      })
    : await chatCompletion(plainThread, { model: deps.model });
  if (!llm.ok) {
    return { ok: false, reason: llm.reason, error: llm.error, actions: [] };
  }
  const rawText = llm.text || "";
  return { ok: true, text: rawText, actions: parseAssistantActions(rawText) };
}

async function runMainToolsParallel(
  actions: AssistantAction[],
  deps: AgentDeps,
): Promise<ToolResult[]> {
  if (actions.length > 0) {
    deps.onStatus?.(formatToolStatusMessage(actions.map((a) => a.tool)));
  }
  const results = await Promise.all(
    actions.map(async (action) => {
      if (deps.isAborted?.()) return null;
      return executeMainTool(action, {
        searchIndex: deps.searchIndex,
        fundScheduler: deps.fundScheduler,
        pageData: deps.pageData,
      });
    }),
  );
  return results.filter((r): r is ToolResult => r != null);
}

export async function runAssistantAgent(
  messages: Array<{ role: string; content: string }>,
  ctx: AgentContext | undefined,
  deps: AgentDeps = {},
): Promise<AgentResult> {
  const history = await trimMessagesForLlmAsync(
    messages.filter(
      (m) =>
        m &&
        typeof m.content === "string" &&
        (m.role === "user" || m.role === "assistant"),
    ),
    { isAborted: deps.isAborted },
  );

  const resolved = resolveSharedAiConfig();
  const sessionModel = resolveAgentModel(
    deps,
    resolved.ok ? (resolved.providerId as string) : undefined,
  );
  const agentDeps: AgentDeps = sessionModel
    ? { ...deps, model: sessionModel }
    : deps;

  if (resolved.ok && !sessionModel) {
    const fastModel = pickFastModel(resolved.providerId as string);
    if (
      shouldUseFastAssistantPath(
        history,
        resolved.model as string,
        fastModel,
      )
    ) {
      const systemPrompt = buildAssistantSystemPrompt({
        activeNav: ctx?.activeNav,
        route: ctx?.route,
        pageSnapshot: ctx?.pageSnapshot,
        useFunctionCalling: false,
      });
      const llmThread = [
        { role: "system", content: systemPrompt },
        ...history,
      ];
      const llm = agentDeps.onDelta
        ? await chatCompletionStream(llmThread, {
            model: fastModel,
            onDelta: agentDeps.onDelta,
            isAborted: agentDeps.isAborted,
            onAbortRegister: agentDeps.onAbortRegister,
          })
        : await chatCompletion(llmThread, { model: fastModel });
      if (!llm.ok) {
        return { ok: false, reason: llm.reason, error: llm.error };
      }
      if (agentDeps.isAborted?.()) {
        return { ok: false, reason: "cancelled" };
      }
      return {
        ok: true,
        text: stripActionTags(llm.text || ""),
      };
    }
  }

  const systemPrompt = buildAssistantSystemPrompt({
    activeNav: ctx?.activeNav,
    route: ctx?.route,
    pageSnapshot: ctx?.pageSnapshot,
    useFunctionCalling: true,
  });

  let llmThread: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    ...history,
  ];

  const allToolResults: AgentResult["toolResults"] = [];
  const allRendererActions: AssistantAction[] = [];
  let finalText = "";
  let pendingFcMeta: FcRoundMeta | undefined;
  let pendingFcText = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (agentDeps.isAborted?.()) {
      return { ok: false, reason: "cancelled", toolResults: allToolResults };
    }

    const useStream = Boolean(agentDeps.onDelta) && round > 0;

    let rawText = "";
    let actions: AssistantAction[] = [];

    if (round === 0) {
      const r0 = await callLlmRound0(llmThread, ctx, agentDeps, history);
      if (!r0.ok) {
        return {
          ok: false,
          reason: r0.reason,
          error: r0.error,
          toolResults: allToolResults.length > 0 ? allToolResults : undefined,
        };
      }
      rawText = r0.text || "";
      actions = r0.actions;
      pendingFcMeta = r0.fcMeta;
      pendingFcText = rawText;
    } else {
      const llm = useStream
        ? await chatCompletionStream(llmThread, {
            model: agentDeps.model,
            onDelta: agentDeps.onDelta,
            isAborted: agentDeps.isAborted,
            onAbortRegister: agentDeps.onAbortRegister,
          })
        : await chatCompletion(llmThread, { model: agentDeps.model });

      if (!llm.ok) {
        return {
          ok: false,
          reason: llm.reason,
          error: llm.error,
          toolResults: allToolResults.length > 0 ? allToolResults : undefined,
        };
      }
      rawText = llm.text || "";
      actions = parseAssistantActions(rawText);
    }

    if (agentDeps.isAborted?.()) {
      return {
        ok: false,
        reason: "cancelled",
        text: stripActionTags(rawText),
        actions: finalizeRendererActions(
          history,
          allRendererActions,
          stripActionTags(rawText),
          ctx?.activeNav,
        ),
        toolResults: allToolResults,
      };
    }

    finalText = stripActionTags(rawText);
    const { main, renderer } = splitActions(actions);
    allRendererActions.push(...renderer);

    if (main.length === 0) {
      return {
        ok: true,
        text: finalText,
        actions: finalizeRendererActions(
          history,
          allRendererActions,
          stripActionTags(rawText),
          ctx?.activeNav,
        ),
        toolResults: allToolResults.length > 0 ? allToolResults : undefined,
      };
    }

    const roundResults = await runMainToolsParallel(main, agentDeps);
    for (const r of roundResults) {
      allToolResults.push({
        tool: r.tool,
        summary: r.summary,
        items: r.items,
      });
    }

    if (round === MAX_ROUNDS - 1) {
      const suffix = roundResults.length > 0
        ? `\n\n${formatToolResultsForLlm(roundResults)}`
        : "";
      return {
        ok: true,
        text: finalText + suffix,
        actions: finalizeRendererActions(
          history,
          allRendererActions,
          stripActionTags(rawText),
          ctx?.activeNav,
        ),
        toolResults: allToolResults,
      };
    }

    if (pendingFcMeta && pendingFcMeta.toolCalls.length > 0) {
      llmThread = appendFcToolResults(
        llmThread,
        pendingFcMeta,
        roundResults,
        pendingFcText,
      );
      pendingFcMeta = undefined;
      pendingFcText = "";
    } else {
      llmThread.push({ role: "assistant", content: finalText || "正在查询…" });
      llmThread.push({
        role: "user",
        content:
          `[工具查询结果]\n${formatToolResultsForLlm(roundResults)}\n\n请基于以上数据用简体中文回答用户。不要重复输出 action 标签，除非还需要执行新的操作。`,
      });
    }
  }

  return {
    ok: true,
    text: finalText,
    actions: finalizeRendererActions(history, allRendererActions, finalText, ctx?.activeNav),
    toolResults: allToolResults.length > 0 ? allToolResults : undefined,
  };
}

module.exports = { runAssistantAgent, MAX_ROUNDS };
