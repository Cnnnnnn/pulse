/**
 * tests/main/security/open-targets.test.ts
 *
 * P0 安全：openExternal / openPath 白名单。renderer 可能被注入，
 * 任何从 renderer 传入的目标必须先过白名单。
 */
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";

const _require = createRequire(import.meta.url);
// 走 dist-test 产物，避免 vitest 直接吃 .ts 的 dual-export 互操作坑
const {
  isSafeExternalUrl,
  isAllowedJumpScheme,
  isAllowedSessionPath,
  classifyOpenSessionTarget,
} = _require("../../../dist-test/main/per-file/security/open-targets.cjs");

describe("isSafeExternalUrl", () => {
  it("放行 http/https", () => {
    expect(isSafeExternalUrl("https://example.com/a")).toBe(true);
    expect(isSafeExternalUrl("http://example.com")).toBe(true);
  });

  it("拒绝 file/javascript/data/任意 scheme 与非字符串", () => {
    expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,x")).toBe(false);
    expect(isSafeExternalUrl("codex://abc")).toBe(false);
    expect(isSafeExternalUrl("")).toBe(false);
    expect(isSafeExternalUrl(null)).toBe(false);
    expect(isSafeExternalUrl(123)).toBe(false);
  });
});

describe("isAllowedJumpScheme", () => {
  it("放行 codex:// 与 minimax://", () => {
    expect(isAllowedJumpScheme("codex://session-uuid")).toBe(true);
    expect(isAllowedJumpScheme("minimax://session-id")).toBe(true);
  });

  it("拒绝其它 scheme 与绝对路径", () => {
    expect(isAllowedJumpScheme("https://evil.com")).toBe(false);
    expect(isAllowedJumpScheme("file:///etc/passwd")).toBe(false);
    expect(isAllowedJumpScheme("/Users/x/.cursor/projects/a.jsonl")).toBe(false);
  });
});

describe("isAllowedSessionPath", () => {
  const home = os.homedir();

  it("放行 ~/.codex ~/.cursor ~/.minimax 下的绝对路径", () => {
    expect(isAllowedSessionPath(path.join(home, ".codex", "sessions", "x.jsonl"))).toBe(true);
    expect(isAllowedSessionPath(path.join(home, ".cursor", "projects", "p", "t.jsonl"))).toBe(true);
    expect(isAllowedSessionPath(path.join(home, ".minimax", "sqlite.db"))).toBe(true);
  });

  it("拒绝系统路径、路径穿越与非绝对路径", () => {
    expect(isAllowedSessionPath("/etc/passwd")).toBe(false);
    expect(isAllowedSessionPath("/Applications/Pulse.app")).toBe(false);
    expect(isAllowedSessionPath(path.join(home, ".ssh", "id_rsa"))).toBe(false);
    // resolve 后仍在白名单外
    expect(
      isAllowedSessionPath(path.join(home, ".codex", "..", ".ssh", "id_rsa")),
    ).toBe(false);
    expect(isAllowedSessionPath("relative/file.jsonl")).toBe(false);
    expect(isAllowedSessionPath("")).toBe(false);
  });

  it("拒绝把 ~/.codex 当前缀的伪路径（~/.codex-evil）", () => {
    expect(isAllowedSessionPath(path.join(home, ".codex-evil", "x"))).toBe(false);
  });
});

describe("classifyOpenSessionTarget", () => {
  const home = os.homedir();

  it("codex:// → external", () => {
    expect(classifyOpenSessionTarget("codex://abc-123")).toEqual({
      mode: "external",
      url: "codex://abc-123",
    });
  });

  it("会话路径 → openPath（resolve 后）", () => {
    const p = path.join(home, ".cursor", "projects", "p", "s.jsonl");
    expect(classifyOpenSessionTarget(p)).toEqual({
      mode: "openPath",
      path: path.resolve(p),
    });
  });

  it("拒绝任意路径 / 任意 scheme / 空值", () => {
    expect(classifyOpenSessionTarget("/etc/passwd")).toBeNull();
    expect(classifyOpenSessionTarget("https://evil.com")).toBeNull();
    expect(classifyOpenSessionTarget("file:///etc/passwd")).toBeNull();
    expect(classifyOpenSessionTarget("")).toBeNull();
    expect(classifyOpenSessionTarget(null)).toBeNull();
  });
});
