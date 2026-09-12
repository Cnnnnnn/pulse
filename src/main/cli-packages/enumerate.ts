/**
 * src/main/cli-packages/enumerate.ts
 *
 * v3.2: CLI 包枚举 — 每个生态两条命令:
 *   - installed: npm ls -g --depth=0 --json / pip3 list --format=json / brew list --formula --versions
 *   - outdated:  npm outdated -g --json / pip3 list --outdated --format=json / brew outdated --json=v2
 *
 * 不发任何 HTTP 请求 — "latest" 由包管理器自己带回来. CLI 不存在 (ENOENT) 时
 * 返回 { ok:false, reason:"cli_missing" }, 由 service 记为生态级错误而非整轮失败.
 *
 * 安全边界: 命令名与参数全部是调用点静态字面量数组, child_process.execFile
 * (promisify 包装) 不经过 shell — 与 workers/installed-version.ts 的 pExecFile
 * 同一形态, 无任何外部输入拼进命令, 不存在注入面. Windows 不支持 (npm/pip 的
 * .cmd shim 需要走 shell 才有注入风险; brew 本身 mac-only), 直接 unsupported.
 *
 * npm outdated / pip outdated 在有过期包时 exit code 非 0 — promisify 包装会
 * reject, 但错误对象带 stdout, 必须从那里解析.
 */

import { promisify } from "util";
import { execFile } from "child_process";

export type CliEcosystem = "npm" | "pip" | "brew";

export type CliInstalledRow = { name: string; installed: string };
export type CliOutdatedRow = { name: string; installed: string; latest: string };

export type EcoSweepResult = {
  ok: boolean;
  reason?: string;
  installed?: CliInstalledRow[];
  outdated?: CliOutdatedRow[];
};

