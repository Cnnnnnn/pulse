// Phase 5 shim: vitest/native require → dist-test .cjs; build-main/esbuild → .ts.
const _fs = require("fs");
const _path = require("path");
const _cjs = _path.join(__dirname, "../../dist-test/ai-sessions/text-utils.cjs");
module.exports = _fs.existsSync(_cjs) ? require(_cjs) : require("./text-utils.ts");
