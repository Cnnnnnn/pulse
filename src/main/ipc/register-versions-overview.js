/**
 * src/main/ipc/register-versions-overview.js
 *
 * Command palette 搜索 + 检查更新入口.
 *
 * 2026-07-10: 删除洞察 (overview) 页后, 移除 5 个 overview-* handler 和
 * versions-overview-advisor 依赖. 保留 command-search 和 run-check.
 */
const stateStore = require("../state-store");
const { runCheckQueued } = require("../check-runner");
const { buildRunCheckDeps } = require("../run-check-deps");

async function commandSearch(_ctx, q) {
  if (!q || typeof q !== "string") return { ok: true, results: [] };
  const lower = q.toLowerCase();
  const results = [];
  if (lower.includes("check") || lower.includes("更新")) {
    results.push({ id: "action-check", label: "检查更新", kind: "action" });
  }
  for (const v of [
    "overview",
    "library",
    "diagnostics",
    "settings",
  ]) {
    if (v.startsWith(lower) || lower.includes(v)) {
      results.push({ id: v, label: v, kind: "view" });
    }
  }
  return { ok: true, results: results.slice(0, 10) };
}

function registerVersionsOverviewHandlers(ctx) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;
  safeHandle("versions:command-search", async (_e, { q }) =>
    commandSearch(ctx, q),
  );
  // v2.50 (T5): TopBar / OverviewEmptyState CTA — 复用 check-runner.runCheckQueued
  // (跟 register-core.js 的 check-updates 同一个入口, 不重复实现).
  //
  // runCheckQueued 现在并发手动点击会返 { started: false, reason: "already_running" }
  // (而不是把第一次的 in-flight Promise 透传出去), 所以这里不要无脑包成
  // { started: true } — 透传底层的 started/reason/error 让 renderer 区分 "已在跑"
  // 和 "真失败".
  safeHandle("versions:run-check", async () =>
    runCheckQueued(
      buildRunCheckDeps({
        getConfig: ctx.getConfig,
        pool: ctx.pool,
        getWindow: ctx.getWindow,
        onCheckComplete: ctx.onCheckComplete,
        stateStore,
      }),
      { silent: false },
    )
      .then((r) => {
        // 正常完成 (runCheck 自身无返回值时, 返 true; 已并发返 already_running 时透传)
        if (r && r.started === false) return r;
        return { started: true };
      })
      .catch((e) => ({
        started: false,
        reason: "check_failed",
        error: (e && e.message) || String(e),
      })),
  );
}

module.exports = {
  registerVersionsOverviewHandlers,
  commandSearch,
};
