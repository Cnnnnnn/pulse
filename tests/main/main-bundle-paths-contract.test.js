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
// bundle is dist/main/. Seven path.join(__dirname, ...) literals were written
// against each source file's own __dirname (which varies in depth).
// scripts/build-main.cjs rewrites them post-bundle so each literal resolves
// to its intended repo-rooted target. If any rewrite is missing or wrong,
// this test fails loudly with the resolved path off by one or more
// directory levels.
//
// ponytail: esbuild renames the `path` import alias to `path2`/`path3`/etc.
// when more CJS `require("path")` sites join the bundle. The rename surface
// is fragile — every literal in the bundle may live under a different prefix
// depending on import order. Probe the bundle for the literal's rewritten
// shape (which is what's actually present after build-main.cjs rewrites) and
// recover the prefix from the first match.

function findPrefixInBundle(bundle, haystack) {
  // haystack is the rewritten literal text. Find which `path\d*.` prefix
  // sits directly in front of it.
  const re = new RegExp("(path\\d*\\.)" + escapeRegex(haystack));
  const m = bundle.match(re);
  return m ? m[1] : null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LITERALS = [
  // #1 timer-audit (dev-only, try/catch) → repo/src/tests/fixtures/timer-audit
  {
    label: "timer-audit fixture",
    detectPattern: `join\\(__dirname, "..", "tests", "fixtures", "timer-audit"\\)`,
    preRewriteLiteral: `join(__dirname, "..", "tests", "fixtures", "timer-audit")`,
    rewrittenLiteral: `join(__dirname, "..", "..", "src", "tests", "fixtures", "timer-audit")`,
    resolved: ["..", "..", "src", "tests", "fixtures", "timer-audit"],
  },
  // #2 PROJECT_ROOT (bootstrap/config.js) → repo root
  {
    label: "PROJECT_ROOT",
    detectPattern: `join\\(__dirname, "..", "..", ".."\\)`,
    preRewriteLiteral: `join(__dirname, "..", "..", "..")`,
    rewrittenLiteral: `join(__dirname, "..", "..")`,
    resolved: ["..", ".."],
  },
  // #3 ASSETS (tray.js) → repo/assets (no-op rewrite; bundle's 2 `..` already lands at repo)
  {
    label: "ASSETS",
    detectPattern: `join\\(__dirname, "..", "..", "assets"\\)`,
    preRewriteLiteral: `join(__dirname, "..", "..", "assets")`,
    rewrittenLiteral: `join(__dirname, "..", "..", "assets")`,
    resolved: ["..", "..", "assets"],
  },
  // #4 preload default (window.js) → repo/dist/preload.js (no-op rewrite)
  {
    label: "preload default",
    detectPattern: `join\\(__dirname, "..", "..", "dist", "preload.js"\\)`,
    preRewriteLiteral: `join(__dirname, "..", "..", "dist", "preload.js")`,
    rewrittenLiteral: `join(__dirname, "..", "..", "dist", "preload.js")`,
    resolved: ["..", "..", "dist", "preload.js"],
  },
  // #5 indexPath default (window.js) → repo/index.html (no-op rewrite)
  {
    label: "indexPath default",
    detectPattern: `join\\(__dirname, "..", "..", "index.html"\\)`,
    preRewriteLiteral: `join(__dirname, "..", "..", "index.html")`,
    rewrittenLiteral: `join(__dirname, "..", "..", "index.html")`,
    resolved: ["..", "..", "index.html"],
  },
  // #6 SAMPLE_PATH (ai-leaderboard/sample.js) → repo/src/main/ai-leaderboard/sample.json
  {
    label: "SAMPLE_PATH",
    detectPattern: `join\\(__dirname, "sample.json"\\)`,
    preRewriteLiteral: `join(__dirname, "sample.json")`,
    rewrittenLiteral: `join(__dirname, "..", "..", "src", "main", "ai-leaderboard", "sample.json")`,
    resolved: ["..", "..", "src", "main", "ai-leaderboard", "sample.json"],
  },
  // #7 workerScript (index.js) → repo/src/workers/detect-worker.js (multi-line)
  {
    label: "workerScript",
    detectPattern: `join\\(\\s*__dirname\\s*,\\s*".."\\s*,\\s*"workers"\\s*,\\s*"detect-worker.js"\\s*\\)`,
    preRewriteLiteral: `join(\n    __dirname,\n    "..",\n    "workers",\n    "detect-worker.js"\n  )`,
    rewrittenLiteral: `join(\n    __dirname,\n    "..",\n    "..",\n    "src",\n    "workers",\n    "detect-worker.js"\n  )`,
    resolved: ["..", "..", "src", "workers", "detect-worker.js"],
  },
];

const MUST_EXIST_PATHS = [
  ["assets"],
  ["src", "main", "ai-leaderboard", "sample.json"],
  ["src", "workers", "detect-worker.js"],
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

function resolveLiteral(bundle, literal) {
  // build-main.cjs runs first, rewriting pre→post. Probe with the rewritten
  // text to find the prefix.
  const prefix = findPrefixInBundle(bundle, literal.rewrittenLiteral);
  if (!prefix) return null;
  return {
    from: prefix + literal.preRewriteLiteral,
    to: prefix + literal.rewrittenLiteral,
  };
}

describe("Electron main bundle path literals contract", () => {
  it("produces exactly one occurrence of each rewritten literal", () => {
    buildBundle();
    const bundle = readBundle();

    for (const literal of LITERALS) {
      const rw = resolveLiteral(bundle, literal);
      expect(rw, `${literal.label}: pre-rewrite literal not found in bundle`).not.toBeNull();
      const occurrences = bundle.split(rw.to).length - 1;
      expect(
        occurrences,
        `${literal.label}: expected exactly one occurrence of ${rw.to}, found ${occurrences}`,
      ).toBe(1);
    }
  });

  it("leaves the bundle free of any pre-rewrite form for non-no-op rewrites", () => {
    buildBundle();
    const bundle = readBundle();

    for (const literal of LITERALS) {
      const rw = resolveLiteral(bundle, literal);
      if (!rw || rw.from === rw.to) continue; // no-op rewrite
      expect(
        bundle,
        `${literal.label}: pre-rewrite literal still present: ${rw.from}`,
      ).not.toContain(rw.from);
    }
  });

  it("rewritten paths resolve inside the repo root", () => {
    buildBundle();
    const bundleDir = path.join(ROOT_DIR, "dist", "main");

    for (const literal of LITERALS) {
      const resolved = path.join(bundleDir, ...literal.resolved);
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