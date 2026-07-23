import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const BUILD_SCRIPT_PATH = path.join(ROOT_DIR, "scripts", "build-main.cjs");
const MAIN_BUNDLE_PATH = path.join(ROOT_DIR, "dist", "main", "index.js");

// ponytail: contract guard for the post-build literal path rewrite.
// esbuild bundles src/main/* into dist/main/index.js, so __dirname inside the
// bundle is dist/main/. Six path.join(__dirname, ...) literals were written
// against each source file's own __dirname (which varies in depth:
// src/main/, src/main/window/, src/main/tray/, src/main/bootstrap/,
// src/main/ai-leaderboard/). scripts/build-main.cjs rewrites them post-bundle
// so each literal resolves to its intended repo-rooted target. If any
// rewrite is missing or wrong, this test fails loudly with the resolved
// path off by one or more directory levels.
//
// Depth math (bundle __dirname = dist/main/, depth 2 from repo root):
//   - src/main/index.js timer-audit (1 source `..`): bundle needs 2.
//   - src/main/bootstrap/config.js PROJECT_ROOT (3 source `..`): bundle needs 2.
//   - src/main/tray.js ASSETS (2 source `..`, depth-3 source resolves to
//     src/assets — pre-existing depth bug; brief target is repo/assets):
//     bundle's 2 `..` already lands at repo, no change needed.
//   - src/main/window.js preload + indexPath (2 source `..`, depth-3 source
//     resolves to src/X — pre-existing depth bug masked by opts in prod):
//     bundle's 2 `..` already lands at repo, no change needed.
//   - src/main/ai-leaderboard/sample.js SAMPLE_PATH (0 source `..`): bundle
//     needs 2 to reach repo, then src/main/ai-leaderboard/ suffix.
//
// `rewrite` is the literal transform applied by build-main.cjs. For items
// where the rewrite is a no-op (old === expected), the bundle must still
// contain exactly one occurrence of the expected literal — this guards
// against future regressions where someone changes the literal in source
// without updating the contract.
const LITERALS = [
  // #1 timer-audit (dev-only, try/catch) → repo/src/tests/fixtures/timer-audit
  {
    label: "timer-audit fixture",
    rewrite: {
      from: `path.join(__dirname, "..", "tests", "fixtures", "timer-audit")`,
      to: `path.join(__dirname, "..", "..", "src", "tests", "fixtures", "timer-audit")`,
    },
    resolved: ["..", "..", "src", "tests", "fixtures", "timer-audit"],
  },
  // #2 PROJECT_ROOT (bootstrap/config.js) → repo root
  {
    label: "PROJECT_ROOT",
    rewrite: {
      from: `path2.join(__dirname, "..", "..", "..")`,
      to: `path2.join(__dirname, "..", "..")`,
    },
    resolved: ["..", ".."],
  },
  // #3 ASSETS (tray.js) → repo/assets (no-op rewrite; see comment above)
  {
    label: "ASSETS",
    rewrite: {
      from: `path2.join(__dirname, "..", "..", "assets")`,
      to: `path2.join(__dirname, "..", "..", "assets")`,
    },
    resolved: ["..", "..", "assets"],
  },
  // #4 preload default (window.js) → repo/dist/preload.js (no-op rewrite)
  {
    label: "preload default",
    rewrite: {
      from: `path2.join(__dirname, "..", "..", "dist", "preload.js")`,
      to: `path2.join(__dirname, "..", "..", "dist", "preload.js")`,
    },
    resolved: ["..", "..", "dist", "preload.js"],
  },
  // #5 indexPath default (window.js) → repo/index.html (no-op rewrite)
  {
    label: "indexPath default",
    rewrite: {
      from: `path2.join(__dirname, "..", "..", "index.html")`,
      to: `path2.join(__dirname, "..", "..", "index.html")`,
    },
    resolved: ["..", "..", "index.html"],
  },
  // #6 SAMPLE_PATH (ai-leaderboard/sample.js) → repo/src/main/ai-leaderboard/sample.json
  {
    label: "SAMPLE_PATH",
    rewrite: {
      from: `path2.join(__dirname, "sample.json")`,
      to: `path2.join(__dirname, "..", "..", "src", "main", "ai-leaderboard", "sample.json")`,
    },
    resolved: ["..", "..", "src", "main", "ai-leaderboard", "sample.json"],
  },
];

// Targets that must exist on disk for runtime sanity. The window.js
// preload/indexPath defaults are guarded by production callers passing
// opts.preloadPath / opts.indexPath, so we don't assert file existence for
// those — only that the literal would resolve inside the repo.
//
// timer-audit is wrapped in try/catch in production startup, so a missing
// path fails silently and the audit just doesn't run. We do NOT require it
// to exist on disk because the literal target (src/tests/fixtures/...)
// does not actually exist in this repo — the real fixture is at
// tests/fixtures/timer-audit (top-level, not under src/). The brief
// explicitly specified src/tests/fixtures/timer-audit as the rewrite
// target; this is a pre-existing source-code bug masked by the try/catch.
// We surface that gap in the report rather than silently "fix" it here.
const MUST_EXIST_PATHS = [
  ["assets"],
  ["src", "main", "ai-leaderboard", "sample.json"],
];

function buildBundle() {
  execFileSync(process.execPath, [BUILD_SCRIPT_PATH], {
    cwd: ROOT_DIR,
    stdio: "pipe",
  });
}

function readBundle() {
  return fs.readFileSync(MAIN_BUNDLE_PATH, "utf8");
}

describe("Electron main bundle path literals contract", () => {
  it("produces exactly one occurrence of each rewritten literal", () => {
    buildBundle();
    const bundle = readBundle();

    for (const literal of LITERALS) {
      const occurrences = bundle.split(literal.rewrite.to).length - 1;
      expect(
        occurrences,
        `${literal.label}: expected exactly one occurrence of ${literal.rewrite.to}, found ${occurrences}`,
      ).toBe(1);
    }
  });

  it("leaves the bundle free of any pre-rewrite form for non-no-op rewrites", () => {
    buildBundle();
    const bundle = readBundle();

    for (const literal of LITERALS) {
      if (literal.rewrite.from === literal.rewrite.to) continue; // no-op rewrite
      expect(
        bundle,
        `${literal.label}: pre-rewrite literal still present: ${literal.rewrite.from}`,
      ).not.toContain(literal.rewrite.from);
    }
  });

  it("rewritten paths resolve inside the repo root", () => {
    buildBundle();
    const bundleDir = path.join(ROOT_DIR, "dist", "main");

    for (const literal of LITERALS) {
      const resolved = path.join(bundleDir, ...literal.resolved);
      // Allow exact equality for the repo root itself (no trailing sep).
      const insideRepo =
        resolved === ROOT_DIR ||
        resolved.startsWith(ROOT_DIR + path.sep);
      expect(
        insideRepo,
        `${literal.label}: resolved path escapes the repo: ${resolved}`,
      ).toBe(true);
    }
  });

  it("rewritten paths that must exist on disk are present", () => {
    buildBundle();

    for (const segs of MUST_EXIST_PATHS) {
      const target = path.join(ROOT_DIR, ...segs);
      expect(
        fs.existsSync(target),
        `expected ${target} to exist on disk (target ${JSON.stringify(segs)} from rewritten bundle literal)`,
      ).toBe(true);
    }
  });
});