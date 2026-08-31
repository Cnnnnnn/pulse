/**
 * 点踩 eval 候选 → golden case 片段导出 / 半自动合并.
 */
import type { AssistantUiEvalCase } from "./assistant-ui-eval";

export type EvalCandidateExport = {
  id: string;
  userText: string;
  assistantText?: string;
  activeNav?: string;
  modelActions?: Array<{ tool: string; params: Record<string, unknown> }>;
  pipeline?: {
    modelUi?: { tool: string; params: Record<string, unknown> } | null;
    finalUi?: { tool: string; params: Record<string, unknown> } | null;
    inferFallback?: boolean;
    claimRepair?: boolean;
  };
};

function slugId(text: string, index: number): string {
  const slug = text
    .trim()
    .slice(0, 24)
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "");
  return `downvote-${index}-${slug || "case"}`;
}

function escapeStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function formatEvalCandidateAsCase(
  c: EvalCandidateExport,
  index: number,
): string {
  const expect = c.pipeline?.finalUi ?? null;
  const expectStr =
    expect === null
      ? "null"
      : `{ tool: "${expect.tool}", params: ${JSON.stringify(expect.params)} }`;
  const tags: string[] = ["downvote"];
  if (c.pipeline?.inferFallback) tags.push("infer_fallback");
  if (c.pipeline?.claimRepair) tags.push("claim");
  if (c.activeNav) tags.push(c.activeNav);

  const contextLines: string[] = [];
  if (c.activeNav) contextLines.push(`activeNav: "${c.activeNav}"`);
  if (c.assistantText) {
    contextLines.push(`assistantText: "${escapeStr(c.assistantText)}"`);
  }
  const contextBlock =
    contextLines.length > 0
      ? `\n    context: { ${contextLines.join(", ")} },`
      : "";

  const modelActions = c.modelActions ?? [];
  const modelBlock =
    modelActions.length > 0
      ? `\n    modelActions: ${JSON.stringify(modelActions)},`
      : "";

  return `  {
    id: "${slugId(c.userText, index)}",
    userText: "${escapeStr(c.userText)}",${modelBlock}${contextBlock}
    expect: ${expectStr},
    tags: [${tags.map((t) => `"${t}"`).join(", ")}],
  }`;
}

export function formatEvalCandidatesBlock(
  candidates: EvalCandidateExport[],
): string {
  if (candidates.length === 0) {
    return "// 暂无 eval 候选";
  }
  const cases = candidates.map((c, i) => formatEvalCandidateAsCase(c, i));
  return [
    "// 粘贴到 ASSISTANT_UI_EVAL_CASES 或单独测试文件",
    "...candidates.map(c => ({",
    ...cases,
    "}))",
  ].join("\n");
}

export function summarizeEvalCandidates(
  candidates: EvalCandidateExport[],
): string {
  if (candidates.length === 0) return "无 eval 候选";
  const fallback = candidates.filter((c) => c.pipeline?.inferFallback).length;
  return `${candidates.length} 条候选 · ${fallback} 条兜底`;
}

export function evalCaseFingerprint(c: AssistantUiEvalCase): string {
  const expectKey =
    c.expect === null || c.expect === undefined
      ? "null"
      : `${c.expect.tool}:${JSON.stringify(c.expect.params)}`;
  return `${c.userText.trim()}|${expectKey}`;
}

export function candidateToEvalCase(
  c: EvalCandidateExport,
  index: number,
): AssistantUiEvalCase | null {
  const userText = c.userText?.trim();
  if (!userText) return null;

  const context: AssistantUiEvalCase["context"] = {};
  if (c.activeNav) context.activeNav = c.activeNav;
  if (c.assistantText) context.assistantText = c.assistantText;
  const hasContext = Object.keys(context).length > 0;

  const tags: string[] = ["downvote"];
  if (c.pipeline?.inferFallback) tags.push("infer_fallback");
  if (c.pipeline?.claimRepair) tags.push("claim");
  if (c.activeNav) tags.push(c.activeNav);

  const modelActions = c.modelActions?.length ? c.modelActions : undefined;

  return {
    id: slugId(c.userText, index),
    userText,
    modelActions,
    context: hasContext ? context : undefined,
    expect: c.pipeline?.finalUi ?? null,
    tags,
  };
}

