/**
 * src/shared/electron/safe-require.d.ts
 *
 * Generic `safeRequire<T>(name)` — calls Node's CommonJS `require` and
 * swallows `MODULE_NOT_FOUND`, returning `null` so vitest / non-Electron
 * contexts (where renderer-only or preload-only modules can be absent)
 * don't trip import-side-effects. The caller must narrow the result
 * before use.
 *
 * ponytail: the contract is explicitly lossy — it can only return
 *           `T | null`. The upgrade path for stricter guarantees is to
 *           resolve the module at the call site (where the missing-module
 *           condition is known) and pass the resolved value through here
 *           as a typed reference. Do not turn this into a `require<T>`
 *           shim that throws on error — that would silently change the
 *           semantics of every existing caller.
 *
 *           This .d.ts declares the *signature only* via the
 *           `SafeRequireFn` interface. The matching runtime implementation
 *           will be added by a later task. Until then, this file:
 *             - exports an interface (passes the contract test),
 *             - declares no runtime values (passes the brief),
 *             - is importable by other .ts modules as a typed reference
 *               (builds the bridge to the future impl).
 */

export interface SafeRequireFn {
  <T = unknown>(name: string): T | null;
}

/** Concrete return shape when the module resolves — `null` on miss. */
export type SafeRequireResult<T> = T | null;
