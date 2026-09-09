/**
 * src/main/security/open-targets.ts
 *
 * 统一「打开外部目标」白名单。open-url:open 与 ai-sessions:open-session
 * 共用，避免两条 IPC 通道各自一套校验、标准漂移。
 *
 * 威胁模型：renderer 可能被注入（聊天 markdown / 新闻 HTML）。任何从
 * renderer 传进来的 openExternal / openPath 目标都必须先过白名单。
 */

import type * as osType from "node:os";
import type * as pathType from "node:path";

const os: typeof osType = require("node:os");
const path: typeof pathType = require("node:path");

/** 允许 shell.openExternal 的自定义 scheme（来自 _resolveJumpTarget） */
const ALLOWED_JUMP_SCHEMES = new Set(["codex:", "minimax:"]);

/** 允许 shell.openPath 的会话目录（detector 扫描的 transcript 根） */
function sessionPathRoots(): string[] {
  const home = os.homedir();
  return [
    path.join(home, ".codex"),
    path.join(home, ".cursor"),
    path.join(home, ".minimax"),
  ];
}

/** http/https 才允许 openExternal（防 file: / javascript: / 任意 scheme） */
export function isSafeExternalUrl(url: unknown): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** jump 协议：codex:// / minimax://（仅 scheme 白名单） */
export function isAllowedJumpScheme(target: unknown): boolean {
  if (typeof target !== "string" || target.length === 0) return false;
  try {
    const u = new URL(target);
    return ALLOWED_JUMP_SCHEMES.has(u.protocol);
  } catch {
    return false;
  }
}

function isUnderDir(filePath: string, dir: string): boolean {
  const resolvedFile = path.resolve(filePath);
  const resolvedDir = path.resolve(dir);
  return (
    resolvedFile === resolvedDir ||
    resolvedFile.startsWith(resolvedDir + path.sep)
  );
}

/** 会话 transcript 绝对路径：只放行 detector 扫描过的目录树 */
export function isAllowedSessionPath(target: unknown): boolean {
  if (typeof target !== "string" || target.length === 0) return false;
  // Windows 盘符路径也接受（detectors 跨平台；当前产品以 macOS 为主）
  if (!target.startsWith("/") && !/^[a-zA-Z]:[\\/]/.test(target)) {
    return false;
  }
  // 拒绝路径穿越后的 .. 段残留（resolve 后再比）
  const resolved = path.resolve(target);
  return sessionPathRoots().some((root) => isUnderDir(resolved, root));
}

/**
 * ai-sessions:open-session 的统一入口判定。
 * 返回 null 表示拒绝；否则返回打开方式。
 */
export function classifyOpenSessionTarget(
  target: unknown,
): { mode: "external"; url: string } | { mode: "openPath"; path: string } | null {
  if (typeof target !== "string" || target.length === 0) return null;
  if (isAllowedJumpScheme(target)) {
    return { mode: "external", url: target };
  }
  if (isAllowedSessionPath(target)) {
    return { mode: "openPath", path: path.resolve(target) };
  }
  return null;
}

