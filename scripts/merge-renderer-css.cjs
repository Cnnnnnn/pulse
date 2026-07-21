#!/usr/bin/env node
/**
 * esbuild 会把 import "./X.css" 抽成 renderer-dist/index.css + chunk-*.css,
 * 但 JS 不会自动 <link> 这些文件 — index.html 只链了 index.css.
 * 懒路由 (投资/新闻) 的 CSS 落在 chunk-*.css, 不合并进包就会丢样式.
 *
 * 2026-07-15: 把所有 chunk-*.css 追加进 index.css, 一次加载覆盖全站.
 *   ponytail: 桌面应用 CSS 总量 ~30KB, 全量预载可接受; 省去 runtime 注入插件.
 * 2026-07-21: 构建前 scripts/clean-renderer-css-chunks.cjs 清旧 chunk, 此处只 append 本轮产物.
 */
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "renderer-dist");
const indexPath = path.join(dir, "index.css");
if (!fs.existsSync(indexPath)) {
  console.error("[merge-renderer-css] missing", indexPath);
  process.exit(1);
}

const MERGE_MARKER = "\n/* --- merged ";

const chunks = fs
  .readdirSync(dir)
  .filter((f) => /^chunk-.*\.css$/.test(f))
  .sort();

let base = fs.readFileSync(indexPath, "utf8");
const markerIdx = base.indexOf(MERGE_MARKER);
if (markerIdx !== -1) base = base.slice(0, markerIdx);

if (!chunks.length) {
  fs.writeFileSync(indexPath, base);
  console.log("[merge-renderer-css] no chunk css, wrote base index.css only");
  process.exit(0);
}

let out = base;
for (const f of chunks) {
  out += MERGE_MARKER + f + " --- */\n";
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
