# Batch 2 Report — 顶层杂项迁 TypeScript

**Status**: GREEN · **Commit**: `c405cd1` · **HEAD**: `c405cd1` on `refactor/typescript-phase-3`

## Migrated (7 files / ~1366 行)

| From | To |
|------|-----|
| `notification-policy.js` | `notification-policy.ts` |
| `last-opened.js` | `last-opened.ts` |
| `release-notes.js` | `release-notes.ts` |
| `reminders.js` | `reminders.ts` |
| `chromium-http-client.js` | `chromium-http-client.ts` |
| `app-icon.js` | `app-icon.ts` |
| `app-icon-windows.js` | `app-icon-windows.ts` |

## Tooling changes

| File | Change |
|------|--------|
| `scripts/build-main.cjs` | Rewrites now use `path\d*\.` regex instead of hardcoded `path2.`. Detects prefix per literal. |
| `tests/main/main-bundle-paths-contract.test.js` | Mirrors the regex form. Reads each literal's actual prefix out of the bundle, not a single global prefix. |

## Why

Phase 3 Batch 2 added 5+ new `require("path")` sites (app-icon, reminders,
chromium-http-client, last-opened, release-notes). esbuild renames `path` to
`path2`/`path3`/etc. based on import-order surface, so a hardcoded `path2.`
prefix breaks as soon as another batch changes that surface. Regex-based
matching makes the rewrite + contract test resilient.

## Verification

- typecheck 0
- build:main 0 (dist/main/index.js 1.1MB; `node --check` OK)
- 11 vitest 135 PASS
- bundle contracts serial 4 + 4 PASS

## Concern

- esbuild emits ~16 `module.exports = ...` warnings on the dual export/require
  pattern (Phase 2 design choice, documented in batch-0 report). No runtime
  impact. Phase 3.5 strict may want to remove the `export` half once full
  TS cover lets callers import normally.
- The bundle `path` prefix is now surface-dependent. If a future batch adds
  another `require("path")` source and the prefix flips, the test now adapts
  automatically — but the resolved-on-disk check (`MUST_EXIST_PATHS`) still
  relies on the same fixture files existing in repo.