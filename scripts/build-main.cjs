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
    "src/main/index.ts",
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

// ponytail: post-build literal path rewrite.
// esbuild bundles src/main/* into dist/main/index.js, so __dirname inside
// the bundle is dist/main/. Seven path.join(__dirname, ...) literals were
// written against each source file's own __dirname (which varies in
// depth: src/main/, src/main/window/, src/main/tray/,
// src/main/bootstrap/, src/main/ai-leaderboard/). We rewrite each literal
// so it resolves to its intended repo-rooted target.
//
// Depth math (bundle __dirname = dist/main/, depth 2 from repo root):
//   - src/main/index.ts (depth 2 source, 1 source `..`): bundle needs 2
//     `..` plus an explicit src/ segment.
//   - src/main/bootstrap/ (depth 4 source, 3 source `..`): bundle needs
//     only 2 `..` from dist/main/.
//   - src/main/tray/ (depth 3 source, 2 source `..`): source resolves to
//     src/assets — pre-existing depth bug masked by fallback icon. Brief
//     target is repo/assets. Bundle literal already lands at repo/assets,
//     so the rewrite is a no-op.
//   - src/main/window/ (depth 3 source, 2 source `..`): source resolves
//     to src/dist/preload.js / src/index.html — pre-existing depth bug
//     masked by opts.preloadPath / opts.indexPath in production. Bundle
//     literal already lands at repo/dist/preload.js / repo/index.html,
//     so the rewrite is a no-op.
//   - src/main/ai-leaderboard/ (depth 4 source, 0 source `..`): bundle
//     needs 2 `..` to reach repo, then src/main/ai-leaderboard/.
//   - src/main/index.ts workerScript (1 source `..`): bundle needs 2
//     `..` plus src/workers/detect-worker.js.
//
// Each rewrite uses .replace (not .replaceAll) so a future second
// occurrence is not silently mutated; the test guard in
// tests/main/main-bundle-paths-contract.test.js asserts exactly one
// rewritten literal per item.
const bundlePath = outfile;
let bundle = fs.readFileSync(bundlePath, "utf8");

const rewrites = [
  // #1 — src/main/index.ts timer-audit fixture (depth-2 source)
  {
    from: `path.join(__dirname, "..", "tests", "fixtures", "timer-audit")`,
    to: `path.join(__dirname, "..", "..", "src", "tests", "fixtures", "timer-audit")`,
  },
  // #2 — src/main/bootstrap/config.js PROJECT_ROOT (depth-4 source)
  {
    from: `path2.join(__dirname, "..", "..", "..")`,
    to: `path2.join(__dirname, "..", "..")`,
  },
  // #3 — src/main/tray.js ASSETS (depth-3 source, no-op rewrite)
  {
    from: `path2.join(__dirname, "..", "..", "assets")`,
    to: `path2.join(__dirname, "..", "..", "assets")`,
  },
  // #4 — src/main/window.js preload default (depth-3 source, no-op rewrite)
  {
    from: `path2.join(__dirname, "..", "..", "dist", "preload.js")`,
    to: `path2.join(__dirname, "..", "..", "dist", "preload.js")`,
  },
  // #5 — src/main/window.js indexPath default (depth-3 source, no-op rewrite)
  {
    from: `path2.join(__dirname, "..", "..", "index.html")`,
    to: `path2.join(__dirname, "..", "..", "index.html")`,
  },
  // #6 — src/main/ai-leaderboard/sample.js SAMPLE_PATH (depth-4 source)
  {
    from: `path2.join(__dirname, "sample.json")`,
    to: `path2.join(__dirname, "..", "..", "src", "main", "ai-leaderboard", "sample.json")`,
  },
  // #7 — src/main/index.ts workerScript (depth-2 source)
  {
    from: `path.join(
    __dirname,
    "..",
    "workers",
    "detect-worker.js"
  )`,
    to: `path.join(
    __dirname,
    "..",
    "..",
    "src",
    "workers",
    "detect-worker.js"
  )`,
  },
];

for (const { from, to } of rewrites) {
  if (from === to) {
    // No-op rewrite: literal is already correct in the bundle. Still
    // verify presence — if a future source change drops the literal the
    // contract test will catch it, but we also fail fast at build time.
    if (!bundle.includes(from)) {
      throw new Error(
        `build-main: literal path not found in dist/main/index.js — ${JSON.stringify(from)}`,
      );
    }
    continue;
  }
  const before = bundle;
  bundle = bundle.replace(from, to);
  if (bundle === before) {
    throw new Error(
      `build-main: literal path rewrite missed — expected to find ${JSON.stringify(from)} in dist/main/index.js`,
    );
  }
}

fs.writeFileSync(bundlePath, bundle);