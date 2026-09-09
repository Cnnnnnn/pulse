/**
 * tests/typescript/electron-adapters.test.js
 *
 * Task 0: RED contract — 7 Electron boundary adapter `.d.ts` files exist in
 * `src/shared/electron/` and 1:1 mirror the public surface of the
 * corresponding `src/main/*.js` module.
 *
 * Each `.d.ts` file MUST:
 *   1. exist on disk,
 *   2. declare at least one `interface` (no runtime impl — `.d.ts` only),
 *   3. expose a method whose name appears in the matching `src/main/*.js`
 *      `module.exports` keys (1:1 public-surface alignment; no expansion,
 *      no rename).
 *
 * Why a contract now: the brief specifies .d.ts-first, run-time-later. If the
 * adapter file drifts from `src/main/*.js` exports, TypeScript-side callers
 * will silently typecheck against an interface that no longer matches
 * reality. This test catches that drift at lint-time rather than in prod.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..");
const ADAPTERS_DIR = path.join(ROOT, "src", "shared", "electron");
const MAIN_DIR = path.join(ROOT, "src", "main");

// 7 adapter files, 1:1 mapped to a src/main/*.js module (or a documented
// helper). Names match the brief verbatim — do not rename without also
// updating this list and `tsconfig.app.json`'s include glob.
const ADAPTERS = [
  { file: "log-adapter.d.ts", main: "log.ts" },
  { file: "http-client-adapter.d.ts", main: "http-client.ts" },
  { file: "timer-registry-adapter.d.ts", main: "timer-registry.ts" },
  { file: "pool-size-adapter.d.ts", main: "pool-size.ts" },
  { file: "diagnostics-adapter.d.ts", main: "diagnostics.ts" },
  { file: "state-store-adapter.d.ts", main: "state-store.ts" },
  // utility (no src/main counterpart); safeRequire is the brief-mandated
  // shape for cross-context module resolution.
  { file: "safe-require.d.ts", main: null },
];

/** Read the file at `abs`. Returns "" if missing. */
const readIfExists = (abs) =>
  fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";

/**
 * Grep `module.exports = { … }` (top-level only) and pull the export keys.
 *
 * The grep is intentionally dumb-strings-on-disk, not an AST parse: this test
 * lives in JS, can't depend on a TS parser, and the .js modules use literal
 * object literals for `module.exports`, so a regex is reliable enough for
 * "is this key listed". Anything fancier would force adding a dep.
 *
 * Handles both single-line (`module.exports = { HttpClient };`) and
 * multi-line (`module.exports = {\n  foo,\n};`) literals.
 */
/**
 * Collect public export names from a main-process module source.
 *
 * Phase 7b: dual-export (`module.exports = { … }`) is being stripped in favor
 * of pure `export`. Parse both shapes so this contract test keeps working
 * either way. Intentionally dumb-strings-on-disk (no AST dep).
 */
function topLevelExports(moduleSource) {
  const out = [];

  // ESM: export function|const|let|var|class Name
  for (const m of moduleSource.matchAll(
    /^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    out.push(m[1]);
  }
  // ESM: export { a, b as c }
  for (const m of moduleSource.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(",")) {
      const t = part.trim().replace(/\/\/.*$/, "").trim();
      if (!t) continue;
      const as = t.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (as) out.push(as[2]);
      else if (/^[A-Za-z_$][\w$]*$/.test(t)) out.push(t);
    }
  }

  // CJS legacy: module.exports = { … }
  const m = moduleSource.match(/module\.exports\s*=\s*\{([\s\S]*?)\}\s*;?/);
  if (m) {
    for (const rawLine of m[1].split("\n")) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith("//")) continue;
      const code = trimmed.replace(/\/\/.*$/, "").trim();
      if (!code) continue;
      let match = code.match(/^([A-Za-z_$][\w$]*)\s*(?:[:,]|as\s+)/);
      if (match) {
        out.push(match[1]);
      } else if (/^([A-Za-z_$][\w$]*)$/.test(code)) {
        out.push(code);
      }
    }
  }

  return [...new Set(out)];
}

describe("electron boundary adapters (Task 0)", () => {
  describe("adapter files exist", () => {
    for (const { file } of ADAPTERS) {
      it(`src/shared/electron/${file} exists`, () => {
        const abs = path.join(ADAPTERS_DIR, file);
        expect(
          fs.existsSync(abs),
          `${file} should exist on disk (RED → GREEN once types are added)`,
        ).toBe(true);
      });
    }
  });

  describe("adapter files are .d.ts declarations only (no runtime)", () => {
    for (const { file } of ADAPTERS) {
      it(`${file} declares an interface and exports no runtime values`, () => {
        const src = readIfExists(path.join(ADAPTERS_DIR, file));
        // Skip silently if the file doesn't exist yet — that case is covered
        // by the "exists" test above and would otherwise duplicate the
        // failure message.
        if (!src) {
          throw new Error(
            `${file} is missing on disk — cannot evaluate interface guarantee`,
          );
        }
        expect(
          src.includes("export interface"),
          `${file} must export at least one \`interface\` (the adapter surface)`,
        ).toBe(true);
        // No runtime export shape — the brief requires .d.ts-only adapters.
        // .d.ts files may declare `export type`, `export interface`, or
        // `export declare`, but NOT `export default { ... }` style runtime.
        // Allow `export const` only if it is a type-level constant (no = )
        // — that's still a declaration, not a runtime value.
        const runtimeExport = src.match(/^export\s+\{[^}]*\}\s*;?/m);
        expect(
          runtimeExport,
          `${file} must not have a runtime \`export { … }\` block`,
        ).toBeNull();
      });
    }
  });

  describe("adapter mirrors src/main/*.js public surface 1:1", () => {
    for (const { file, main } of ADAPTERS) {
      if (!main) continue; // utility files (safe-require) have no main counterpart
      it(`${file} mentions every export of src/main/${main}`, () => {
        const adapterSrc = readIfExists(path.join(ADAPTERS_DIR, file));
        const mainSrc = readIfExists(path.join(MAIN_DIR, main));
        expect(
          mainSrc,
          `${main} should exist on disk to derive expected surface`,
        ).not.toBe("");
        const exports = topLevelExports(mainSrc);
        expect(exports.length, `${main} should export at least one symbol`).toBeGreaterThan(0);

        const missing = exports.filter((name) => !adapterSrc.includes(name));
        expect(
          missing,
          `${file} must mention every export of ${main}; missing: ${missing.join(", ")}`,
        ).toEqual([]);
      });
    }
  });
});
