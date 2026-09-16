/**
 * src/main/assistant-audit.ts
 *
 * AI 助手工具调用审计日志 — 独立落盘，不进 state.json。
 *
 * 动机：
 *  1. 审计是「未来给助手任何执行能力」的前置条件 —— 没有调用记录就不该放开执行面。
 *  2. 独立落盘彻底避开 state-store.PRESERVE_FIELDS 静默丢弃陷阱（与 finance 模块同策略）。
 *
 * 文件：与 state.json 同目录的 `assistant_audit.json`，结构 `{ entries: ToolAuditEntry[] }`，
 * 环形保留最近 MAX_AUDIT_ENTRIES 条（最旧先淘汰）。
 *
 * ⚠️ 测试隔离：文件名由 `path.dirname(statePath)` 推导 —— 用 `os.tmpdir()/x.json` 会让
 * 所有用例共享同一专属文件互相污染。每用例须放独立子目录 `os.tmpdir()/test-<rand>/state.json`。
 */

import * as fs from "fs";
import * as path from "path";
import * as stateStore from "./state-store";
import { mainLog } from "./log";

export type ToolAuditOutcome = "denied" | "ok" | "failed";

export type ToolAuditEntry = {
  /** 事件时间戳 (ms) */
  ts: number;
  tool: string;
  /** 执行域（取自策略表） */
  execution: "main" | "renderer";
  outcome: ToolAuditOutcome;
  /** 仅在 executed 时有值 */
  durationMs?: number;
  /** 拒绝理由 / 失败原因（截断） */
  reason?: string;
  /** 参数摘要（截断；非完整参数，避免落盘大对象） */
  paramsDigest?: string;
};

/** 环形上限 —— 保留最近 N 条 */
export const MAX_AUDIT_ENTRIES = 500;
/** 单条 reason / paramsDigest 的落盘上限 */
const MAX_FIELD_CHARS = 200;

export function auditFilePath(statePath?: unknown): string {
  const p = typeof statePath === "string" && statePath ? statePath : stateStore.defaultPath();
  return path.join(path.dirname(p), "assistant_audit.json");
}

function _clip(s: unknown): string | undefined {
  if (typeof s !== "string" || s.length === 0) return undefined;
  return s.length > MAX_FIELD_CHARS ? `${s.slice(0, MAX_FIELD_CHARS)}…` : s;
}

/** 参数摘要：序列化并截断；不可序列化时返回 undefined（不抛错）。 */
export function digestParams(params: unknown): string | undefined {
  if (params === undefined || params === null) return undefined;
  try {
    const s = JSON.stringify(params);
    if (typeof s !== "string") return undefined;
    return _clip(s);
  } catch {
    return undefined;
  }
}

function _readAll(statePath?: unknown): ToolAuditEntry[] {
  try {
    const raw = fs.readFileSync(auditFilePath(statePath), "utf-8");
    const j = JSON.parse(raw) as { entries?: unknown };
    if (!j || !Array.isArray(j.entries)) return [];
    return j.entries.filter(
      (e): e is ToolAuditEntry =>
        !!e && typeof e === "object" && typeof (e as ToolAuditEntry).tool === "string",
    );
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== "ENOENT") {
      mainLog.warn("[assistant-audit] read failed", {
        msg: err instanceof Error ? err.message : String(err),
      });
    }
    return [];
  }
}

/**
 * 追加一条审计记录。**静默失败** —— 审计写盘失败绝不影响工具执行主流程。
 */
export function recordToolAudit(
  entry: Pick<ToolAuditEntry, "tool" | "execution" | "outcome"> & {
    ts?: number;
    durationMs?: number;
    reason?: string;
    paramsDigest?: string;
  },
  statePath?: unknown,
): void {
  try {
    const normalized: ToolAuditEntry = {
      ts: typeof entry.ts === "number" ? entry.ts : Date.now(),
      tool: String(entry.tool || "unknown"),
      execution: entry.execution,
      outcome: entry.outcome,
    };
    if (typeof entry.durationMs === "number" && Number.isFinite(entry.durationMs)) {
      normalized.durationMs = Math.max(0, Math.round(entry.durationMs));
    }
    const reason = _clip(entry.reason);
    if (reason) normalized.reason = reason;
    const digest = _clip(entry.paramsDigest);
    if (digest) normalized.paramsDigest = digest;

    const prev = _readAll(statePath);
    const next = [...prev, normalized];
    const trimmed =
      next.length > MAX_AUDIT_ENTRIES ? next.slice(next.length - MAX_AUDIT_ENTRIES) : next;
    stateStore.writeAtomic(auditFilePath(statePath), { entries: trimmed });
  } catch (err: unknown) {
    mainLog.warn("[assistant-audit] write skipped", {
      msg: err instanceof Error ? err.message : String(err),
    });
  }
}

/** 读最近 `limit` 条（默认全部），按时间升序返回。 */
export function loadToolAudit(limit?: number, statePath?: unknown): ToolAuditEntry[] {
  const all = _readAll(statePath);
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return all;
  return all.slice(Math.max(0, all.length - Math.floor(limit)));
}

/** 清空审计日志（供测试与诊断使用）。 */
export function clearToolAudit(statePath?: unknown): void {
  try {
    stateStore.writeAtomic(auditFilePath(statePath), { entries: [] });
  } catch {
    /* 静默 */
  }
}
