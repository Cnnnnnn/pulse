/**
 * 助手 UI trace + 点踩 eval 候选（localStorage，仅本地）.
 */
import type { AssistantAction } from "../../ai/assistant-prompt";
import {
  formatEvalCandidatesBlock,
  summarizeEvalCandidates,
} from "../../ai/assistant-eval-export";
import type { UiActionPipelineResult } from "../../ai/assistant-ui-eval";
import type { UiInferContext } from "../../shared/pulse-href";

const TRACE_KEY = "pulse-assistant-ui-trace";
const EVAL_CANDIDATES_KEY = "pulse-assistant-eval-candidates";
const MAX_TRACE_EVENTS = 120;
const MAX_EVAL_CANDIDATES = 40;

export type UiTraceEventKind = "model_ui_tool" | "infer_fallback" | "claim_repair";

export type UiTraceEvent = {
  ts: number;
  kind: UiTraceEventKind;
  userText: string;
  activeNav?: string;
  modelUi?: AssistantAction | null;
  finalUi?: AssistantAction | null;
};

export type UiTraceStats = {
  totalTurns: number;
  modelUiTool: number;
  inferFallback: number;
  claimRepair: number;
  inferFallbackRate: number;
};

export type EvalCandidate = {
  id: string;
  ts: number;
  userText: string;
  assistantText: string;
  activeNav?: string;
  modelActions: AssistantAction[];
  pipeline: Pick<
    UiActionPipelineResult,
    "modelUi" | "finalUi" | "inferFallback" | "claimRepair"
  >;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ponytail: quota 满时静默丢弃 */
  }
}

function trimRing<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  return items.slice(items.length - max);
}

export function classifyUiTraceEvent(
  pipeline: UiActionPipelineResult,
): UiTraceEventKind {
  if (pipeline.claimRepair) return "claim_repair";
  if (pipeline.inferFallback) return "infer_fallback";
  return "model_ui_tool";
}

export function recordUiTurnTrace(
  userText: string,
  pipeline: UiActionPipelineResult,
  context?: Pick<UiInferContext, "activeNav" | "assistantText">,
): UiTraceEvent {
  const event: UiTraceEvent = {
    ts: Date.now(),
    kind: classifyUiTraceEvent(pipeline),
    userText: userText.trim(),
    activeNav: context?.activeNav,
    modelUi: pipeline.modelUi,
    finalUi: pipeline.finalUi,
  };
  const prev = readJson<UiTraceEvent[]>(TRACE_KEY, []);
  writeJson(TRACE_KEY, trimRing([...prev, event], MAX_TRACE_EVENTS));
  return event;
}

export function listUiTraceEvents(): UiTraceEvent[] {
  return readJson<UiTraceEvent[]>(TRACE_KEY, []);
}

export function clearUiTraceEvents(): void {
  try {
    localStorage.removeItem(TRACE_KEY);
  } catch {
    /* ignore */
  }
}

export function summarizeUiTrace(
  events: UiTraceEvent[] = listUiTraceEvents(),
): UiTraceStats {
  let modelUiTool = 0;
  let inferFallback = 0;
  let claimRepair = 0;
  for (const e of events) {
    if (e.kind === "model_ui_tool") modelUiTool++;
    else if (e.kind === "infer_fallback") inferFallback++;
    else if (e.kind === "claim_repair") claimRepair++;
  }
  const totalTurns = events.length;
  const inferFallbackRate =
    totalTurns > 0 ? inferFallback / totalTurns : 0;
  return {
    totalTurns,
    modelUiTool,
    inferFallback,
    claimRepair,
    inferFallbackRate,
  };
}

export function formatUiTraceSummary(
  stats: UiTraceStats,
  evalCandidates = 0,
): string {
  if (stats.totalTurns === 0) {
    return evalCandidates > 0 ? `Eval 候选 ${evalCandidates}` : "";
  }
  const pct = Math.round(stats.inferFallbackRate * 100);
  let line = `UI ${stats.totalTurns}轮 · 兜底 ${stats.inferFallback}(${pct}%)`;
  if (stats.claimRepair > 0) {
    line += ` · 修复 ${stats.claimRepair}`;
  }
  if (evalCandidates > 0) {
    line += ` · 候选 ${evalCandidates}`;
  }
  return line;
}

export function formatUiTraceTitle(
  stats: UiTraceStats,
  evalCandidates = 0,
): string {
  const lines = [
    "UI 跳转统计（最近 120 轮，跨会话）",
    `模型调工具: ${stats.modelUiTool}`,
    `规则兜底: ${stats.inferFallback} (${Math.round(stats.inferFallbackRate * 100)}%)`,
    `正文声称修复: ${stats.claimRepair}`,
  ];
  if (evalCandidates > 0) {
    lines.push(`点踩 Eval 候选: ${evalCandidates}（localStorage）`);
  }
  lines.push("兜底占比越低，模型越可靠");
  return lines.join("\n");
}

export function appendEvalCandidate(candidate: EvalCandidate): void {
  const prev = readJson<EvalCandidate[]>(EVAL_CANDIDATES_KEY, []);
  const withoutDup = prev.filter((c) => c.id !== candidate.id);
  writeJson(
    EVAL_CANDIDATES_KEY,
    trimRing([...withoutDup, candidate], MAX_EVAL_CANDIDATES),
  );
}

export function listEvalCandidates(): EvalCandidate[] {
  return readJson<EvalCandidate[]>(EVAL_CANDIDATES_KEY, []);
}

export function clearEvalCandidates(): void {
  try {
    localStorage.removeItem(EVAL_CANDIDATES_KEY);
  } catch {
    /* ignore */
  }
}

export function removeEvalCandidateByTs(ts: number): void {
  const prev = readJson<EvalCandidate[]>(EVAL_CANDIDATES_KEY, []);
  writeJson(
    EVAL_CANDIDATES_KEY,
    prev.filter((c) => c.ts !== ts),
  );
}

export function exportEvalCandidatesText(): string {
  return formatEvalCandidatesBlock(listEvalCandidates());
}

export { summarizeEvalCandidates };

export function buildEvalCandidateId(userText: string, ts: number): string {
  const slug = userText.trim().slice(0, 24).replace(/\s+/g, "_");
  return `${ts}-${slug || "msg"}`;
}

export function captureEvalCandidateFromDownvote(input: {
  userText: string;
  assistantText: string;
  modelActions: AssistantAction[];
  pipeline: UiActionPipelineResult;
  activeNav?: string;
  ts?: number;
}): EvalCandidate | null {
  const userText = input.userText.trim();
  const assistantText = input.assistantText.trim();
  if (!userText || !assistantText) return null;
  const ts = input.ts ?? Date.now();
  const candidate: EvalCandidate = {
    id: buildEvalCandidateId(userText, ts),
    ts,
    userText,
    assistantText,
    activeNav: input.activeNav,
    modelActions: input.modelActions,
    pipeline: {
      modelUi: input.pipeline.modelUi,
      finalUi: input.pipeline.finalUi,
      inferFallback: input.pipeline.inferFallback,
      claimRepair: input.pipeline.claimRepair,
    },
  };
  appendEvalCandidate(candidate);
  return candidate;
}