/** promisify(execFile) 形态: reject 时错误对象带 .stdout/.stderr */
export type ToolRunner = (
  cmd: string,
  args: string[],
  opts: { timeout: number; maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>;

const DEFAULT_RUNNER: ToolRunner = promisify(execFile) as any;

type ExecDeps = { runner?: ToolRunner };

function makeRunner(deps: ExecDeps): ToolRunner {
  return deps.runner || DEFAULT_RUNNER;
}

const MAX_BUFFER = 16 * 1024 * 1024;

/** 非 0 exit 但有 stdout (npm/pip outdated 的常态) → 把 stdout 捞回来 */
function stdoutOfRejected(err: any): string {
  return err && typeof err.stdout === "string" ? err.stdout : "";
}

function isMissingCli(err: any): boolean {
  return (
    err &&
    (err.code === "ENOENT" ||
      /ENOENT|not found|command not found/i.test(String(err.message || "")))
  );
}

function reasonOf(err: any): string {
  if (isMissingCli(err)) return "cli_missing";
  if (err && err.code === "ETIMEDOUT") return "timeout";
  return "sweep_failed";
}

// ─── parsers (纯函数, 独立导出便于单测) ────────────────

export function parseNpmList(stdout: string): CliInstalledRow[] {
  const rows: CliInstalledRow[] = [];
  let data: any;
  try {
    data = JSON.parse(stdout);
  } catch {
    return rows;
  }
  const deps = data && data.dependencies;
  if (!deps || typeof deps !== "object") return rows;
  for (const [name, info] of Object.entries(deps) as [string, any][]) {
    // npm@9+ 全局包可能带 "invalid"/"missing" 标记 — version 缺失就跳过
    if (!name || !info || typeof info.version !== "string" || !info.version) continue;
    rows.push({ name, installed: info.version });
  }
  return rows;
}

export function parseNpmOutdated(stdout: string): CliOutdatedRow[] {
  const rows: CliOutdatedRow[] = [];
  let data: any;
  try {
    data = JSON.parse(stdout);
  } catch {
    return rows;
  }
  if (!data || typeof data !== "object") return rows;
  for (const [name, info] of Object.entries(data) as [string, any][]) {
    if (!name || !info) continue;
    const latest = typeof info.latest === "string" ? info.latest : "";
    if (!latest) continue;
    rows.push({
      name,
      installed: typeof info.current === "string" ? info.current : "",
      latest,
    });
  }
  return rows;
}

export function parsePipList(stdout: string): CliInstalledRow[] {
  const rows: CliInstalledRow[] = [];
  let data: any;
  try {
    data = JSON.parse(stdout);
  } catch {
    return rows;
  }
  if (!Array.isArray(data)) return rows;
  for (const it of data) {
    if (it && typeof it.name === "string" && typeof it.version === "string") {
      rows.push({ name: it.name, installed: it.version });
    }
  }
  return rows;
}

export function parsePipOutdated(stdout: string): CliOutdatedRow[] {
  const rows: CliOutdatedRow[] = [];
  let data: any;
  try {
    data = JSON.parse(stdout);
  } catch {
    return rows;
  }
  if (!Array.isArray(data)) return rows;
  for (const it of data) {
    if (
      it && typeof it.name === "string" &&
      typeof it.latest === "string" && it.latest
    ) {
      rows.push({
        name: it.name,
        installed: typeof it.version === "string" ? it.version : "",
        latest: it.latest,
      });
    }
  }
  return rows;
}

export function parseBrewList(stdout: string): CliInstalledRow[] {
  const rows: CliInstalledRow[] = [];
  for (const line of String(stdout || "").split("\n")) {
    const m = line.trim().match(/^(\S+)\s+(.+)$/);
    if (!m) continue;
    // "openssl@3 3.2.0_1" — 多版本安装时空格分隔, 取第一个
    const versions = m[2].split(/\s+/);
    rows.push({ name: m[1], installed: versions[0] || "" });
  }
  return rows;
}

export function parseBrewOutdated(stdout: string): CliOutdatedRow[] {
  const rows: CliOutdatedRow[] = [];
  let data: any;
  try {
    data = JSON.parse(stdout);
  } catch {
    return rows;
  }
  const formulae = data && Array.isArray(data.formulae) ? data.formulae : [];
  for (const f of formulae) {
    if (!f || typeof f.name !== "string") continue;
    const current = Array.isArray(f.installed_versions) && f.installed_versions.length
      ? String(f.installed_versions[0])
      : "";
    const latest = typeof f.current_version === "string" ? f.current_version : "";
    if (!latest) continue;
    rows.push({ name: f.name, installed: current, latest });
  }
  return rows;
}

// ─── sweep (per 生态) ────────────────────────────────

export async function sweepEcosystem(
  eco: CliEcosystem,
  deps: ExecDeps = {},
): Promise<EcoSweepResult> {
  if (process.platform === "win32") {
    // npm/pip 的 Windows .cmd shim 需要走 shell (注入面), brew 是 mac-only —
    // 整体不支持, 而不是降低安全边界去支持
    return { ok: false, reason: "unsupported_platform" };
  }
  const run = makeRunner(deps);
  try {
    if (eco === "npm") {
      const [list, outdated] = await Promise.all([
        run("npm", ["ls", "-g", "--depth=0", "--json"], { timeout: 30_000, maxBuffer: MAX_BUFFER }),
        // outdated 在有过期包时 exit≠0 → reject, stdout 从错误对象捞
        run("npm", ["outdated", "-g", "--json"], { timeout: 45_000, maxBuffer: MAX_BUFFER }).catch(
          (err: any) => ({ stdout: stdoutOfRejected(err), stderr: "" }),
        ),
      ]);
      return {
        ok: true,
        installed: parseNpmList(list.stdout),
        outdated: parseNpmOutdated(outdated.stdout),
      };
    }
    if (eco === "pip") {
      const [list, outdated] = await Promise.all([
        run("pip3", ["list", "--format=json"], { timeout: 30_000, maxBuffer: MAX_BUFFER }),
        // pip outdated 内部要打 PyPI, 大包列表时可能 30s+ — 给宽时限
        run("pip3", ["list", "--outdated", "--format=json"], { timeout: 120_000, maxBuffer: MAX_BUFFER }).catch(
          (err: any) => ({ stdout: stdoutOfRejected(err), stderr: "" }),
        ),
      ]);
      return {
        ok: true,
        installed: parsePipList(list.stdout),
        outdated: parsePipOutdated(outdated.stdout),
      };
    }
    // brew
    const [list, outdated] = await Promise.all([
      run("brew", ["list", "--formula", "--versions"], { timeout: 30_000, maxBuffer: MAX_BUFFER }),
      run("brew", ["outdated", "--json=v2"], { timeout: 45_000, maxBuffer: MAX_BUFFER }).catch(
        (err: any) => ({ stdout: stdoutOfRejected(err), stderr: "" }),
      ),
    ]);
    return {
      ok: true,
      installed: parseBrewList(list.stdout),
      outdated: parseBrewOutdated(outdated.stdout),
    };
  } catch (err: any) {
    return { ok: false, reason: reasonOf(err) };
  }
}
