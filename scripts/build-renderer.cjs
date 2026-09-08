#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");
const rendererOutDir = path.join(rootDir, "renderer-dist");
// 生产/打包默认 minify；`npm run dev` 的 watcher 带 NODE_ENV=development，
// 该路径保留可读产物，方便在 Electron DevTools 里断点调试。
const isDev = process.env.NODE_ENV === "development";
const aliases = {
  react: "preact/compat",
  "react-dom": "preact/compat",
  "react/jsx-runtime": "preact/jsx-runtime",
  "react-dom/client": "preact/compat/client",
};
const sharedOptions = {
  loader: {
    ".jsx": "jsx",
    ".ts": "ts",
    ".tsx": "tsx",
  },
  jsx: "automatic",
  jsxImportSource: "preact",
  target: "es2020",
  alias: aliases,
  // 不把非 ASCII 转成 \uXXXX：UI 文案大量中文，index.html / share-card.html
  // 都已声明 <meta charset="UTF-8">，直接输出 UTF-8 安全且更小。
  charset: "utf8",
  // 生产构建压缩（JS + CSS）。debug 构建保留可读产物。
  ...(isDev ? {} : { minify: true }),
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
};

/**
 * esbuild 的 chunk 名带内容 hash，改一次代码就换一批文件名；不清理旧产物
 * renderer-dist 会无限膨胀。2026-09 实测：磁盘上 1058 个 chunk-*.js，其中只有
 * 48 个被 index.js 的 import 图引用，剩余 71MB 死文件仍被 electron-builder 的
 * `renderer-dist/chunk-*.js` 通配符打进 app.asar。这里在每轮构建前清掉全部
 * chunk-*.js（本轮 esbuild 会重新生成需要的那些）。
 */
function cleanStaleChunkJs() {
  if (!fs.existsSync(rendererOutDir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(rendererOutDir)) {
    if (/^chunk-.*\.js$/.test(f)) {
      fs.unlinkSync(path.join(rendererOutDir, f));
      n += 1;
    }
  }
  if (n) console.log("[build-renderer] removed", n, "stale chunk js");
  return n;
}

/**
 * chunk-*.css 只是 merge-renderer-css 的中间产物：合并进 index.css 之后，JS
 * 侧没有任何 runtime import 指向它们（实测 grep 无 `chunk-*.css` 引用），
 * index.html 也只 link index.css。留在目录里会被 electron-builder 打进包
 * （本轮 7 个 / 256KB），所以合并完成后删掉。
 */
function cleanMergedChunkCss() {
  if (!fs.existsSync(rendererOutDir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(rendererOutDir)) {
    if (/^chunk-.*\.css$/.test(f)) {
      fs.unlinkSync(path.join(rendererOutDir, f));
      n += 1;
    }
  }
  if (n) console.log("[build-renderer] removed", n, "merged chunk css");
  return n;
}

async function main() {
  const cleanRendererCssChunks = require("./clean-renderer-css-chunks.cjs");
  cleanRendererCssChunks();
  cleanStaleChunkJs();

  await esbuild.build({
    ...sharedOptions,
    entryPoints: [path.join(rootDir, "src/renderer/index.tsx")],
    bundle: true,
    format: "esm",
    splitting: true,
    outdir: rendererOutDir,
    entryNames: "[name]",
    chunkNames: "chunk-[hash]",
    logLevel: "info",
  });

  await esbuild.build({
    ...sharedOptions,
    entryPoints: [
      path.join(rootDir, "src/renderer/ithome/NewsShareCardPage.tsx"),
    ],
    bundle: true,
    format: "iife",
    outfile: path.join(rendererOutDir, "news-share-card.bundle.js"),
    logLevel: "info",
  });

  const mergeRendererCss = require("./merge-renderer-css.cjs");
  mergeRendererCss();
  cleanMergedChunkCss();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
