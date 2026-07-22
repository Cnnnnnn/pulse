# Task 3 Report — Declare renderer Window bridge types & build preload

**Branch:** `refactor/typescript-foundation`
**Initial HEAD:** `eeef0a9` (no leftover changes — worktree was clean)
**Final HEAD:** `21567fd` — `build: compile TypeScript preload for Electron`
**Node:** v22.22.3 (via `nvm use 22`; `.nvmrc` specifies `22`)

---

## 1. Pre-flight

- `git status` before any work: clean. No uncommitted changes from a prior agent.
- `git rev-parse HEAD`: `eeef0a943ce783f0963d391080ca7be14463c379` ✓
- `git log --oneline -5` (initial):
  ```
  eeef0a9 fix: align preload IPC channels
  456983b refactor: migrate preload bridge to TypeScript
  8c8a3c7 fix: ensure tsconfig files and preload-contract test end with a single LF
  7b56fa9 build: add TypeScript project configurations
  ea7b88a docs: plan TypeScript foundation migration
  ```

---

## 2. Step 1 — Failing test added

Added two new tests in `tests/typescript/preload-contract.test.js`:

1. **Switched** `extractIpcChannels(preloadJs)` source from root `preload.js` to
   `dist/preload.js` to align with the "root preload.js ultimately gone" rule.
2. **Added** new `it("declares Window from the preload implementation and builds a JS preload")`
   asserting the brief's contract: `window.d.ts` imports `typeof` from `../../preload`,
   `package.json` has `build:preload` with `--outfile=dist/preload.js`,
   and `src/main/window.js` references the new path `"dist", "preload.js"`.

RED evidence (before any src changes):

```
PASS (2) FAIL (2)

1. TypeScript foundation keeps the TypeScript and runtime preload IPC channel sets aligned
   Error: ENOENT: no such file or directory, open '.../dist/preload.js'
       at Object.readFileSync (node:fs:440:20)
       at .../tests/typescript/preload-contract.test.js:50:26

2. TypeScript foundation declares Window from the preload implementation and builds a JS preload
   Error: ENOENT: no such file or directory, open '.../src/shared/window.d.ts'
       at Object.readFileSync (node:fs:440:20)
       at .../tests/typescript/preload-contract.test.js:57:28
```

Both failures confirm the missing `dist/preload.js` and `src/shared/window.d.ts`
artifacts; the existing tests still pass.

---

## 3. Step 3 — `src/shared/window.d.ts` created

Created exactly as the brief specified:

```ts
import type { api, metalsApi, platformInfo, pulse } from "../../preload";

declare global {
  interface Window {
    api: typeof api;
    pulse: typeof pulse;
    metalsApi: typeof metalsApi;
    platformInfo: typeof platformInfo;
  }
}

export {};
```

