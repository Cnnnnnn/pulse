#!/usr/bin/env node
/**
 * scripts/build-renderer.js
 *
 * 包装 esbuild 打包 renderer, 注入 APP_VERSION (取自 package.json).
 * 取代原 package.json 里超长单行 build:renderer 脚本, 避免转义地狱.
 *
 * 产物与原命令等价: index.jsx → renderer-dist/index.js (esm, splitting)
 * + ithome/NewsShareCardPage.jsx → renderer-dist/news-share-card.bundle.js (iife)
 */
const { build } = require("esbuild");
const { version } = require("../package.json");

const common = {
  loader: { ".jsx": "jsx" },
  jsx: "automatic",
  jsxImportSource: "preact",
  target: "es2020",
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.APP_VERSION": JSON.stringify(version),
  },
};

(async () => {
  await Promise.all([
    build({
      ...common,
      entryPoints: ["src/renderer/index.jsx"],
      bundle: true,
      format: "esm",
      splitting: true,
      outdir: "renderer-dist",
      entryNames: "[name]",
      chunkNames: "chunk-[hash]",
    }),
    build({
      ...common,
      entryPoints: ["src/renderer/ithome/NewsShareCardPage.jsx"],
      bundle: true,
      format: "iife",
      outfile: "renderer-dist/news-share-card.bundle.js",
    }),
  ]);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
