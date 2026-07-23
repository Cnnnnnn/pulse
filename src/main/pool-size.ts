/**
 * src/main/pool-size.ts
 *
 * Worker pool size 决策 — 单独抽出来为了:
 *   1) 单测 size 计算 (不需要 fork electron 跑 bootstrap)
 *   2) 集中调整 (未来加 cap=6, 跟 app 数动态算)
 *
 * v2.16 改动: cap=4 (之前是 cpus-1, 8 核机 = 7 个 worker 浪费).
 *   - 13 app 跑 detect chain, 单 app 内 detector 顺序, app 间并行 → 4 worker 完全饱和
 *   - 实测启动节省 ~50-100ms (少 spawn 3 个 worker, 每个 init V8 + require chain ~20ms)
 *   - 小机器 (2-4 核) 仍走 cpus-1, 不退化
 *   - 未来: app 数到 30+ 可改 cap=6
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 触发原因: esbuild 看到 `export`/`import * as` 等 ESM
//          关键字就用 `__esm` 包装, 把模块级 `var path = ...` 暴露到外层作用域, 导致
//          src/main/index.js 的 `path = require("path")` 被改名 pathN, post-build path
//          rewrite (scripts/build-main.cjs) 匹配不到 `path.join(...)` 字面量.
//          走 __commonJS 包装则与现有 .js 模块同形, path 保留裸名. 升级路径: esbuild
//          升级到支持按模块声明命名空间隔离后再切回 ESM 风格.
import type * as osType from "node:os";
const os: typeof osType = require("node:os");

const DEFAULT_POOL_CAP = 4;
const MIN_POOL_SIZE = 2;

/**
 * 算 worker pool size. 单独 export 给 main/index.js 用 + 测试覆盖.
 *
 * @param opts.cpus   OS CPU 数 (默认读 os.cpus().length)
 * @param opts.cap    上限 (默认 4)
 * @param opts.min    下限 (默认 2)
 * @returns 推荐的 pool size
 */
function computePoolSize(
  opts: { cpus?: number; cap?: number; min?: number } = {},
): number {
  // ponytail: os.cpus() 在沙箱/异常环境可能返 undefined; 走 `|| 4`
  // fallback, 与原 js 行为一致 (undefined/null/0 → 4, 其它保留).
  const cpus =
    typeof opts.cpus === "number"
      ? opts.cpus
      : (os.cpus()?.length ?? 4) || 4;
  const cap = opts.cap ?? DEFAULT_POOL_CAP;
  const min = opts.min ?? MIN_POOL_SIZE;
  // 算法: cpus-1 (留 1 个核给 main + renderer), 但 cap 上限, min 下限
  return Math.min(cap, Math.max(min, cpus - 1));
}

module.exports = {
  computePoolSize,
  DEFAULT_POOL_CAP,
  MIN_POOL_SIZE,
};