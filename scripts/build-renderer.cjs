#!/usr/bin/env node
const path = require("node:path");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");
const rendererOutDir = path.join(rootDir, "renderer-dist");
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
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
};

async function main() {
  const cleanRendererCssChunks = require("./clean-renderer-css-chunks.cjs");
  cleanRendererCssChunks();

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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
