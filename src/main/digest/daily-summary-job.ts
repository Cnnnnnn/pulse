/**
 * src/main/digest/daily-summary-job.ts
 *
 * Phase I1+I5: scheduler — checks every 60s whether to fire the daily digest
 * notification. Pure tick logic; notification sending is injected for test.
 *
 * Public API:
 *   startDailySummaryJob(deps) → { stop, triggerNow }
 *   __resetForTest()  // clear module-level interval handle between tests
 *
 * deps:
 *   getState()           → state object
 *   setState(partial)    → merge into state (only used to write last_push_date)
 *   getConfig()          → { notifications: { quiet_hours_start, quiet_hours_end } }
 *   sendNotification(n)  → { title, body }
 *   aggregate(state, { now }) → { date, sections, lines }   (optional; defaults to ./aggregate)
 *   now()                → Date (defaults to () => new Date())
 */

const { inQuietHours } = require("../notification-policy.ts");
const { aggregate: defaultAggregate } = require("./aggregate.ts");
const {
  resolvePrompt: defaultResolvePrompt,
} = require("../../ai/prompt-registry");
const defaultSharedLlm = require("../../ai/shared-llm");

const DEFAULT_TIME = "08:30";
// A7 v3: LLM 改写超时 (硬上限). 失败/超时回退原 lines, 不阻塞 push.
export const REWRITE_TIMEOUT_MS = 8000;
const _handle: { interval: any; deps: any } = { interval: null, deps: null };

function parseTargetMinutes(hhmm: unknown): number | null {
  if (typeof hhmm !== "string") return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

export async function checkAndPush(deps: any): Promise<any> {
  const state = deps.getState() || {};
  const cfg = state.daily_digest || {};
  if (cfg.enabled === false) return { skipped: "disabled" };

  const nowFn = deps.now || (() => new Date());
  const now = nowFn();
  const notifCfg = (deps.getConfig && deps.getConfig().notifications) || {};
  if (notifCfg.quiet_hours_start && notifCfg.quiet_hours_end) {
    if (
      inQuietHours(now, notifCfg.quiet_hours_start, notifCfg.quiet_hours_end)
    ) {
      return { skipped: "quiet_hours" };
    }
  }

  const target =
    parseTargetMinutes(cfg.time) ?? parseTargetMinutes(DEFAULT_TIME);
  if (target === null) return { skipped: "bad_time" };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin !== target) return { skipped: "wrong_minute" };

  const today = ymd(now);
  if (cfg.last_push_date === today) return { skipped: "already_pushed_today" };

  const aggregate = deps.aggregate || defaultAggregate;
  let result: any;
  try {
    result = aggregate(state, { now });
  } catch (err: any) {
    return { skipped: "aggregate_threw", error: err && err.message };
  }
  if (!result || !Array.isArray(result.lines) || result.lines.length === 0) {
    return { skipped: "empty_lines" };
  }

  // A7 v3: LLM 改写 result.lines → bodyLines. 失败/超时回退原 lines, push 不破.
  let bodyLines = result.lines;
  let rewritten = false;
  try {
    const rewriteDeps = {
      sharedLlm: deps.sharedLlm || defaultSharedLlm,
      resolvePrompt: deps.resolvePrompt || defaultResolvePrompt,
    };
    const next = await tryRewriteSummary(
      result.lines,
      result.date,
      rewriteDeps,
    );
    if (Array.isArray(next) && next.length > 0) {
      bodyLines = next;
      rewritten = next !== result.lines;
    }
  } catch {
    // swallow — push 走原 lines
  }

  deps.sendNotification({
    title: `🌅 Pulse 早报 · ${result.date}`,
    body: bodyLines.join("\n"),
  });

  deps.setState({
    daily_digest: {
      ...cfg,
      last_push_date: today,
    },
  });

  return { pushed: true, lines: result.lines.length, rewritten };
}

/**
 * A7 v3: 用 LLM 把硬编码的要点行改写成可读段落. 失败/超时回退原 lines.
 * 纯函数 + 依赖注入, 便于单测.
 *
 * @param lines    - aggregator 输出的要点行
 * @param date     - 'YYYY-MM-DD'
 * @param deps
 * @param deps.sharedLlm    - 含 chatCompletion(messages, opts) => Promise<{ok, text?, reason?}>
 * @param deps.resolvePrompt - (key) => {system, rules, fewShot}
 * @param deps.timeoutMs=8000
 * @returns 改写后的 lines 或原 lines
 */
export async function tryRewriteSummary(
  lines: string[],
  date: string,
  deps: any,
): Promise<string[]> {
  if (!Array.isArray(lines) || lines.length === 0) return lines;
  if (
    !deps ||
    !deps.sharedLlm ||
    typeof deps.sharedLlm.chatCompletion !== "function"
  ) {
    return lines;
  }
  let prompt: any;
  try {
    prompt = (deps.resolvePrompt || defaultResolvePrompt)(
      "daily_digest_summary",
    );
  } catch {
    return lines;
  }

  if (!prompt || typeof prompt.system !== "string") return lines;

  const userContent = [
    prompt.rules || "",
    `日期: ${date}`,
    "要点:",
    ...lines.map((l) => `  ${l}`),
  ].join("\n");

  const messages = [
    { role: "system", content: prompt.system },
    { role: "user", content: userContent },
  ];

  const timeoutMs =
    typeof deps.timeoutMs === "number" ? deps.timeoutMs : REWRITE_TIMEOUT_MS;
  // ponytail: chatCompletion 内部 try/catch 已包, 这里再 Promise.race 兜 8s.
  // 不传 httpClient → 走 shared-llm 内部默认 (120s), 我们外层卡 8s.
  const llmPromise = deps.sharedLlm.chatCompletion(messages);
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve({ ok: false, reason: "timeout" }), timeoutMs);
  });
  let result: any;
  try {
    result = await Promise.race([llmPromise, timeoutPromise]);
  } catch {
    return lines;
  }
  if (
    !result ||
    !result.ok ||
    typeof result.text !== "string" ||
    !result.text.trim()
  ) {
    return lines;
  }
  const rewritten = result.text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return rewritten.length > 0 ? rewritten : lines;
}

export function startDailySummaryJob(deps: any): { stop: () => void; triggerNow: () => Promise<any> } {
  if (!deps || typeof deps.sendNotification !== "function") {
    throw new TypeError(
      "startDailySummaryJob: deps.sendNotification is required",
    );
  }
  if (_handle.interval) {
    clearInterval(_handle.interval);
  }
  _handle.deps = deps;
  _handle.interval = setInterval(() => {
    try {
      checkAndPush(_handle.deps);
    } catch {
      /* swallow — never let timer callback crash */
    }
  }, 60_000);

  return {
    stop: () => {
      if (_handle.interval) {
        clearInterval(_handle.interval);
        _handle.interval = null;
      }
    },
    triggerNow: () => checkAndPush(deps),
  };
}

export function __resetForTest(): void {
  if (_handle.interval) {
    clearInterval(_handle.interval);
    _handle.interval = null;
  }
  _handle.deps = null;
}

module.exports = {
  startDailySummaryJob,
  __resetForTest,
  parseTargetMinutes,
  checkAndPush,
  tryRewriteSummary,
};