/**
 * tests/main/cli-packages/service.test.ts
 *
 * v3.2: CLI 包编排层 — refresh 合并/排序/忽略过滤/生态错误隔离 + version-cmp.
 */
import { describe, it, expect } from "vitest";
const { requireMain } = require("../../_setup/require-main.cjs");

const { refreshCliPackages, toggleCliPackageIgnore, CLI_ECOSYSTEMS } = requireMain("cli-packages/service");
const { compareCliVersions } = requireMain("cli-packages/version-cmp");

const ECO_SWEEP = {
  npm: {
    ok: true,
    installed: [
      { name: "typescript", installed: "5.6.3" },
      { name: "esbuild", installed: "0.20.0" },
    ],
    outdated: [{ name: "esbuild", installed: "0.20.0", latest: "0.27.0" }],
  },
  pip: { ok: false, reason: "cli_missing" },
  brew: {
    ok: true,
    installed: [
      { name: "wget", installed: "1.21.4" },
      { name: "openssl@3", installed: "3.2.0_1" },
    ],
    outdated: [],
  },
};

function mkDeps(sweepResult: any, state: any = null, saved: any[] = []) {
  return {
    sweep: async (eco: string) => sweepResult[eco],
    loadState: () => state,
    saveState: (d: any) => {
      saved.push(d);
      return d;
    },
    now: () => new Date("2026-09-12T12:00:00"),
  };
}

describe("refreshCliPackages", () => {
  it("合并 installed+outdated, has_update 按 version-cmp, 排序可升级在前", async () => {
    const saved: any[] = [];
    const r = await refreshCliPackages(mkDeps(ECO_SWEEP, null, saved));
    expect(r.items).toEqual([
      { ecosystem: "npm", name: "esbuild", installed: "0.20.0", latest: "0.27.0", has_update: true, note: "" },
      { ecosystem: "npm", name: "typescript", installed: "5.6.3", latest: "5.6.3", has_update: false, note: "" },
      { ecosystem: "brew", name: "openssl@3", installed: "3.2.0_1", latest: "3.2.0_1", has_update: false, note: "" },
      { ecosystem: "brew", name: "wget", installed: "1.21.4", latest: "1.21.4", has_update: false, note: "" },
    ]);
    expect(r.errors).toEqual([{ ecosystem: "pip", reason: "cli_missing" }]);
    expect(r.checkedAt).toBe(new Date("2026-09-12T12:00:00").getTime());
    expect(saved).toHaveLength(1);
  });

  it("ignored 集合过滤 — 上次忽略的包不再出现在 items, ignored 原样保留", async () => {
    const state = {
      cli_packages: {
        items: [],
        ignored: [{ ecosystem: "npm", name: "esbuild" }],
        errors: [],
        checkedAt: 1,
      },
    };
    const r = await refreshCliPackages(mkDeps(ECO_SWEEP, state, []));
    expect(r.items.some((it: any) => it.name === "esbuild")).toBe(false);
    expect(r.ignored).toEqual([{ ecosystem: "npm", name: "esbuild" }]);
  });

  it("全部生态失败 → items 空 + errors 全量 + ok:false", async () => {
    const failing = {
      npm: { ok: false, reason: "timeout" },
      pip: { ok: false, reason: "cli_missing" },
      brew: { ok: false, reason: "sweep_failed" },
    };
    const r = await refreshCliPackages(mkDeps(failing, null, []));
    expect(r.items).toEqual([]);
    expect(r.errors).toHaveLength(3);
    expect(r.ok).toBe(false);
  });

  it("outdated 里有但 installed 漏掉的包 — 兜底露出", async () => {
    const weird = {
      npm: {
        ok: true,
        installed: [{ name: "a", installed: "1.0.0" }],
        outdated: [{ name: "ghost", installed: "", latest: "9.9.9" }],
      },
      pip: { ok: false, reason: "cli_missing" },
      brew: { ok: true, installed: [], outdated: [] },
    };
    const r = await refreshCliPackages(mkDeps(weird, null, []));
    expect(r.items.some((it: any) => it.name === "ghost" && it.has_update)).toBe(true);
  });
});

describe("toggleCliPackageIgnore", () => {
  const stateWith = () => ({
    cli_packages: {
      items: [{ ecosystem: "npm", name: "esbuild", installed: "0.20.0", latest: "0.27.0", has_update: true, note: "" }],
      ignored: [],
      errors: [],
      checkedAt: 1,
    },
  });

  it("忽略 → ignored 新增并落盘; 恢复 → 移除", async () => {
    const saved: any[] = [];
    const deps = mkDeps(ECO_SWEEP, stateWith(), saved);

    const r1 = toggleCliPackageIgnore("npm", "esbuild", deps);
    expect(r1.ok).toBe(true);
    expect(r1.ignored).toEqual([{ ecosystem: "npm", name: "esbuild" }]);

    // toggle 的 deps 里 loadState 每次读同一个 state — 模拟已忽略态
    const deps2 = mkDeps(
      ECO_SWEEP,
      { cli_packages: { ...stateWith().cli_packages, ignored: [{ ecosystem: "npm", name: "esbuild" }] } },
      saved,
    );
    const r2 = toggleCliPackageIgnore("npm", "esbuild", deps2);
    expect(r2.ok).toBe(true);
    expect(r2.ignored).toEqual([]);
  });

  it("非法生态 / 包名 / 无数据 → ok:false", () => {
    expect(toggleCliPackageIgnore("cargo" as any, "x", mkDeps(ECO_SWEEP, null, [])).ok).toBe(false);
    expect(toggleCliPackageIgnore("npm", "", mkDeps(ECO_SWEEP, null, [])).ok).toBe(false);
    expect(toggleCliPackageIgnore("npm", "x", mkDeps(ECO_SWEEP, null, [])).ok).toBe(false);
  });
});

describe("compareCliVersions", () => {
  it("语义化比较 + v 前缀 + installed_newer", () => {
    expect(compareCliVersions("1.2.3", "1.2.4").hasUpdate).toBe(true);
    expect(compareCliVersions("v1.2.3", "1.2.4").hasUpdate).toBe(true);
    expect(compareCliVersions("1.2.3", "1.2.3").hasUpdate).toBe(false);
    expect(compareCliVersions("2.0.0", "1.9.9").hasUpdate).toBe(false);
    expect(compareCliVersions("2.0.0", "1.9.9").note).toBe("installed_newer");
    expect(compareCliVersions("1.0.0-beta", "1.0.0").hasUpdate).toBe(true);
    // brew revision (_1) 对 cmp 判相等 — 由 service 层以包管理器 outdated 为准补判
    expect(compareCliVersions("3.2.0", "3.2.0_1").hasUpdate).toBe(false);
  });

  it("brew revision bump — 包管理器报 outdated 时 has_update 为 true", async () => {
    const rev = {
      npm: { ok: true, installed: [], outdated: [] },
      pip: { ok: false, reason: "cli_missing" },
      brew: {
        ok: true,
        installed: [{ name: "wget", installed: "1.21.4" }],
        outdated: [{ name: "wget", installed: "1.21.4", latest: "1.21.4_1" }],
      },
    };
    const r = await refreshCliPackages(mkDeps(rev, null, []));
    expect(r.items).toEqual([
      { ecosystem: "brew", name: "wget", installed: "1.21.4", latest: "1.21.4_1", has_update: true, note: "" },
    ]);
  });
});
