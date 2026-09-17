/**
 * AI 助手工具 — 策略表（主进程与 renderer 共用）.
 *
 * 单一来源: 工具的权限档 + 参数级守卫.
 * - allow: 直接执行
 * - ask:   需用户确认后执行（确认文案由 renderer 提供 —— 依赖其运行时状态，故不放本模块）
 * - deny:  拒绝执行
 *
 * fail-closed: 未在此声明的工具一律按 deny 处理。新增工具必须显式登记，
 * 避免「忘记加确认名单即静默放行」这类默认放行风险。
 */

import { parseReminderTime } from "./reminder-time";

export type ToolRisk = "allow" | "ask" | "deny";

/**
 * 参数级守卫的上下文。
 *
 * 本模块位于 `src/shared/`（main 与 renderer 共用），**不能** import 主进程的
 * state-store —— 需要 main 侧数据的校验（如「该应用是否在监控列表内」）一律
 * 经此上下文注入。
 */
export type ToolGuardContext = {
  /**
   * 已监控应用名列表（main 侧注入）。
   * - `undefined` = 名单不可用（如 renderer 侧无此数据）→ 跳过依赖名单的校验，
   *   宽松降级，避免误伤。
   * - `[]` = 确实没有监控任何应用 → 照常拒绝。
   */
  monitoredApps?: readonly string[];
  /** 当前时间戳（ms）。缺省用 Date.now()；仅测试注入固定值。 */
  now?: number;
};

/**
 * 参数级守卫：返回非空字符串 = 拒绝理由；返回 null = 通过。
 * 用于拦截结构合法但业务上不该执行的调用（如目标不在监控列表内）。
 */
export type ToolGuard = (
  params: Record<string, unknown>,
  ctx?: ToolGuardContext,
) => string | null;

/** 工具执行域：main = 主进程（可访问 state / 数据层）；renderer = 渲染层（UI 动作） */
export type ToolExecution = "main" | "renderer";

export type ToolPolicy = {
  risk: ToolRisk;
  /**
   * 执行域。与 `risk` **正交**：execution 决定「在哪里执行」，risk 决定「是否放行 /
   * 是否需要用户确认」。两者合一后，新增工具只需改 schema + 本表两处。
   */
  execution: ToolExecution;
  guard?: ToolGuard;
};

/** 策略判定结果（三态） */
export type ToolPolicyVerdict =
  | { kind: "allow" }
  | { kind: "confirm" }
  | { kind: "deny"; reason: string };

/** triggerAt 容忍窗口 (ms) —— 允许「此刻」与轻微时钟偏差, 拒绝明显过去的时间 */
const TRIGGER_AT_PAST_TOLERANCE_MS = 60_000;

/** create_reminder: 支持模型时间字符串和 UI 时间戳，不早于 now - 60s。 */
const guardFutureTrigger: ToolGuard = (params, ctx) => {
  const now = typeof ctx?.now === "number" ? ctx.now : Date.now();
  const at = parseReminderTime(params.triggerAt, now);
  if (at === null) {
    return "triggerAt 必须是有效的 ISO 时间、相对时间或毫秒时间戳";
  }
  if (at < now - TRIGGER_AT_PAST_TOLERANCE_MS) {
    return "triggerAt 不能是过去时间";
  }
  return null;
};

/** upgrade_app: 目标须在已监控列表内（名单不可用时跳过 —— 宽松降级，避免误伤） */
const guardAppMonitored: ToolGuard = (params, ctx) => {
  const name = params.appName;
  if (typeof name !== "string" || name.trim().length === 0) {
    return "appName 不能为空";
  }
  const known = ctx?.monitoredApps;
  if (!known) return null;
  if (!known.includes(name)) {
    return `未监控的应用: ${name}`;
  }
  return null;
};

