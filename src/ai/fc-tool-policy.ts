/**
 * FC 工具调用策略 — UI 跳转意图时强制 tool call.
 */
import { ASSISTANT_UI_TOOLS } from "../shared/pulse-href";
import type { UiInferContext } from "../shared/pulse-href";
import {
  extractFcPageContext,
  resolveToolNamesForPage,
  type AssistantPageCtx,
} from "../shared/assistant-page-tools";
import { wantsUiTool } from "../shared/pulse-infer-registry";
import {
  TOOL_NAMES,
  toAnthropicTools,
  toOpenAiTools,
} from "./assistant-tools-schema";

export type FcToolPolicy = {
  forceUiTool: boolean;
  openAiToolChoice: "auto" | "required";
  anthropicToolChoice: { type: "auto" } | { type: "any" };
  uiToolNames: string[];
  pageProfile?: string;
  allowedToolCount: number;
};

function filterToolsByNames<T extends { name?: string; function?: { name?: string } }>(
  tools: T[],
  allowed: Set<string>,
): T[] {
  return tools.filter((t) => {
    const name = t.function?.name ?? t.name;
    return typeof name === "string" && allowed.has(name);
  });
}

function resolveAllowedToolNames(
  uiCtx: UiInferContext,
  pageCtx?: AssistantPageCtx,
): Set<string> {
  const pageAllowed = pageCtx?.activeNav
    ? resolveToolNamesForPage(pageCtx)
    : null;

  if (wantsUiTool(uiCtx)) {
    const uiNames = new Set<string>();
    for (const n of ASSISTANT_UI_TOOLS) {
      if (!pageAllowed || pageAllowed.has(n)) uiNames.add(n);
    }
    return uiNames;
  }

  if (!pageAllowed) return new Set(TOOL_NAMES);
  const out = new Set<string>();
  for (const n of pageAllowed) {
    if (TOOL_NAMES.has(n)) out.add(n);
  }
  return out;
}

export function resolveFcToolPolicy(
  uiCtx: UiInferContext,
  pageCtx?: AssistantPageCtx,
): FcToolPolicy {
  const forceUiTool = wantsUiTool(uiCtx);
  const allowed = resolveAllowedToolNames(uiCtx, pageCtx);
  return {
    forceUiTool,
    openAiToolChoice: forceUiTool ? "required" : "auto",
    anthropicToolChoice: forceUiTool ? { type: "any" } : { type: "auto" },
    uiToolNames: [...ASSISTANT_UI_TOOLS],
    pageProfile: pageCtx?.activeNav,
    allowedToolCount: allowed.size,
  };
}

export function buildOpenAiFcRequest(
  messages: Array<{ role: string; content: string }>,
  uiCtx: UiInferContext,
  opts: {
    model: string;
    temperature?: number;
    max_tokens?: number;
    pageCtx?: AssistantPageCtx;
  },
) {
  const policy = resolveFcToolPolicy(uiCtx, opts.pageCtx);
  const allowed = resolveAllowedToolNames(uiCtx, opts.pageCtx);
  const tools = filterToolsByNames(toOpenAiTools(), allowed);
  return {
    model: opts.model,
    messages,
    tools,
    tool_choice: policy.openAiToolChoice,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.max_tokens ?? 8192,
    policy,
  };
}

export function buildAnthropicFcRequest(
  messages: Array<{ role: string; content: string }>,
  uiCtx: UiInferContext,
  opts: {
    model: string;
    temperature?: number;
    max_tokens?: number;
    pageCtx?: AssistantPageCtx;
  },
) {
  const policy = resolveFcToolPolicy(uiCtx, opts.pageCtx);
  const allowed = resolveAllowedToolNames(uiCtx, opts.pageCtx);
  const tools = filterToolsByNames(toAnthropicTools(), allowed);
  const systemMsgs = messages.filter((m) => m.role === "system");
  const chatMsgs = messages.filter((m) => m.role !== "system");
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.max_tokens ?? 8192,
    temperature: opts.temperature ?? 0.3,
    messages: chatMsgs,
    tools,
    tool_choice: policy.anthropicToolChoice,
  };
  if (systemMsgs.length > 0) {
    body.system = systemMsgs.map((m) => m.content).join("\n\n");
  }
  return { body, policy };
}

export { extractFcPageContext, type AssistantPageCtx };
