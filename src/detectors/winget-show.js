// Phase 5 shim: vitest/native require → dist-test .cjs; build-main/esbuild → .ts.
// Kept for workers CJS consumers. Do not proliferate.
const _fs = require("fs");
const _path = require("path");
const _cjs = _path.join(__dirname, "../../dist-test/detectors/winget-show.cjs");
module.exports = _fs.existsSync(_cjs) ? require(_cjs) : require("./winget-show.ts");
