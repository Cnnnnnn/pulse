#!/usr/bin/env node
/** esbuild 换 hash 时旧 chunk-*.css 会留在 renderer-dist, merge 会重复 append 导致陈旧规则覆盖新样式. */
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "renderer-dist");
if (!fs.existsSync(dir)) process.exit(0);

let n = 0;
for (const f of fs.readdirSync(dir)) {
  if (/^chunk-.*\.css$/.test(f)) {
    fs.unlinkSync(path.join(dir, f));
    n += 1;
  }
}
if (n) console.log("[clean-renderer-css-chunks] removed", n, "stale chunk css");
