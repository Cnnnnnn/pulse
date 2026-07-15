#!/usr/bin/env node
/**
 * esbuild 会把 import "./X.css" 抽成 renderer-dist/index.css + chunk-*.css,
 * 但 JS 不会自动 <link> 这些文件 — index.html 只链了 index.css.
 * 懒路由 (投资/新闻) 的 CSS 落在 chunk-*.css, 不合并进包就会丢样式.
 *
 * 2026-07-15: 把所有 chunk-*.css 追加进 index.css, 一次加载覆盖全站.
 *   ponytail: 桌面应用 CSS 总量 ~30KB, 全量预载可接受; 省去 runtime 注入插件.
 */
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "renderer-dist");
const indexPath = path.join(dir, "index.css");
if (!fs.existsSync(indexPath)) {
  console.error("[merge-renderer-css] missing", indexPath);
  process.exit(1);
}

const chunks = fs
  .readdirSync(dir)
  .filter((f) => /^chunk-.*\.css$/.test(f))
  .sort();

if (!chunks.length) {
  console.log("[merge-renderer-css] no chunk css, skip");
  process.exit(0);
}

let out = fs.readFileSync(indexPath, "utf8");
for (const f of chunks) {
  out += "\n/* --- merged " + f + " --- */\n";
  out += fs.readFileSync(path.join(dir, f), "utf8");
  out += "\n";
}
fs.writeFileSync(indexPath, out);
console.log(
  "[merge-renderer-css] merged",
  chunks.length,
  "chunk css → index.css (",
  out.length,
  "bytes)",
);
