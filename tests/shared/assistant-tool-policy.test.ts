import { describe, expect, it } from "vitest";
import {
  ASK_TOOLS,
  MAIN_EXECUTION_TOOLS,
  RENDERER_EXECUTION_TOOLS,
  TOOL_POLICY,
  checkToolPolicy,
  getToolPolicy,
} from "../../src/shared/assistant-tool-policy";
import { ASSISTANT_TOOL_DEFS } from "../../src/ai/assistant-tools-schema";
import {
  CONFIRM_REQUIRED_TOOLS,
  MAIN_PROCESS_TOOLS,
  RENDERER_TOOLS,
} from "../../src/ai/assistant-prompt";

describe("assistant-tool-policy — 覆盖完整性", () => {
  it("策略表覆盖 schema 中全部工具，无遗漏", () => {
    const missing = ASSISTANT_TOOL_DEFS.map((d) => d.name).filter(
      (name) => !(name in TOOL_POLICY),
    );
    expect(missing).toEqual([]);
  });

  it("策略表不含 schema 之外的冗余工具", () => {
    const declared = new Set(ASSISTANT_TOOL_DEFS.map((d) => d.name));
    const extra = Object.keys(TOOL_POLICY).filter((name) => !declared.has(name));
    expect(extra).toEqual([]);
  });

  it("工具总数为 39", () => {
    expect(Object.keys(TOOL_POLICY)).toHaveLength(39);
    expect(ASSISTANT_TOOL_DEFS).toHaveLength(39);
  });

  it("当前无 deny 档工具（deny 仅作未声明的兜底）", () => {
    const denied = Object.entries(TOOL_POLICY)
      .filter(([, p]) => p.risk === "deny")
      .map(([name]) => name);
    expect(denied).toEqual([]);
  });
});

describe("assistant-tool-policy — ask 档与既有确认名单一致", () => {
  it("ask 档恰好 4 个工具", () => {
    expect([...ASK_TOOLS].sort()).toEqual([
      "bulk_upgrade_all",
      "create_reminder",
      "trigger_check",
      "upgrade_app",
    ]);
  });

  it("ASK_TOOLS 与 assistant-prompt 的 CONFIRM_REQUIRED_TOOLS 集合相同", () => {
    expect([...ASK_TOOLS].sort()).toEqual([...CONFIRM_REQUIRED_TOOLS].sort());
  });
});

describe("assistant-tool-policy — fail-closed", () => {
  it("未声明工具按 deny 处理", () => {
    expect(getToolPolicy("not_a_real_tool")).toMatchObject({ risk: "deny" });
    expect(checkToolPolicy("not_a_real_tool", {})).toEqual({
      kind: "deny",
      reason: "undeclared_tool:not_a_real_tool",
    });
  });

  it("非法 tool 值按 deny 处理", () => {
    expect(checkToolPolicy(undefined, {})).toEqual({
      kind: "deny",
      reason: "invalid_tool",
    });
    expect(checkToolPolicy("", {})).toEqual({
      kind: "deny",
      reason: "invalid_tool",
    });
    expect(checkToolPolicy(42, {})).toEqual({
      kind: "deny",
      reason: "invalid_tool",
    });
  });
});

describe("assistant-tool-policy — checkToolPolicy 三态", () => {
  it("allow 档工具返回 allow", () => {
    expect(checkToolPolicy("query_apps", {})).toEqual({ kind: "allow" });
    expect(checkToolPolicy("pulse_open", { href: "pulse://nav/versions" })).toEqual({
      kind: "allow",
    });
  });

  it("ask 档工具返回 confirm", () => {
    expect(checkToolPolicy("upgrade_app", { appName: "X" })).toEqual({
      kind: "confirm",
    });
    expect(checkToolPolicy("bulk_upgrade_all", {})).toEqual({ kind: "confirm" });
  });

  it("guard 拒绝时返回 deny 及理由", () => {
    TOOL_POLICY.list_nav.guard = () => "guard_rejected";
    try {
      expect(checkToolPolicy("list_nav", {})).toEqual({
        kind: "deny",
        reason: "guard_rejected",
      });
    } finally {
      delete TOOL_POLICY.list_nav.guard;
    }
  });

  it("guard 通过时继续按 risk 判定", () => {
    // 注意: 勿对已有真实 guard 的工具 (create_reminder / upgrade_app) 打临时补丁 ——
    // 清理时若用 delete 会把真实 guard 一并抹掉, 污染后续用例 (Step 6 曾踩)。
    const prevQuery = TOOL_POLICY.query_apps.guard;
    const prevBulk = TOOL_POLICY.bulk_upgrade_all.guard;
    TOOL_POLICY.query_apps.guard = () => null;
    TOOL_POLICY.bulk_upgrade_all.guard = () => null;
    try {
      expect(checkToolPolicy("query_apps", {})).toEqual({ kind: "allow" });
      expect(checkToolPolicy("bulk_upgrade_all", {})).toEqual({ kind: "confirm" });
    } finally {
      if (prevQuery) TOOL_POLICY.query_apps.guard = prevQuery;
      else delete TOOL_POLICY.query_apps.guard;
      if (prevBulk) TOOL_POLICY.bulk_upgrade_all.guard = prevBulk;
      else delete TOOL_POLICY.bulk_upgrade_all.guard;
    }
  });

  it("guard 收到非对象 params 时降级为空对象，不抛错", () => {
    TOOL_POLICY.list_nav.guard = (params) =>
      Object.keys(params).length === 0 ? "empty_params" : null;
    try {
      expect(checkToolPolicy("list_nav", null)).toEqual({
        kind: "deny",
        reason: "empty_params",
      });
      expect(checkToolPolicy("list_nav", [1, 2])).toEqual({
        kind: "deny",
        reason: "empty_params",
      });
    } finally {
      delete TOOL_POLICY.list_nav.guard;
    }
  });
});

