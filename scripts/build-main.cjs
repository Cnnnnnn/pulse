#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const outfile = path.join(rootDir, "dist", "main", "index.js");
const esbuild = require.resolve("esbuild/bin/esbuild");

fs.mkdirSync(path.dirname(outfile), { recursive: true });
execFileSync(
  esbuild,
  [
    "src/main/index.js",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--target=es2020",
    "--external:electron",
    "--packages=external",
    "--outfile=dist/main/index.js",
  ],
  { cwd: rootDir, stdio: "inherit" },
);
