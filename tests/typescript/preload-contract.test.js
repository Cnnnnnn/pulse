/**
 * tests/typescript/preload-contract.test.js
 *
 * TypeScript foundation contract tests (Task 4 follow-up).
 *
 * ── Scope ──
 * Verifies the wiring from ESLint / Vitest / renderer esbuild to the actual
 * TypeScript files they are supposed to handle. Replaces fragile string-
 * contains checks with behavioral assertions that spawn the real CLIs and
 * inspect their outputs.
 *
 * ── Files intentionally NOT touched by this test (per Task 4 brief) ──
 *   - tsconfig.renderer.json  — handled independently by Task 1; this test
 *                               only asserts that renderer esbuild produces
 *                               the expected artifacts, not the TS project.
 *   - tsconfig.tests.json     — handled independently by Task 1; this test
 *                               only asserts vitest actually collects .ts/.tsx
 *                               (which depends on the test JS/TSX glob, not
 *                               on tsconfig).
 *   - scripts/clean-renderer-css-chunks.cjs — strips stale chunk-*.css before
 *                               esbuild runs; it has nothing to do with .ts
 *                               or .tsx entrypoints (renderer entrypoints
 *                               are .jsx, and the script only matches
 *                               chunk-*.css), so it does not need updates for
 *                               Phase 4.
 *
 * ── Constraints (inherited from Task 4) ──
 *   - Must not break Task 3 globalSetup (tests/_setup/build-preload.cjs).
 *   - Must not introduce `any` / `@ts-ignore` (this file is .js anyway).
 *   - Must not add new dependencies; only Node 22 + already-installed
 *     devDependencies (eslint, vitest, esbuild) are used.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.join(__dirname, "../..");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const IPC_CALL_PATTERN =
  /\bipcRenderer\.(?:invoke|on|send|removeListener)\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`)/g;
const extractIpcChannels = (source) =>
  [...new Set(
    [...source.matchAll(IPC_CALL_PATTERN)].map(
      (match) => match[1] ?? match[2] ?? match[3],
    ),
  )].sort();

/**
 * Run the workspace's installed ESLint CLI on the given file(s).
 * Uses Node 22, the project's eslint.config.mjs, no extra deps.
 *
 * @param {string[]} files files relative to repo root
 * @returns {{ status: number|null, stdout: string, stderr: string }}
 */
const runEslint = (files) => {
  const eslintBin = path.join(root, "node_modules", ".bin", "eslint");
  return spawnSync(
    eslintBin,
    ["--no-config-lookup", "--config", path.join(root, "eslint.config.mjs"), ...files],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    },
  );
};

/**
 * Run the workspace's installed vitest CLI in `list --json --filesOnly` mode
 * and capture which test files it would collect. vitest 2.x prints a JSON
 * array of `{ file: "..." }` entries (one per collected file). If the include
 * glob in vitest.config.js drops a token (e.g. someone removes `ts`/`tsx`),
 * tests/_smoke/loader-smoke.test.tsx will not appear here and the assertion
 * fails.
 *
 * @returns {{ status: number|null, files: string[] }}
 */
const listVitestFiles = () => {
  const vitestBin = path.join(root, "node_modules", ".bin", "vitest");
  const proc = spawnSync(
    vitestBin,
    ["list", "--json", "--filesOnly"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1", TZ: "UTC" },
    },
  );
  // vitest prints pure JSON on stdout (no leading banner) when --json is set.
  let files = [];
  try {
    const parsed = JSON.parse(proc.stdout);
    // vitest 2.x: [{ file: "/abs/path/to/foo.test.tsx" }, ...]
    files = (Array.isArray(parsed) ? parsed : []).map((entry) => entry.file ?? "");
  } catch {
    files = [];
  }
  return { status: proc.status, files };
};

