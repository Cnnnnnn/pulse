/**
 * tests/main/cli-packages/enumerate.test.ts
 *
 * v3.2: CLI 包枚举 — parsers 纯函数 + sweepEcosystem 注入 runner.
 * 覆盖: npm/pip/brew 三生态解析、outdated exit≠0 从 reject 捞 stdout、
 * CLI 缺失 (ENOENT) → cli_missing、outdated 失败不致命.
 */
import { describe, it, expect } from "vitest";
const { requireMain } = require("../../_setup/require-main.cjs");

const {
  parseNpmList,
  parseNpmOutdated,
  parsePipList,
  parsePipOutdated,
  parseBrewList,
  parseBrewOutdated,
  sweepEcosystem,
} = requireMain("cli-packages/enumerate");

describe("parsers", () => {
  it("parseNpmList — 读 dependencies 的 name+version, 跳过 invalid", () => {
    const rows = parseNpmList(
      JSON.stringify({
        dependencies: {
          typescript: { version: "5.6.3" },
          broken: { version: "", problems: ["missing"] },
        },
      }),
    );
    expect(rows).toEqual([{ name: "typescript", installed: "5.6.3" }]);
  });

  it("parseNpmList — 坏 JSON / 无 dependencies → 空", () => {
    expect(parseNpmList("not-json")).toEqual([]);
    expect(parseNpmList("{}")).toEqual([]);
  });

  it("parseNpmOutdated — name+current+latest, latest 缺失跳过", () => {
    const rows = parseNpmOutdated(
      JSON.stringify({
        esbuild: { current: "0.20.0", wanted: "0.20.0", latest: "0.27.0" },
        weird: { current: "1.0.0" },
      }),
    );
    expect(rows).toEqual([{ name: "esbuild", installed: "0.20.0", latest: "0.27.0" }]);
  });

  it("parsePipList / parsePipOutdated — 数组形态", () => {
    expect(
      parsePipList(JSON.stringify([{ name: "requests", version: "2.31.0" }])),
    ).toEqual([{ name: "requests", installed: "2.31.0" }]);
    expect(
      parsePipOutdated(
        JSON.stringify([{ name: "flask", version: "2.3.0", latest: "3.0.0" }]),
      ),
    ).toEqual([{ name: "flask", installed: "2.3.0", latest: "3.0.0" }]);
    expect(parsePipList("not-json")).toEqual([]);
    expect(parsePipOutdated(JSON.stringify("nope"))).toEqual([]);
  });

  it("parseBrewList — 'name version' 行, 多版本取第一个", () => {
    const rows = parseBrewList("openssl@3 3.2.0_1\nwget 1.21.4 1.21.3\n\n");
    expect(rows).toEqual([
      { name: "openssl@3", installed: "3.2.0_1" },
      { name: "wget", installed: "1.21.4" },
    ]);
  });

  it("parseBrewOutdated — json=v2 的 formulae 数组", () => {
    const rows = parseBrewOutdated(
      JSON.stringify({
        formulae: [
          { name: "wget", installed_versions: ["1.21.4"], current_version: "1.21.5" },
          { name: "noVer", installed_versions: [], current_version: "" },
        ],
        casks: [],
      }),
    );
    expect(rows).toEqual([{ name: "wget", installed: "1.21.4", latest: "1.21.5" }]);
  });
});

describe("sweepEcosystem", () => {
  const okRunner = (map: Record<string, string>) => async (cmd: string, args: string[]) => {
    const key = `${cmd} ${args.join(" ")}`;
    if (!(key in map)) throw new Error(`unexpected call: ${key}`);
    return { stdout: map[key], stderr: "" };
  };

  it("npm — installed + outdated 正常合并返回", async () => {
    const runner = okRunner({
      "npm ls -g --depth=0 --json": JSON.stringify({
        dependencies: { typescript: { version: "5.6.3" } },
      }),
      "npm outdated -g --json": JSON.stringify({
        typescript: { current: "5.6.3", latest: "5.7.0" },
      }),
    });
    const r = await sweepEcosystem("npm", { runner });
    expect(r.ok).toBe(true);
    expect(r.installed).toEqual([{ name: "typescript", installed: "5.6.3" }]);
    expect(r.outdated).toEqual([{ name: "typescript", installed: "5.6.3", latest: "5.7.0" }]);
  });

  it("npm outdated exit≠0 (reject 带 stdout) — installed 仍返回, outdated 解析自 reject stdout", async () => {
    const runner = async (cmd: string, args: string[]) => {
      if (args[0] === "outdated") {
        throw Object.assign(new Error("exit 1"), {
          stdout: JSON.stringify({ esbuild: { current: "0.20.0", latest: "0.27.0" } }),
        });
      }
      return { stdout: JSON.stringify({ dependencies: { esbuild: { version: "0.20.0" } } }), stderr: "" };
    };
    const r = await sweepEcosystem("npm", { runner });
    expect(r.ok).toBe(true);
    expect(r.installed).toHaveLength(1);
    expect(r.outdated).toEqual([{ name: "esbuild", installed: "0.20.0", latest: "0.27.0" }]);
  });

  it("outdated 挂掉但 installed 成功 → ok:true, outdated 空 (降级)", async () => {
    const runner = async (cmd: string, args: string[]) => {
      if (args[0] === "outdated") throw new Error("boom");
      return { stdout: JSON.stringify({ dependencies: { a: { version: "1.0.0" } } }), stderr: "" };
    };
    const r = await sweepEcosystem("npm", { runner });
    expect(r.ok).toBe(true);
    expect(r.outdated).toEqual([]);
  });

  it("installed 命令 ENOENT → cli_missing", async () => {
    const runner = async () => {
      const e: any = new Error("spawn npm ENOENT");
      e.code = "ENOENT";
      throw e;
    };
    const r = await sweepEcosystem("npm", { runner });
    expect(r).toEqual({ ok: false, reason: "cli_missing" });
  });

  it("其它错误 → sweep_failed", async () => {
    const runner = async () => {
      throw new Error("segfault");
    };
    const r = await sweepEcosystem("brew", { runner });
    expect(r).toEqual({ ok: false, reason: "sweep_failed" });
  });
});