describe("assistant-tool-policy — 执行域派生（D：执行域与权限档同源）", () => {
  it("执行域分布：main 20 / renderer 19，合计覆盖全部 39 项", () => {
    expect(MAIN_EXECUTION_TOOLS.size).toBe(20);
    expect(RENDERER_EXECUTION_TOOLS.size).toBe(19);
    expect(MAIN_EXECUTION_TOOLS.size + RENDERER_EXECUTION_TOOLS.size).toBe(
      Object.keys(TOOL_POLICY).length,
    );
  });

  it("两个执行域互斥，且并集覆盖策略表全部工具", () => {
    const overlap = [...MAIN_EXECUTION_TOOLS].filter((t) =>
      RENDERER_EXECUTION_TOOLS.has(t),
    );
    expect(overlap).toEqual([]);
    const union = new Set([...MAIN_EXECUTION_TOOLS, ...RENDERER_EXECUTION_TOOLS]);
    expect([...union].sort()).toEqual(Object.keys(TOOL_POLICY).sort());
  });

  it("每项工具都显式声明 execution（无遗漏/无非法值）", () => {
    const bad = Object.entries(TOOL_POLICY)
      .filter(([, p]) => p.execution !== "main" && p.execution !== "renderer")
      .map(([name]) => name);
    expect(bad).toEqual([]);
  });

  it("assistant-prompt 的派生出品与策略表一致（消除三处维护）", () => {
    expect([...MAIN_PROCESS_TOOLS].sort()).toEqual([...MAIN_EXECUTION_TOOLS].sort());
    expect([...RENDERER_TOOLS].sort()).toEqual([...RENDERER_EXECUTION_TOOLS].sort());
  });
});

describe("assistant-tool-policy — 参数级 guard（Step 6）", () => {
  const NOW = 1_700_000_000_000;

  it("当前生效的 guard 恰为 create_reminder 与 upgrade_app", () => {
    const withGuard = Object.entries(TOOL_POLICY)
      .filter(([, p]) => p.guard)
      .map(([name]) => name)
      .sort();
    expect(withGuard).toEqual(["create_reminder", "upgrade_app"]);
  });

  describe("create_reminder — triggerAt 须为合理未来", () => {
    it("超出容忍窗口的过去时间被拒", () => {
      expect(
        checkToolPolicy("create_reminder", { triggerAt: NOW - 120_000 }, { now: NOW }),
      ).toEqual({ kind: "deny", reason: "triggerAt 不能是过去时间" });
    });

    it("容忍窗口内的「此刻」通过（允许轻微时钟偏差）", () => {
      expect(
        checkToolPolicy("create_reminder", { triggerAt: NOW - 30_000 }, { now: NOW }),
      ).toEqual({ kind: "confirm" });
    });

    it("未来时间通过", () => {
      expect(
        checkToolPolicy("create_reminder", { triggerAt: NOW + 3_600_000 }, { now: NOW }),
      ).toEqual({ kind: "confirm" });
    });

    it("非数字 triggerAt 被拒", () => {
      expect(
        checkToolPolicy("create_reminder", { triggerAt: "明天" }, { now: NOW }),
      ).toEqual({ kind: "deny", reason: "triggerAt 必须是毫秒时间戳" });
    });

    it("缺 triggerAt 被拒（结构校验之外的第二道闸）", () => {
      expect(checkToolPolicy("create_reminder", {}, { now: NOW })).toEqual({
        kind: "deny",
        reason: "triggerAt 必须是毫秒时间戳",
      });
    });
  });

  describe("upgrade_app — 目标须在监控名单内", () => {
    it("名单内的应用通过", () => {
      expect(
        checkToolPolicy("upgrade_app", { appName: "WeChat" }, { monitoredApps: ["WeChat"] }),
      ).toEqual({ kind: "confirm" });
    });

    it("名单外的应用被拒（拦模型幻觉）", () => {
      expect(
        checkToolPolicy(
          "upgrade_app",
          { appName: "不存在的应用" },
          { monitoredApps: ["WeChat"] },
        ),
      ).toEqual({ kind: "deny", reason: "未监控的应用: 不存在的应用" });
    });

    it("名单不可用（undefined）时跳过校验 —— 宽松降级不误伤", () => {
      expect(checkToolPolicy("upgrade_app", { appName: "任意" }, {})).toEqual({
        kind: "confirm",
      });
      expect(checkToolPolicy("upgrade_app", { appName: "任意" })).toEqual({
        kind: "confirm",
      });
    });

    it("空名单照常拒绝（与「名单不可用」语义不同）", () => {
      expect(
        checkToolPolicy("upgrade_app", { appName: "任意" }, { monitoredApps: [] }),
      ).toEqual({ kind: "deny", reason: "未监控的应用: 任意" });
    });

    it("空白 appName 被拒", () => {
      expect(
        checkToolPolicy("upgrade_app", { appName: "  " }, { monitoredApps: ["WeChat"] }),
      ).toEqual({ kind: "deny", reason: "appName 不能为空" });
    });
  });
});
