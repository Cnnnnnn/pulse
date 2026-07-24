// Phase 3 shim: vitest/native require → dist-test .cjs; build-main/esbuild → .ts.
// Kept for non-main JS consumers (src/ai, workers, detectors, …). Do not proliferate.
const _fs = require("fs");
const _path = require("path");
const _cjs = _path.join(__dirname, "../../dist-test/main/per-file/http-client.cjs");
module.exports = _fs.existsSync(_cjs) ? require(_cjs) : require("./http-client.ts");
