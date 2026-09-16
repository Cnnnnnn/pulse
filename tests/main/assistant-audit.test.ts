import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  MAX_AUDIT_ENTRIES,
  auditFilePath,
  clearToolAudit,
  digestParams,
  loadToolAudit,
  recordToolAudit,
} from "../../src/main/assistant-audit";

let dir = "";
let statePath = "";

beforeEach(() => {
  // ⚠️ 每用例独立子目录：专属文件名由 path.dirname(statePath) 推导，
  // 共享 tmpdir 会让所有用例读写同一文件互相污染（项目已知坑）。
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-audit-"));
  statePath = path.join(dir, "state.json");
});

afterEach(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

describe("assistant-audit — 路径与基础读写", () => {
  it("专属文件与 state.json 同目录", () => {
    expect(auditFilePath(statePath)).toBe(path.join(dir, "assistant_audit.json"));
  });

  it("无文件时读出空数组，不抛错", () => {
    expect(loadToolAudit(undefined, statePath)).toEqual([]);
  });

  it("记录后可读回，字段完整", () => {
    recordToolAudit(
      {
        tool: "query_apps",
        execution: "main",
        outcome: "ok",
        durationMs: 123.6,
        paramsDigest: '{"a":1}',
      },
      statePath,
    );

    const all = loadToolAudit(undefined, statePath);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      tool: "query_apps",
      execution: "main",
      outcome: "ok",
      durationMs: 124, // 四舍五入
      paramsDigest: '{"a":1}',
    });
    expect(typeof all[0].ts).toBe("number");
  });

  it("被拒记录保留 reason，且无 durationMs", () => {
    recordToolAudit(
      {
        tool: "upgrade_app",
        execution: "renderer",
        outcome: "denied",
        reason: "未监控的应用: X",
      },
      statePath,
    );
    const [e] = loadToolAudit(undefined, statePath);
    expect(e.outcome).toBe("denied");
    expect(e.reason).toBe("未监控的应用: X");
    expect(e.durationMs).toBeUndefined();
  });

  it("按时间升序追加（多条）", () => {
    recordToolAudit({ tool: "a", execution: "main", outcome: "ok" }, statePath);
    recordToolAudit({ tool: "b", execution: "renderer", outcome: "denied" }, statePath);
    expect(loadToolAudit(undefined, statePath).map((e) => e.tool)).toEqual(["a", "b"]);
  });

  it("limit 取最近 N 条", () => {
    for (const t of ["a", "b", "c"]) {
      recordToolAudit({ tool: t, execution: "main", outcome: "ok" }, statePath);
    }
    expect(loadToolAudit(2, statePath).map((e) => e.tool)).toEqual(["b", "c"]);
    expect(loadToolAudit(0, statePath)).toHaveLength(3); // 非法 limit → 全部
    expect(loadToolAudit(-1, statePath)).toHaveLength(3);
  });
});

describe("assistant-audit — 环形上限与截断", () => {
  it("超出上限时淘汰最旧，保留最近 MAX 条", () => {
    const full = Array.from({ length: MAX_AUDIT_ENTRIES }, (_, i) => ({
      ts: i,
      tool: `t${i}`,
      execution: "main" as const,
      outcome: "ok" as const,
    }));
    fs.mkdirSync(path.dirname(auditFilePath(statePath)), { recursive: true });
    fs.writeFileSync(auditFilePath(statePath), JSON.stringify({ entries: full }));

    recordToolAudit({ tool: "newest", execution: "main", outcome: "ok" }, statePath);

    const all = loadToolAudit(undefined, statePath);
    expect(all).toHaveLength(MAX_AUDIT_ENTRIES);
    expect(all[0].tool).toBe("t1"); // t0 被淘汰
    expect(all[all.length - 1].tool).toBe("newest");
  });

  it("超长 reason / paramsDigest 被截断并加省略号", () => {
    const long = "x".repeat(500);
    recordToolAudit(
      {
        tool: "search",
        execution: "main",
        outcome: "failed",
        reason: long,
        paramsDigest: long,
      },
      statePath,
    );
    const [e] = loadToolAudit(undefined, statePath);
    expect(e.reason!.length).toBe(201); // 200 + "…"
    expect(e.reason!.endsWith("…")).toBe(true);
    expect(e.paramsDigest!.length).toBe(201);
  });

  it("非法 durationMs 不入库", () => {
    recordToolAudit(
      { tool: "a", execution: "main", outcome: "ok", durationMs: Number.NaN },
      statePath,
    );
    expect(loadToolAudit(undefined, statePath)[0].durationMs).toBeUndefined();
  });
});

describe("assistant-audit — 容错（静默失败）", () => {
  it("文件内容损坏时读出空数组，不抛错", () => {
    fs.writeFileSync(auditFilePath(statePath), "{ not json");
    expect(loadToolAudit(undefined, statePath)).toEqual([]);
  });

  it("损坏文件可被后续记录覆盖修复", () => {
    fs.writeFileSync(auditFilePath(statePath), "{ not json");
    recordToolAudit({ tool: "a", execution: "main", outcome: "ok" }, statePath);
    expect(loadToolAudit(undefined, statePath).map((e) => e.tool)).toEqual(["a"]);
  });

  it("entries 含非对象项时被过滤", () => {
    fs.writeFileSync(
      auditFilePath(statePath),
      JSON.stringify({ entries: [null, 42, { tool: "ok" }, { no: "tool" }] }),
    );
    expect(loadToolAudit(undefined, statePath).map((e) => e.tool)).toEqual(["ok"]);
  });

  it("clearToolAudit 清空", () => {
    recordToolAudit({ tool: "a", execution: "main", outcome: "ok" }, statePath);
    clearToolAudit(statePath);
    expect(loadToolAudit(undefined, statePath)).toEqual([]);
  });
});

describe("assistant-audit — digestParams", () => {
  it("对象序列化并截断", () => {
    expect(digestParams({ a: 1 })).toBe('{"a":1}');
    expect(digestParams({ x: "y".repeat(500) })!.length).toBe(201);
  });

  it("null / undefined 返回 undefined", () => {
    expect(digestParams(undefined)).toBeUndefined();
    expect(digestParams(null)).toBeUndefined();
  });

  it("不可序列化（循环引用）返回 undefined 而非抛错", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(digestParams(cyclic)).toBeUndefined();
  });
});