export const TOOL_POLICY: Record<string, ToolPolicy> = {
  // ===== 渲染层执行域（19）=====
  // ---- UI 动作 ----
  pulse_open: { risk: "allow", execution: "renderer" },
  navigate: { risk: "allow", execution: "renderer" },
  open_search: { risk: "allow", execution: "renderer" },
  open_search_result: { risk: "allow", execution: "renderer" },
  open_settings: { risk: "allow", execution: "renderer" },
  open_digest: { risk: "allow", execution: "renderer" },
  open_reminders: { risk: "allow", execution: "renderer" },
  open_concerts: { risk: "allow", execution: "renderer" },
  open_movie_detail: { risk: "allow", execution: "renderer" },
  open_finance_article: { risk: "allow", execution: "renderer" },
  open_ithome_article: { risk: "allow", execution: "renderer" },
  open_stock_diagnosis: { risk: "allow", execution: "renderer" },

  // ---- 需确认的动作（有副作用） ----
  upgrade_app: { risk: "ask", execution: "renderer", guard: guardAppMonitored },
  bulk_upgrade_all: { risk: "ask", execution: "renderer" },
  trigger_check: { risk: "ask", execution: "renderer" },
  create_reminder: { risk: "ask", execution: "renderer", guard: guardFutureTrigger },

  // ---- 演出监控（本地策展，可逆） ----
  add_concert_watch: { risk: "allow", execution: "renderer" },
  remove_concert_watch: { risk: "allow", execution: "renderer" },
  refresh_concerts: { risk: "allow", execution: "renderer" },

  // ===== 主进程执行域（20）=====
  // ---- 查询类（只读） ----
  query_apps: { risk: "allow", execution: "main" },
  query_funds: { risk: "allow", execution: "main" },
  query_stocks: { risk: "allow", execution: "main" },
  query_stock_diagnosis: { risk: "allow", execution: "main" },
  query_metals: { risk: "allow", execution: "main" },
  query_movies: { risk: "allow", execution: "main" },
  query_digest: { risk: "allow", execution: "main" },
  query_leaderboard: { risk: "allow", execution: "main" },
  query_github: { risk: "allow", execution: "main" },
  query_ai_usage: { risk: "allow", execution: "main" },
  query_reminders: { risk: "allow", execution: "main" },
  query_concerts: { risk: "allow", execution: "main" },
  search: { risk: "allow", execution: "main" },
  list_nav: { risk: "allow", execution: "main" },

  // ---- AI 解读类（消耗 token，只读） ----
  interpret_finance: { risk: "allow", execution: "main" },
  summarize_ithome: { risk: "allow", execution: "main" },
  advise_stocks: { risk: "allow", execution: "main" },

  // ---- 长期记忆 ----
  remember_fact: { risk: "allow", execution: "main" },
  forget_fact: { risk: "allow", execution: "main" },
  list_memory: { risk: "allow", execution: "main" },
};

/** 需用户确认的工具集（自策略表派生，勿另立来源） */
export const ASK_TOOLS: ReadonlySet<string> = new Set(
  Object.entries(TOOL_POLICY)
    .filter(([, p]) => p.risk === "ask")
    .map(([name]) => name),
);

/** 主进程执行域工具集（自策略表派生，勿另立来源） */
export const MAIN_EXECUTION_TOOLS: ReadonlySet<string> = new Set(
  Object.entries(TOOL_POLICY)
    .filter(([, p]) => p.execution === "main")
    .map(([name]) => name),
);

/** 渲染层执行域工具集（自策略表派生，勿另立来源） */
export const RENDERER_EXECUTION_TOOLS: ReadonlySet<string> = new Set(
  Object.entries(TOOL_POLICY)
    .filter(([, p]) => p.execution === "renderer")
    .map(([name]) => name),
);

/**
 * deny 档兜底策略。`execution` 仅为满足类型 —— deny 档不会被放行执行，该字段无实际意义。
 */
const DENIED_POLICY: ToolPolicy = { risk: "deny", execution: "main" };

/**
 * 取工具策略。未声明工具返回 deny 档 —— fail-closed。
 * 注意: 返回 deny 是缺省兜底，不代表该工具在策略表里，调用方勿据此持久化。
 */
export function getToolPolicy(tool: unknown): ToolPolicy {
  if (typeof tool !== "string" || tool.length === 0) return DENIED_POLICY;
  return TOOL_POLICY[tool] ?? DENIED_POLICY;
}

/**
 * 判定一次工具调用是否放行。
 * 与 validateToolCall（结构校验: tool 名/required/enum）职责分离 —— 本函数只管
 * 权限档与参数级业务规则，两者叠加使用。
 */
export function checkToolPolicy(
  tool: unknown,
  params: unknown,
  ctx?: ToolGuardContext,
): ToolPolicyVerdict {
  if (typeof tool !== "string" || tool.length === 0) {
    return { kind: "deny", reason: "invalid_tool" };
  }
  const policy = TOOL_POLICY[tool];
  if (!policy) {
    return { kind: "deny", reason: `undeclared_tool:${tool}` };
  }
  if (policy.risk === "deny") {
    return { kind: "deny", reason: `policy_denied:${tool}` };
  }
  if (policy.guard) {
    const obj =
      params && typeof params === "object" && !Array.isArray(params)
        ? (params as Record<string, unknown>)
        : {};
    const reason = policy.guard(obj, ctx);
    if (reason) return { kind: "deny", reason };
  }
  return policy.risk === "ask" ? { kind: "confirm" } : { kind: "allow" };
}
