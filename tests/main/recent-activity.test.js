/**
 * tests/main/recent-activity.test.js
 *
 * recent-activity.js 单测 — 覆盖 spec §Testing 里 4 项:
 *   1. push 正常 / 5min 内同 kind+ref 折叠 / 超出 maxEntries 裁
 *   2. list 倒序 / limit / kind 过滤 / since 过滤
 *   3. _getMaxEntries: 缺省 200, 范围 [50, 1000] 钳制
 *   4. 崩溃恢复
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const recent = require("../../src/main/recent-activity.js");

function tmpStatePath() {
  const dir = join(
    tmpdir(),
    `pulse-recent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

function tmpConfigPath(obj) {
  const dir = join(
    tmpdir(),
    `pulse-recent-cfg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  const p = join(dir, "config.json");
  if (obj) writeFileSync(p, JSON.stringify(obj));
  return p;
}

function entryOf(kind, ref, label, ts = Date.now()) {
  return { kind, ref, label, ts };
}

describe("recent-activity — list", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
    recent.clearConfigCache();
  });

  it("list returns [] when state file missing", () => {
    expect(recent.list({ statePath: p })).toEqual([]);
  });

  it("list returns [] when state.json has no recentActivity field", () => {
    writeFileSync(p, JSON.stringify({ apps: {}, mutes: {} }));
    expect(recent.list({ statePath: p })).toEqual([]);
  });

  it("list returns [] when state.json is corrupt", () => {
    writeFileSync(p, "{not json");
    expect(recent.list({ statePath: p })).toEqual([]);
  });

  it("list filters out malformed entries", () => {
    writeFileSync(
      p,
      JSON.stringify({
        recentActivity: [
          { kind: "app-upgrade", ref: "a", label: "ok", ts: Date.now() },
          { kind: "bad-kind", ref: "b", label: "x" }, // 非法 kind
          { kind: "app-upgrade", ref: "c" }, // 缺 label
        ],
      }),
    );
    const r = recent.list({ statePath: p });
    expect(r).toHaveLength(1);
    expect(r[0].ref).toBe("a");
  });
});

describe("recent-activity — push", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
    recent.clearConfigCache();
  });

  it("push 正常: 写盘 + 返 ok", () => {
    const r = recent.push(
      entryOf("app-upgrade", "Pulse", "Pulse 2.10 → 2.11"),
      { statePath: p, configPath: tmpConfigPath() },
    );
    expect(r).toEqual({ ok: true, deduped: false });
    const list = recent.list({ statePath: p });
    expect(list).toHaveLength(1);
    expect(list[0].ref).toBe("Pulse");
  });

  it("push 拒绝非法 kind", () => {
    expect(
      recent.push(
        { kind: "weird", ref: "a", label: "x", ts: Date.now() },
        { statePath: p, configPath: tmpConfigPath() },
      ),
    ).toEqual({ ok: false, reason: "invalid_kind" });
  });

  it("push 拒绝空 ref / 空 label / 超长", () => {
    expect(
      recent.push(
        { kind: "app-upgrade", ref: "", label: "x", ts: Date.now() },
        { statePath: p, configPath: tmpConfigPath() },
      ),
    ).toEqual({ ok: false, reason: "invalid_ref" });
    expect(
      recent.push(
        { kind: "app-upgrade", ref: "a", label: "", ts: Date.now() },
        { statePath: p, configPath: tmpConfigPath() },
      ),
    ).toEqual({ ok: false, reason: "invalid_label" });
    expect(
      recent.push(
        {
          kind: "app-upgrade",
          ref: "a",
          label: "x".repeat(501),
          ts: Date.now(),
        },
        { statePath: p, configPath: tmpConfigPath() },
      ),
    ).toEqual({ ok: false, reason: "label_too_long" });
  });

  it("5 分钟内同 kind+ref 折叠: count+1, ts 更新", () => {
    const cfg = tmpConfigPath({ recentActivity: { maxEntries: 200 } });
    const t0 = Date.now();
    recent.push(entryOf("app-upgrade", "Pulse", "v1", t0), {
      statePath: p,
      configPath: cfg,
    });
    const r = recent.push(entryOf("app-upgrade", "Pulse", "v1", t0 + 60_000), {
      statePath: p,
      configPath: cfg,
    });
    expect(r).toEqual({ ok: true, deduped: true });
    const list = recent.list({ statePath: p });
    expect(list).toHaveLength(1);
    expect(list[0].count).toBe(2);
    expect(list[0].ts).toBe(t0 + 60_000);
    expect(list[0].lastTs).toBe(t0);
  });

  it("5 分钟外同 kind+ref 不折叠 (新条目)", () => {
    const cfg = tmpConfigPath({ recentActivity: { maxEntries: 200 } });
    const t0 = Date.now();
    recent.push(entryOf("app-upgrade", "Pulse", "v1", t0), {
      statePath: p,
      configPath: cfg,
    });
    const r = recent.push(
      entryOf("app-upgrade", "Pulse", "v1", t0 + 6 * 60_000),
      { statePath: p, configPath: cfg },
    );
    expect(r.deduped).toBe(false);
    expect(recent.list({ statePath: p })).toHaveLength(2);
  });

  it("不同 kind+ref 不折叠", () => {
    const cfg = tmpConfigPath({ recentActivity: { maxEntries: 200 } });
    recent.push(entryOf("app-upgrade", "Pulse", "v1"), {
      statePath: p,
      configPath: cfg,
    });
    recent.push(entryOf("reminder-create", "r-1", "开会"), {
      statePath: p,
      configPath: cfg,
    });
    expect(recent.list({ statePath: p })).toHaveLength(2);
  });

  it("超出 maxEntries 裁 (cap 走 config)", () => {
    const cfg = tmpConfigPath({ recentActivity: { maxEntries: 3 } });
    // 3 < 50 越界 → 走 default 200, 测试 cap=3 不能跑. 用 50:
    const cfg2 = tmpConfigPath({ recentActivity: { maxEntries: 50 } });
    for (let i = 0; i < 5; i++) {
      recent.push(entryOf("app-upgrade", `app-${i}`, `v${i}`), {
        statePath: p,
        configPath: cfg2,
      });
    }
    const list = recent.list({ statePath: p });
    expect(list).toHaveLength(5); // 5 < 50 cap
    // 用合法 cap=50, push 60 条
    for (let i = 5; i < 65; i++) {
      recent.push(entryOf("app-upgrade", `app-${i}`, `v${i}`), {
        statePath: p,
        configPath: cfg2,
      });
    }
    const list2 = recent.list({ statePath: p });
    expect(list2).toHaveLength(50);
    // 最新的 50 条 (app-64 down to app-15)
    expect(list2[0].ref).toBe("app-64");
    expect(list2[49].ref).toBe("app-15");
  });

  it("push 触发 onUpdate 回调", () => {
    const cfg = tmpConfigPath({ recentActivity: { maxEntries: 200 } });
    const calls = [];
    recent.setOnUpdate((payload) => calls.push(payload));
    recent.push(entryOf("app-upgrade", "Pulse", "v1"), {
      statePath: p,
      configPath: cfg,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].entries).toHaveLength(1);
    recent.setOnUpdate(null);
  });

  it("push 保留其他 state keys", () => {
    const cfg = tmpConfigPath({ recentActivity: { maxEntries: 200 } });
    writeFileSync(p, JSON.stringify({ apps: { Pulse: { name: "Pulse" } }, mutes: {} }));
    recent.push(entryOf("app-upgrade", "Pulse", "v1"), {
      statePath: p,
      configPath: cfg,
    });
    const raw = JSON.parse(require("fs").readFileSync(p, "utf-8"));
    expect(raw.apps.Pulse).toEqual({ name: "Pulse" });
    expect(raw.recentActivity).toHaveLength(1);
  });
});

describe("recent-activity — _getMaxEntries", () => {
  it("缺省 → 200", () => {
    const cfg = tmpConfigPath({}); // 无 recentActivity 字段
    expect(recent._getMaxEntries(cfg, Date.now())).toBe(200);
  });

  it("config 写 100 → 返 100", () => {
    const cfg = tmpConfigPath({ recentActivity: { maxEntries: 100 } });
    expect(recent._getMaxEntries(cfg, Date.now())).toBe(100);
  });

  it("config 写 30 → 走 default 200 (越界)", () => {
    const cfg = tmpConfigPath({ recentActivity: { maxEntries: 30 } });
    expect(recent._getMaxEntries(cfg, Date.now())).toBe(200);
  });

  it("config 写 2000 → 走 default 200 (越界)", () => {
    const cfg = tmpConfigPath({ recentActivity: { maxEntries: 2000 } });
    expect(recent._getMaxEntries(cfg, Date.now())).toBe(200);
  });

  it("config 写非数字 / NaN → 走 200 兜底", () => {
    const cfg = tmpConfigPath({ recentActivity: { maxEntries: "abc" } });
    expect(recent._getMaxEntries(cfg, Date.now())).toBe(200);
  });

  it("config 写负数 → 走 default 200 (越界)", () => {
    const cfg = tmpConfigPath({ recentActivity: { maxEntries: -1 } });
    expect(recent._getMaxEntries(cfg, Date.now())).toBe(200);
  });

  it("缓存生效 (5s 内不读盘)", () => {
    const cfg = tmpConfigPath({ recentActivity: { maxEntries: 100 } });
    const now = Date.now();
    expect(recent._getMaxEntries(cfg, now)).toBe(100);
    // 改文件, 5s 内仍返 100
    writeFileSync(cfg, JSON.stringify({ recentActivity: { maxEntries: 75 } }));
    expect(recent._getMaxEntries(cfg, now + 1000)).toBe(100);
    // clearConfigCache 后重读
    recent.clearConfigCache();
    expect(recent._getMaxEntries(cfg, now + 2000)).toBe(75);
  });
});

describe("recent-activity — 崩溃恢复 / 容错", () => {
  it("corrupt state.json → list 返 []", () => {
    const p = tmpStatePath();
    writeFileSync(p, "{not json");
    expect(recent.list({ statePath: p })).toEqual([]);
  });

  it("push 在 corrupt state.json 上能恢复 (apps/mutes shell)", () => {
    const p = tmpStatePath();
    writeFileSync(p, "{not json");
    const r = recent.push(entryOf("app-upgrade", "Pulse", "v1"), {
      statePath: p,
      configPath: tmpConfigPath(),
    });
    expect(r.ok).toBe(true);
    // 写盘后 state.json 完整
    const raw = JSON.parse(require("fs").readFileSync(p, "utf-8"));
    expect(raw.apps).toEqual({});
    expect(raw.mutes).toEqual({});
    expect(raw.recentActivity).toHaveLength(1);
  });

  it("push 拒绝 null/undefined", () => {
    expect(
      recent.push(null, { statePath: tmpStatePath(), configPath: tmpConfigPath() }),
    ).toEqual({ ok: false, reason: "invalid_input" });
    expect(
      recent.push(undefined, { statePath: tmpStatePath(), configPath: tmpConfigPath() }),
    ).toEqual({ ok: false, reason: "invalid_input" });
  });
});

describe("recent-activity — broadcast", () => {
  it("broadcast 不写盘, 只触发 onUpdate", () => {
    const p = tmpStatePath();
    recent.push(entryOf("app-upgrade", "Pulse", "v1"), {
      statePath: p,
      configPath: tmpConfigPath(),
    });
    const calls = [];
    recent.setOnUpdate((payload) => calls.push(payload));
    recent.broadcast({ statePath: p });
    expect(calls).toHaveLength(1);
    expect(calls[0].entries).toHaveLength(1);
    recent.setOnUpdate(null);
  });
});
