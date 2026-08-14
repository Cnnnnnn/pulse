/**
 * src/main/ipc/register-versions-overview.js
 *
 * Command palette 搜索入口.
 *
 * 2026-07-10: 删除洞察 (overview) 页后, 移除 5 个 overview-* handler 和
 * versions-overview-advisor 依赖. 检查更新统一由 register-core 的
 * `check-updates` handler 负责；这里不再注册第二个检查入口.
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";

export async function commandSearch(_ctx: any, q: any) {
  if (!q || typeof q !== "string") return { ok: true, results: [] };
  const lower = q.toLowerCase();
  const results: any[] = [];
  if (lower.includes("check") || lower.includes("更新")) {
    results.push({ id: "action-check", label: "检查更新", kind: "action" });
  }
  for (const v of [
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

export function registerVersionsOverviewHandlers(ctx: any) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;
  safeHandle("versions:command-search", async (_e: any, { q }: any) =>
    commandSearch(ctx, q),
  );
}

module.exports = {
  registerVersionsOverviewHandlers,
  commandSearch,
};
