// Phase 5 shim: vitest/native require → dist-test .cjs; build-main/esbuild → .ts.
// Kept for workers/detectors/ai-sessions CJS consumers. Do not proliferate.
const _fs = require("fs");
const _path = require("path");
const _cjs = _path.join(__dirname, "../../dist-test/utils/version-utils.cjs");
module.exports = _fs.existsSync(_cjs) ? require(_cjs) : require("./version-utils.ts");
