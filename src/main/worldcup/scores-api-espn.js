// Phase 3 shim: vitest createRequire → dist-test .cjs; build-main/esbuild → .ts.
const _fs = require("fs");
const _path = require("path");
const _cjs = _path.join(__dirname, "../../../dist-test/main/per-file/worldcup/scores-api-espn.cjs");
module.exports = _fs.existsSync(_cjs) ? require(_cjs) : require("./scores-api-espn.ts");
