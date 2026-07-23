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

// ponytail: esbuild may rename `path` to `path2`/`path3`/etc. as new
// CJS `require("path")` sites join the bundle (Phase 3 Batch 2 added
// several). Each rewrite matches any `path\d*.` prefix so it survives
// across migrations that change the import surface. The companion
// contract test (tests/main/main-bundle-paths-contract.test.js) uses
// the same regex form.
function pathPrefix() {
  return "path\\d*\\.";
}

const rewrites = [
  // #1 — src/main/index.ts timer-audit fixture (depth-2 source)
  {
    fromRegex: new RegExp(
      pathPrefix() +
        `join\\(__dirname, "..", "tests", "fixtures", "timer-audit"\\)`,
    ),
    fromLiteral: (p) =>
      `${p}join(__dirname, "..", "tests", "fixtures", "timer-audit")`,
    to: (p) =>
      `${p}join(__dirname, "..", "..", "src", "tests", "fixtures", "timer-audit")`,
    noop: false,
  },
  // #2 — src/main/bootstrap/config.js PROJECT_ROOT (depth-4 source)
  {
    fromRegex: new RegExp(
      pathPrefix() + `join\\(__dirname, "..", "..", ".."\\)`,
    ),
    fromLiteral: (p) => `${p}join(__dirname, "..", "..", "..")`,
    to: (p) => `${p}join(__dirname, "..", "..")`,
    noop: false,
  },
  // #3 — src/main/tray.js ASSETS (depth-3 source, no-op rewrite)
  {
    fromRegex: new RegExp(
      pathPrefix() + `join\\(__dirname, "..", "..", "assets"\\)`,
    ),
    fromLiteral: (p) => `${p}join(__dirname, "..", "..", "assets")`,
    to: (p) => `${p}join(__dirname, "..", "..", "assets")`,
    noop: true,
  },
  // #4 — src/main/window.js preload default (depth-3 source, no-op rewrite)
  {
    fromRegex: new RegExp(
      pathPrefix() + `join\\(__dirname, "..", "..", "dist", "preload.js"\\)`,
    ),
    fromLiteral: (p) => `${p}join(__dirname, "..", "..", "dist", "preload.js")`,
    to: (p) => `${p}join(__dirname, "..", "..", "dist", "preload.js")`,
    noop: true,
  },
  // #5 — src/main/window.js indexPath default (depth-3 source, no-op rewrite)
  {
    fromRegex: new RegExp(
      pathPrefix() + `join\\(__dirname, "..", "..", "index.html"\\)`,
    ),
    fromLiteral: (p) => `${p}join(__dirname, "..", "..", "index.html")`,
    to: (p) => `${p}join(__dirname, "..", "..", "index.html")`,
    noop: true,
  },
  // #6 — src/main/ai-leaderboard/sample.js SAMPLE_PATH (depth-4 source)
  {
    fromRegex: new RegExp(
      pathPrefix() + `join\\(__dirname, "sample.json"\\)`,
    ),
    fromLiteral: (p) => `${p}join(__dirname, "sample.json")`,
    to: (p) =>
      `${p}join(__dirname, "..", "..", "src", "main", "ai-leaderboard", "sample.json")`,
    noop: false,
  },
  // #7 — src/main/index.ts workerScript (depth-2 source, multi-line)
  {
    fromRegex: new RegExp(
      pathPrefix() +
        `join\\(\\s*__dirname\\s*,\\s*"..",\\s*"workers",\\s*"detect-worker.js"\\s*\\)`,
    ),
    fromLiteral: (p) =>
      `${p}join(\n    __dirname,\n    "..",\n    "workers",\n    "detect-worker.js"\n  )`,
    to: (p) =>
      `${p}join(\n    __dirname,\n    "..",\n    "..",\n    "src",\n    "workers",\n    "detect-worker.js"\n  )`,
    noop: false,
  },
];

for (const r of rewrites) {
  const m = bundle.match(r.fromRegex);
  if (!m) {
    if (r.noop) {
      // Literal not present in bundle — fall back to a no-op assertion only
      // if at least one prefix form was seen. Skip silently otherwise
      // (bundle may have folded / hoisted).
      continue;
    }
    throw new Error(
      `build-main: literal path rewrite missed — expected to match ${r.fromRegex} in dist/main/index.js`,
    );
  }
  const prefix = m[0].match(/^path\d*\./)[0].slice(0, -1);
  const literal = r.fromLiteral(prefix + ".");
  if (r.noop) {
    if (!bundle.includes(literal)) {
      throw new Error(
        `build-main: literal path not found in dist/main/index.js — ${JSON.stringify(literal)}`,
      );
    }
    continue;
  }
  const to = r.to(prefix + ".");
  const before = bundle;
  bundle = bundle.replace(literal, to);
  if (bundle === before) {
    throw new Error(
      `build-main: literal path rewrite missed — expected to find ${JSON.stringify(literal)} in dist/main/index.js`,
    );
  }
}

fs.writeFileSync(bundlePath, bundle);