export function mergeEvalCases(
  base: AssistantUiEvalCase[],
  incoming: AssistantUiEvalCase[],
): {
  merged: AssistantUiEvalCase[];
  added: AssistantUiEvalCase[];
  skipped: AssistantUiEvalCase[];
} {
  const seen = new Set(base.map(evalCaseFingerprint));
  const added: AssistantUiEvalCase[] = [];
  const skipped: AssistantUiEvalCase[] = [];
  for (const c of incoming) {
    const fp = evalCaseFingerprint(c);
    if (seen.has(fp)) {
      skipped.push(c);
      continue;
    }
    seen.add(fp);
    added.push(c);
  }
  return { merged: [...base, ...added], added, skipped };
}

export function formatEvalCaseAsSource(c: AssistantUiEvalCase): string {
  const expect = c.expect;
  const expectStr =
    expect === null || expect === undefined
      ? "null"
      : `{ tool: "${expect.tool}", params: ${JSON.stringify(expect.params)} }`;

  const contextLines: string[] = [];
  if (c.context?.activeNav) {
    contextLines.push(`activeNav: "${escapeStr(c.context.activeNav)}"`);
  }
  if (c.context?.priorAssistantText) {
    contextLines.push(
      `priorAssistantText: "${escapeStr(c.context.priorAssistantText)}"`,
    );
  }
  if (c.context?.assistantText) {
    contextLines.push(
      `assistantText: "${escapeStr(c.context.assistantText)}"`,
    );
  }
  const contextBlock =
    contextLines.length > 0
      ? `\n    context: { ${contextLines.join(", ")} },`
      : "";

  const modelBlock =
    c.modelActions && c.modelActions.length > 0
      ? `\n    modelActions: ${JSON.stringify(c.modelActions)},`
      : "";

  const tags = c.tags ?? [];
  const tagsBlock =
    tags.length > 0
      ? `\n    tags: [${tags.map((t) => `"${t}"`).join(", ")}],`
      : "";

  return `  {
    id: "${c.id}",
    userText: "${escapeStr(c.userText)}",${modelBlock}${contextBlock}
    expect: ${expectStr},${tagsBlock}
  }`;
}

export function formatEvalValidationFailures(
  failures: Array<{ id: string; expected: unknown; actual: unknown }>,
  max = 3,
): string {
  if (failures.length === 0) return "";
  const lines = failures.slice(0, max).map(
    (f) =>
      `${f.id}: 期望 ${JSON.stringify(f.expected)}，实际 ${JSON.stringify(f.actual)}`,
  );
  if (failures.length > max) {
    lines.push(`…还有 ${failures.length - max} 条`);
  }
  return lines.join("\n");
}

export type MergeEvalCandidatesResult = {
  text: string;
  added: AssistantUiEvalCase[];
  skipped: AssistantUiEvalCase[];
};

export function mergeEvalCandidatesForPaste(
  candidates: EvalCandidateExport[],
  existingCases: AssistantUiEvalCase[],
): MergeEvalCandidatesResult {
  const incoming = candidates
    .map((c, i) => candidateToEvalCase(c, i))
    .filter((c): c is AssistantUiEvalCase => c != null);
  const { added, skipped } = mergeEvalCases(existingCases, incoming);

  if (added.length === 0) {
    return {
      text: "// 无新候选（均已存在于 ASSISTANT_UI_EVAL_CASES）",
      added: [],
      skipped,
    };
  }

  const blocks = added.map(formatEvalCaseAsSource);
  const text = [
    "// 粘贴到 ASSISTANT_UI_EVAL_CASES 数组末尾",
    ...blocks,
  ].join(",\n");
  return { text, added, skipped };
}
