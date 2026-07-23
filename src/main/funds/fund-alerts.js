// Phase 3 Batch 4 shim: 业务代码仍 require "./fund-alerts" 无后缀. 这个 shim
// 兼容两层调用:
//   1. 业务 require (Node cjs, 走 esbuild): build-main.cjs bundle 时遇到 .js
//      shim, 会内联 require 解析 .ts -> .ts 编译后走, 输出仍然保留 esm/cjs 兼容.
//   2. 测试侧 createRequire(import.meta.url): 拿 native cjs require, 不能
//      解析 .ts; 转去 dist-test/main/per-file/funds/fund-alerts.cjs (由
//      tests/_setup/build-main-ts.cjs 同步编译).
//
// ceiling: 等 Batch 9 把所有业务 require 改为 "./*.ts" 后, 此 shim 删除.
module.exports = require("../../../dist-test/main/per-file/funds/fund-alerts.cjs");