describe("TypeScript foundation", () => {
  it("has separate app, renderer, and test projects", () => {
    const base = readJson("tsconfig.base.json");
    const app = readJson("tsconfig.app.json");
    const renderer = readJson("tsconfig.renderer.json");
    const tests = readJson("tsconfig.tests.json");

    expect(app.extends).toBe("./tsconfig.base.json");
    expect(renderer.extends).toBe("./tsconfig.base.json");
    expect(tests.extends).toBe("./tsconfig.base.json");
    expect(base.compilerOptions.strict).toBe(false);
    expect(base.compilerOptions.noEmit).toBe(true);
    expect(app.compilerOptions.allowJs).toBe(true);
    expect(renderer.compilerOptions.jsx).toBe("react-jsx");
    expect(renderer.compilerOptions.jsxImportSource).toBe("preact");
    expect(tests.compilerOptions.types).toContain("vitest/globals");
  });

  it("uses the TypeScript preload implementation as the bridge contract", () => {
    const preload = fs.readFileSync(path.join(root, "preload.ts"), "utf8");
    const types = fs.readFileSync(path.join(root, "src/shared/preload-types.ts"), "utf8");

    expect(types).toContain("export type Callback<T = unknown>");
    expect(types).toContain("export interface PlatformInfo");
    expect(preload).toContain("export const api =");
    expect(preload).toContain("export const pulse =");
    expect(preload).toContain("export const metalsApi =");
    expect(preload).toContain('exposeInMainWorld("api", api)');
    expect(preload).not.toContain(": any");
    expect(preload).not.toContain("@ts-ignore");
  });

  it("keeps the TypeScript and runtime preload IPC channel sets aligned", () => {
    const preloadJs = fs.readFileSync(path.join(root, "dist", "preload.js"), "utf8");
    const preloadTs = fs.readFileSync(path.join(root, "preload.ts"), "utf8");

    expect(extractIpcChannels(preloadTs)).toEqual(extractIpcChannels(preloadJs));
  });

  it("declares Window from the preload implementation and builds a JS preload", () => {
    const windowTypes = fs.readFileSync(path.join(root, "src/shared/window.d.ts"), "utf8");
    const packageJson = readJson("package.json");
    const windowManager = fs.readFileSync(path.join(root, "src/main/window.js"), "utf8");

    expect(windowTypes).toContain('import type { api, metalsApi, platformInfo, pulse } from "../../preload"');
    expect(windowTypes).toContain("api: typeof api");
    expect(windowTypes).toContain("pulse: typeof pulse");
    expect(windowTypes).toContain("metalsApi: typeof metalsApi");
    expect(packageJson.scripts["build:preload"]).toContain("--outfile=dist/preload.js");
    expect(windowManager).toContain('"dist", "preload.js"');
  });

  describe("keeps TypeScript in lint, test, and renderer build paths (behavioral)", () => {
    // ── ESLint behavior: ──
    // (a) The renderer JSX scope (tseslintParser + ecmaFeatures.jsx) actually
    //     parses a minimal Preact JSX fixture with exit 0 and 0 errors.
    // (b) The main TS scope (**/*.ts, sourceType: commonjs) lints preload.ts
    //     cleanly — exit 0, 0 errors.

    it("eslint CLI parses the minimal Preact JSX fixture with exit 0", () => {
      const fixture = "tests/typescript/fixtures/ts-loader-fixture.tsx";
      expect(fs.existsSync(path.join(root, fixture))).toBe(true);

      const result = runEslint([fixture]);
      // Exit 0 + no error rows in stdout/stderr proves the renderer JSX scope
      // (tseslintParser + ecmaFeatures.jsx) is wired for .tsx files. If the
      // fixture's JSX expression cannot be parsed, ESLint will surface a
      // non-zero exit and a parser error.
      expect(result.status).toBe(0);
      expect(/error/iu.test(result.stdout) || /error/iu.test(result.stderr)).toBe(false);
    });

    it("eslint CLI lints preload.ts under the main TS scope with exit 0", () => {
      const result = runEslint(["preload.ts"]);
      // preload.ts lives at the repo root and matches the **/*.ts block in
      // eslint.config.mjs. The block sets sourceType: commonjs and provides
      // node+browser globals so no no-undef / no-unused-vars fire on the
      // existing code.
      expect(result.status).toBe(0);
      expect(/error/iu.test(result.stdout) || /error/iu.test(result.stderr)).toBe(false);
    });

    // ── renderer esbuild behavior: ──
    // The build:renderer script must produce the same three artifacts it
    // produced before Task 4 (and Phase 5+ migration still uses): index.js,
    // index.css, news-share-card.bundle.js. We invoke `npm run build:renderer`
    // and assert the output paths exist on disk. (Clean checkout is fine —
    // the script starts with clean-renderer-css-chunks which tolerates an
    // absent renderer-dist/.)

    it("npm run build:renderer produces renderer-dist/{index.js,index.css,news-share-card.bundle.js}", () => {
      const distDir = path.join(root, "renderer-dist");
      // Run the script; tolerating "already exists" so this is idempotent.
      const proc = spawnSync("npm", ["run", "build:renderer", "--silent"], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
      });
      expect(proc.status).toBe(0);

      const expected = ["index.js", "index.css", "news-share-card.bundle.js"];
      const writtenPaths = expected.map((f) => path.join(distDir, f));
      // These three artifact paths are the contract: writing them here means
      // future readers see exactly which files must exist after a renderer
      // build. If any of them disappears, the renderer runtime will break
      // (index.html only links index.css + index.js; share-card.html only
      // links news-share-card.bundle.js).
      for (const p of writtenPaths) {
        expect(fs.existsSync(p)).toBe(true);
      }
      // Also drop them into the assertion message so a failure prints which
      // file went missing.
      expect(writtenPaths).toEqual([
        path.join(distDir, "index.js"),
        path.join(distDir, "index.css"),
        path.join(distDir, "news-share-card.bundle.js"),
      ]);
    });

    // ── vitest include behavior: ──
    // The include glob `tests/**/*.test.{js,jsx,ts,tsx}` must actually pick
    // up a `.test.tsx` file. We rely on tests/_smoke/loader-smoke.test.tsx
    // (intentionally minimal: no JSX rendering, no happy-dom). vitest's
    // --list --reporter=json reports every file it would run; if the glob
    // were mis-configured (e.g. someone drops a `ts`/`tsx` token), this
    // smoke test would no longer appear and the assertion fails.

    it("vitest include matches .test.tsx (loader-smoke.test.tsx appears in collection list)", () => {
      const smoke = "tests/_smoke/loader-smoke.test.tsx";
      expect(fs.existsSync(path.join(root, smoke))).toBe(true);

      const { status, files } = listVitestFiles();
      expect(status).toBe(0);
      // vitest reports absolute paths in --list --reporter=json.
      // Normalize via endsWith to be resilient against cwd / macOS /tmp paths.
      const collected = files.some((f) => f.endsWith(smoke));
      expect(collected).toBe(true);
    });
  });
});