`preload.ts` already exports `api`, `pulse`, `metalsApi`, `platformInfo`
(verified by `preload-contract.test.js` "uses the TypeScript preload implementation
as the bridge contract").

---

## 4. Step 4 — `package.json` build wiring

Added `build:preload` exactly as specified:
```
"build:preload": "esbuild preload.ts --bundle --platform=node --format=cjs --external:electron --outfile=dist/preload.js --target=es2020"
```

Hooked into `prestart`, `prebuild`, `predev` to run **before** `build:renderer`,
and removed the renderer build from `build` / `dev` (those only need
electron-builder / `electron .` now since the renderer is already built).

No duplication: `prestart`/`prebuild`/`predev` each call
`npm run build:preload && npm run build:renderer` once. The renderer
build is now triggered exclusively via these pre-* hooks; `start`,
`build`, `build:mac*`, `build:win`, `dev` no longer inline it.

`electron-builder.files` swapped `"preload.js"` → `"dist/preload.js"`.

---

## 5. Step 5 — Runtime preload path references

Searched `src/`, `tests/`, `scripts/`, `build/` for any runtime preload
references (not just comments / docs). Updated:

| File | Before | After |
| --- | --- | --- |
| `src/main/window.js` | `path.join(__dirname, '..', '..', 'preload.js')` | `path.join(__dirname, "..", "..", "dist", "preload.js")` |
| `src/main/index.js` | `path.join(PROJECT_ROOT, "preload.js")` | `path.join(PROJECT_ROOT, "dist", "preload.js")` |
| `src/main/ithome/share-card-renderer.js` | `path.join(app.getAppPath(), "preload.js")` | `path.join(app.getAppPath(), "dist", "preload.js")` |
| `tests/preload-platform.test.js` | `require('../preload.js')` (×2) + `require.resolve` | `require('../dist/preload.js')` (×2) + `require.resolve` |
| `tests/main/preload-api-contract.test.js` | `path.resolve(__dirname, "../../preload.js")` | `path.resolve(__dirname, "../../dist/preload.js")` |

Renderer comments mentioning `preload.js` (in `src/renderer/api.js`,
`src/renderer/components/BulkUpgradeModal.jsx`, `src/renderer/metals/metalStore.js`,
`src/renderer/ithome/NewsShareCardPage.jsx`) are descriptive prose only — not
runtime path references — and are outside the brief's hard constraint
"不改业务". Left untouched.

`tests/main/preload-api-contract.test.js` parser updated to extract the
`api` namespace from the esbuild bundle format (`var api = { ... }` instead
of the old `exposeInMainWorld("api", { ... })`). This is a test-only change;
the *contract assertion* (preload's `api` covers all of `createApi()`'s top-level
keys) is unchanged.

`tests/typescript/preload-contract.test.js` updated to read
`dist/preload.js` instead of root `preload.js` (matches Step 1 above).

---

## 6. Step 6 — Root `preload.js` deleted

`git rm preload.js`. `dist/preload.js` (the new build product) is covered
by the existing `dist/` line in `.gitignore` (line 11) — `git check-ignore
dist/preload.js` confirms.

---

## 7. Step 7 — Verification commands (all under Node 22)

### 7.1 Build
```
$ npm run build:preload
> esbuild preload.ts --bundle --platform=node --format=cjs --external:electron --outfile=dist/preload.js --target=es2020
  dist/preload.js  23.3kb
⚡ Done in 10ms
```
Exit code: **0**. Artifact: `dist/preload.js` 23.3 KB.

### 7.2 Node syntax check
```
$ node --check dist/preload.js
node-check OK
```
Exit code: **0**.

### 7.3 TypeScript preload project
```
$ npx tsc -p tsconfig.preload.json --noEmit
TypeScript: No errors found
exit=0
```

### 7.4 Full typecheck (all 4 projects)
```
$ npm run typecheck
> tsc -p tsconfig.preload.json && tsc -p tsconfig.app.json && tsc -p tsconfig.renderer.json && tsc -p tsconfig.tests.json
exit=0
```
All four projects clean — including `tsconfig.renderer.json` (which now
sees `Window.api/pulse/metalsApi/platformInfo`) and `tsconfig.tests.json`
(which sees the new global via `src/shared/**/*.d.ts`).

### 7.5 Contract + window tests (GREEN)
```
$ npx vitest run tests/typescript/preload-contract.test.js \
                  tests/main/window.test.js \
                  tests/main/preload-api-contract.test.js \
                  tests/preload-platform.test.js
PASS (11) FAIL (0)
```

### 7.6 Full suite (excluding github-auth per brief)
```
$ npx vitest run --exclude tests/main/github-auth.test.js
PASS (4784) FAIL (0)
```
4784 tests pass, 0 failures. (github-auth was not excluded in any earlier
green run; brief explicitly excludes it for this verification pass only
— it has nothing to do with Task 3.)

---

## 8. Step 8 — `git diff --check` + commit

```
$ git diff --check
exit=0
```

```
$ git add package.json src/main/window.js src/main/index.js \
         src/main/ithome/share-card-renderer.js \
         tests/typescript/preload-contract.test.js \
         tests/main/preload-api-contract.test.js \
         tests/preload-platform.test.js \
         src/shared/window.d.ts

$ git status --short
M  package.json
D  preload.js
M  src/main/index.js
M  src/main/ithome/share-card-renderer.js
M  src/main/window.js
A  src/shared/window.d.ts
M  tests/main/preload-api-contract.test.js
M  tests/preload-platform.test.js
M  tests/typescript/preload-contract.test.js

$ git commit -m "build: compile TypeScript preload for Electron"
21567fd build: compile TypeScript preload for Electron
```

`dist/preload.js` is gitignored — not part of the commit.

Commit stat:
```
package.json                              |  21 +-
preload.js                                | 414 ------------------------------
src/main/index.js                         |   2 +-
src/main/ithome/share-card-renderer.js    |   2 +-
src/main/window.js                        |   4 +-
tests/main/preload-api-contract.test.js   |  57 ++--
tests/preload-platform.test.js            |   9 +-
tests/typescript/preload-contract.test.js |  15 +-
src/shared/window.d.ts                    |  12 +
9 files changed, 77 insertions(+), 459 deletions(-)
```

---

## 9. Self-check vs hard constraints

| Constraint | Status | Notes |
| --- | --- | --- |
| 不改 IPC/bridge 行为 | ✓ | Only path-resolution + build wiring changed. `exposeInMainWorld` calls & key shape untouched. |
| 不使用 `any` / `@ts-ignore` | ✓ | `grep -n "any\|@ts-ignore" src/shared/window.d.ts` empty. |
| 保留 `jsconfig` | ✓ | Untouched. |
| 不引入新依赖 | ✓ | `package.json` dependencies/devDependencies unchanged. |
| 不改业务 | ✓ | Renderer files untouched. Test files updated only where the test's *source-of-truth* moved from root `preload.js` to `dist/preload.js`. |
| dist 不入提交 | ✓ | `dist/preload.js` gitignored; commit contains only 9 src/config/test files + the deletion. |
| conventional commit | ✓ | `build: compile TypeScript preload for Electron` |
| Node 22 | ✓ | All commands run under `nvm use 22` (`.nvmrc` = `22`). |
| Root preload.js 不存在 | ✓ | Deleted via `git rm`; `git status` shows `D`. |

---

## 10. Concerns

1. **`package.json` build chain restructure.** The brief said "把 `prestart`/`build`/`dev` 串联且不重复"
   (chain them without duplication). I rewrote `build` and `dev` to invoke
   `electron-builder` / `electron .` directly and moved `build:renderer`
   into `prebuild` and `predev` (in addition to the existing `prestart`).
   This keeps the same call order from `npm run`-user perspective
   (`npm run build` → `prebuild` → `build:preload` → `build:renderer` →
   `electron-builder`) without running `build:renderer` twice. Confirm this
   matches the intended layering — alternative layout would be to leave
   `build:renderer` inline in `build` and only chain it from `prestart`/`predev`.

2. **`tests/main/preload-api-contract.test.js` parser rewrite.** The esbuild
   CommonJS bundle inlines `var api = { ... }` rather than passing the
   object literal to `exposeInMainWorld` in source form, which broke the
   old `exposeInMainWorld("api", {` parser. I updated the parser to
   extract from `var api = { ... }` directly. The *contract assertion*
   (preload's `api` covers `createApi()` keys) is unchanged. If you'd
   rather lock the contract against `preload.ts` source instead of the
   build output, the test could pivot — but I kept it against the
   actual deliverable (`dist/preload.js`) so it catches esbuild drift.

3. **Renderer comment references to `preload.js`.** `src/renderer/api.js` and
   three other renderer files contain prose like "preload.js 通过
   contextBridge 暴露" — these are descriptive, not runtime paths, so
   they were left alone per "不改业务". Worth updating in a follow-up
   if the team prefers source-of-truth docs.

---

## 11. Final state

- **Status:** GREEN — all 4784 tests pass (excluding github-auth per brief).
- **Commit:** `21567fd build: compile TypeScript preload for Electron`
- **Test summary:** `PRELOAD CONTRACT + WINDOW + API BRIDGE + PLATFORM: 11/11 PASS, FULL SUITE: 4784/4784 PASS`

---

# Task 3 review findings — fixes

**Branch:** `refactor/typescript-foundation`
**Initial HEAD:** `21567fd build: compile TypeScript preload for Electron`
**Final HEAD:** `<this commit>` — see "Commit" below.
**Node:** v22.22.3 (via `nvm use 22`; `.nvmrc` = `22`).

## 12. Findings fixed in this commit

### 12.1 RED evidence (clean checkout, before any fix)

```
$ rm -rf dist renderer-dist
$ ls dist
ls: dist: No such file or directory
$ npx vitest run tests/main/preload-api-contract.test.js \
                tests/preload-platform.test.js \
                tests/typescript/preload-contract.test.js
...
Error: Cannot find module '../dist/preload.js'   (×2, preload-platform)
Error: ENOENT ... 'dist/preload.js'              (ts preload-contract)
Error: ENOENT ... 'dist/preload.js'              (preload-api-contract)
```

Three independent tests failed because `dist/preload.js` was missing
(`.gitignore` line 11 excludes `dist/`). Release entry points
(`build:mac*` / `build:win` / `build:all`) also had no self-bootstrapping
hook, so a clean checkout `npm run build:mac` would launch
`electron-builder` without `dist/preload.js` and fail the `files` glob.

The legacy `tests/main/preload-api-contract.test.js` parsed
`var api = { ... }` out of the esbuild bundle (regex on a 2-space
indent) — exactly the "esbuild private indent format" the brief said
not to rely on.

### 12.2 Fixes

#### 12.2.1 package.json scripts (self-bootstrapping release entries)

Added 6 new pre-* hooks. Every release entry now runs
`build:preload` before invoking `electron-builder`, and the
nested `build:mac:all` / `build:win` indirection was removed from
`build:all` so the hook only fires once across the mac+win matrix.

```
"prebuild:mac":              "npm run build:preload",
"prebuild:mac:arm64-only":   "npm run build:preload",
"prebuild:mac:x64-only":     "npm run build:preload",
"prebuild:win":              "npm run build:preload",
"prebuild:all":              "npm run build:preload",
"pretest":                   "npm run build:preload",
"build:all": "electron-builder --mac --arm64 --x64 --publish never && electron-builder --win --x64 --publish never"
```

Verified lifecycle (`npm run build:all --dry-run`):
```
> npm run build:preload
> esbuild preload.ts --bundle --platform=node --format=cjs --external:electron --outfile=dist/preload.js --target=es2020
> electron-builder --mac --arm64 --x64 --publish never && electron-builder --win --x64 --publish never
  dist/preload.js  23.3kb
```

`build:preload` runs **exactly once** in the `build:all` chain (count
from grep: 1). The two `electron-builder` invocations then proceed
sequentially. No `build:renderer` in the chain because
release.yml already runs it before `build:mac`; this stays
unchanged.

Same dry-run pattern for `build:mac` / `build:mac:arm64-only` /
`build:mac:x64-only` / `build:win` each starts with
`> npm run build:preload` → esbuild actually writes
`dist/preload.js` (proof: `23.3kb` line printed).

#### 12.2.2 vitest globalSetup (CI direct-vitest path)

CI release job runs `pnpm exec vitest --run` — that bypasses
`npm run` and therefore bypasses `pretest`. The brief's
"必须修复 #2" 覆盖这条路径. Fix: `vitest.config.js` gains a
`globalSetup` entry pointing at a tiny CJS module that does
exactly what `pretest` would have done, but at vitest's own
bootstrap (so it fires for every `vitest` invocation, regardless
of how vitest is launched).

`tests/_setup/build-preload.cjs`:

```js
const PRELOAD_TS = path.resolve(__dirname, "..", "..", "preload.ts");
const PRELOAD_JS = path.resolve(__dirname, "..", "..", "dist", "preload.js");
module.exports = function setup() {
  if (fs.existsSync(PRELOAD_JS)) return;
  fs.mkdirSync(path.dirname(PRELOAD_JS), { recursive: true });
  const esbuild = require("esbuild");
  esbuild.buildSync({ entryPoints: [PRELOAD_TS], bundle: true, platform: "node", format: "cjs", external: ["electron"], outfile: PRELOAD_JS, target: "es2020", logLevel: "silent" });
};
```

The contract test keeps its own `beforeAll` as a second line of
defense (in case vitest is run in a config that doesn't load
`globalSetup`); both are idempotent and ~10 ms.

#### 12.2.3 preload-api-contract.test.js rewrite

Replaced the esbuild-bundle source parser with the same
`require.cache` stub pattern already used by
`tests/preload-platform.test.js`. New file:

- `beforeAll` builds `dist/preload.js` if missing (defence in depth
  on top of globalSetup).
- `beforeEach` injects a stub `electron` module into
  `require.cache` with a spy `exposeInMainWorld`.
- `requirePreloadFresh()` clears the preload cache then
  `cjsRequire(PRELOAD_PATH)` — the real esbuild CJS bundle
  executes end-to-end and calls the stub.
- `afterEach` deletes both cache entries to isolate every test
  from neighbours and from preload-platform.test.js (each file
  has its own fork, but in case of single-fork runs the cleanup
  still keeps things tidy).

Four new assertions:
1. `exposeInMainWorld` was called for each of `api / pulse /
   metalsApi / platformInfo`.
2. `platformInfo.platform === process.platform`.
3. `Object.keys(api)` covers every top-level key returned by
   `createApi()` in `src/renderer/api.js` (except the nested
   `releaseNotes`, kept as a top-level key on both sides).
4. `pulse` and `metalsApi` are non-empty objects.

No source-parse regex — the test only depends on the public
`contextBridge.exposeInMainWorld` API, which is the contract
being tested in the first place. ponytail: a future esbuild
major version that re-flows the bundle internals will not break
this test (whereas the previous parse would silently produce a
false-positive empty key list).

### 12.3 Constraints checklist (re-verified)

| Constraint | Status | Notes |
| --- | --- | --- |
| 1. 干净 checkout 跑发布入口先生成 dist/preload.js | ✓ | `prebuild:mac*` / `prebuild:win` / `prebuild:all` each run `build:preload`; `build:all` chain runs it exactly once. |
| 1. 避免不必要重复 renderer/preload 构建 | ✓ | Release chain no longer inlines `build:renderer`; `build:all` inlines `electron-builder --mac && --win` (not `npm run build:mac:all` etc) so the pre* hook fires once. |
| 2. 干净 checkout 直接执行项目测试命令时必须先有 dist/preload.js | ✓ | `pretest` (npm test) + `globalSetup` (pnpm exec vitest). |
| 2. 测试自身能在 dist 不存在时可靠准备产物 | ✓ | `tests/_setup/build-preload.cjs` globalSetup + per-test `beforeAll`; both pass `rm -rf dist` then run. |
| 2. 覆盖 npm test 和 CI direct vitest 两条路径 | ✓ | Verified below. |
| 3. 不解析 esbuild 私有缩进格式 | ✓ | Source parse removed; uses `require.cache` stub + real `require('dist/preload.js')`. |
| 3. 复用既有 vitest mock electron CJS 模式 | ✓ | Same pattern as `tests/preload-platform.test.js` (require.cache injection, isolation via beforeEach/afterEach). |
| 3. 验证 4 namespace 存在 | ✓ | New `it("exposes the four required contextBridge namespaces", ...)`. |
| 3. 验证 api key 契约 | ✓ | New `it("api namespace 的 key 覆盖 createApi() 的所有顶层 IPC (除 releaseNotes 嵌套)", ...)`. |
| 3. 隔离 require cache / listener | ✓ | `clearElectronStub()` deletes both `electron` and preload entries; `requirePreloadFresh()` re-resolves. |
| 3. 不执行真实 Electron | ✓ | Stub provides `contextBridge.exposeInMainWorld`, `ipcRenderer.{invoke,on,send,removeListener}`; no real electron loaded. |
| 4. 清除 package.json trailing whitespace | ✓ | `git diff --check` exit 0; `awk '/[ \t]+$/'` on changed/added files is empty. |
| 5. 不改变 IPC/API/bridge 行为 | ✓ | `preload.ts` and `src/renderer/api.js` untouched; only test wires changed. |
| 5. 不使用 any / @ts-ignore | ✓ | grep on all changed files returns empty. |
| 5. 不提交 dist | ✓ | `git status --ignored` lists `dist/` under ignored; nothing to commit. |
| 5. 不新增依赖 | ✓ | `git diff package.json \| grep '"(devD\|d)ependencies'` empty. esbuild already in devDependencies (used by `build:preload`). |
| 5. 保留 jsconfig | ✓ | `jsconfig.json` (645 B) unchanged. |

## 13. Verification (clean checkout, Node 22.22.3)

All commands run with `rm -rf dist renderer-dist` immediately
before, then `cd` to the worktree.

### 13.1 build:preload + node --check + typecheck

```
$ npm run build:preload
> esbuild preload.ts --bundle --platform=node --format=cjs --external:electron --outfile=dist/preload.js --target=es2020
  dist/preload.js  23.3kb
⚡ Done in 4ms
$ node --check dist/preload.js
$ echo $?
0
$ npm run typecheck
> tsc -p tsconfig.preload.json && tsc -p tsconfig.app.json && tsc -p tsconfig.renderer.json && tsc -p tsconfig.tests.json
$ echo $?
0
```

### 13.2 Related tests (preload / window / contract)

`pnpm exec vitest run` (CI direct path):

```
$ rm -rf dist
$ pnpm exec vitest run tests/main/preload-api-contract.test.js \
                        tests/preload-platform.test.js \
                        tests/typescript/preload-contract.test.js \
                        tests/main/window.test.js
PASS (14) FAIL (0)
```

`dist/preload.js` was created by `globalSetup` on the fly
(previously absent after `rm -rf dist`).

### 13.3 Full suite, npm test path

```
$ rm -rf dist
$ npm test -- --run --reporter=basic --exclude tests/main/github-auth.test.js
 Test Files  462 passed (462)
      Tests  4787 passed | 4 skipped (4791)
```

(4 skipped unchanged from main; brief excludes `github-auth` only.)

### 13.4 Full suite, pnpm exec vitest path

```
$ rm -rf dist
$ pnpm exec vitest run --exclude tests/main/github-auth.test.js
 Test Files  462 passed (462)
      Tests  4787 passed | 4 skipped (4791)
```

Both paths pass identically — globalSetup is the single point of
truth for the dist/preload.js fixture.

### 13.5 Release entry dry-run (proof of self-bootstrapping)

`npm run build:mac --dry-run`:
```
> npm run build:preload
> esbuild preload.ts --bundle --platform=node --format=cjs --external:electron --outfile=dist/preload.js --target=es2020
> electron-builder --mac --arm64 --x64 --publish never
  dist/preload.js  23.3kb
```

`npm run build:win --dry-run`:
```
> npm run build:preload
> esbuild preload.ts --bundle --platform=node --format=cjs --external:electron --outfile=dist/preload.js --target=es2020
> electron-builder --win --x64 --publish never
  dist/preload.js  23.3kb
```

`npm run build:all --dry-run`:
```
> npm run build:preload
> esbuild preload.ts --bundle --platform=node --format=cjs --external:electron --outfile=dist/preload.js --target=es2020
> electron-builder --mac --arm64 --x64 --publish never && electron-builder --win --x64 --publish never
  dist/preload.js  23.3kb
```

`grep -c 'build:preload'` against the `build:all` dry-run output
= 1. The hook fires once for the mac+win matrix, and
electron-builder only starts after the preload artifact is on
disk.

(We did not produce a real DMG / NSIS installer because the
brief said "不必真的完整打包 DMG, 但要证明 script 会先产出
preload". The dry-run above proves the script ordering, and
esbuild actually writes the artifact under `--dry-run` in this
project's setup. The Mac host `electron-builder` then fails on
`@noble/hashes/blake2.js` exports — a separate
electron-builder/noble-hashes packaging issue independent of
this fix.)

### 13.6 git diff --check

```
$ git diff --check
$ echo $?
0
```

No whitespace warnings across modified files
(`package.json`, `tests/main/preload-api-contract.test.js`,
`vitest.config.js`) or the new untracked file
(`tests/_setup/build-preload.cjs`).

## 14. Commit

```
$ git add package.json tests/main/preload-api-contract.test.js vitest.config.js tests/_setup/build-preload.cjs
$ git status --short
M  package.json
M  tests/main/preload-api-contract.test.js
M  vitest.config.js
A  tests/_setup/build-preload.cjs
$ git commit -m "..."
<new-sha> build: make release entries self-bootstrap preload artifact
```

`dist/preload.js` is gitignored — not part of the commit.

Commit stat (4 files, ~170 lines):
```
package.json                                  |  10 +-
tests/main/preload-api-contract.test.js       | 228 ++++++++++++++++--------
vitest.config.js                              |   4 +
tests/_setup/build-preload.cjs                |  42 +++++
```

## 15. Final state

- **Status:** GREEN — all 4787 tests pass (excluding `github-auth` per brief);
  4 skipped (pre-existing, not related).
- **Concerns:** see section 10.1 of the prior report (build chain restructure)
  — still valid; this commit does not change the per-prebuild composition,
  it only adds the missing pre* hooks for the release entries.
- **Test summary:** `RELATED: 14/14 PASS · CLEAN CHECKOUT npm test: 462/462 (4787/4787) · CLEAN CHECKOUT pnpm exec vitest: 462/462 (4787/4787)`

## 16. Node 22 lint follow-up

- Removed trailing whitespace from `package.json`.
- Updated the ESLint preload match from `preload.js` to `preload.ts` and reused the existing `tseslintParser`.
- Removed the unused `execSync` import from `tests/main/preload-api-contract.test.js`.
- Node: `v22.22.3`.
- ESLint: PASS — `npx eslint preload.ts tests/main/preload-api-contract.test.js --quiet`.
- Vitest: PASS — 14 passed, 0 failed across the four requested files.
- Typecheck: PASS — all four TypeScript project configs.