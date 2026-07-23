// Phase 3 shim: vitest createRequire → dist-test .cjs; build-main/esbuild → .ts.
const _fs = require("fs");
const _path = require("path");
const _cjs = _path.join(__dirname, "../../../dist-test/main/per-file/games/nintendo-image-headers.cjs");
module.exports = _fs.existsSync(_cjs) ? require(_cjs) : require("./nintendo-image-headers.ts");
