#!/usr/bin/env node
const path = require("node:path");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");

esbuild.buildSync({
  entryPoints: [path.join(rootDir, "preload.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  outfile: path.join(rootDir, "dist", "preload.js"),
  target: "es2020",
  logLevel: "info",
});
