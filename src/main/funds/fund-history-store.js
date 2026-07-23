// Phase 3 Batch 4 shim: business require "./fund-history-store" 无后缀, shim
// 跳到 per-file cjs (tests/_setup/build-main-ts.cjs 同步编译).
module.exports = require("../../../dist-test/main/per-file/funds/fund-history-store.cjs");
