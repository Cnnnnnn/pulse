// tests/typescript/fixtures/ts-loader-fixture.tsx
//
// ESLint CLI behavior probe for Task 4 follow-up.
//
// Purpose: ESLint flat config (eslint.config.mjs) declares `**/*.tsx` under the
// renderer scope with `parser: tseslintParser` + `parserOptions.ecmaFeatures.jsx`.
// This file is *not* under src/renderer; it lives in tests/. The tests scope also
// has JSX enabled, so ESLint must accept and exit 0 here.
//
// Minimal Preact JSX is used to prove the renderer JSX pipeline (tseslintParser +
// ecmaFeatures.jsx) is wired; the fixture is run by ESLint directly, not by esbuild.
export const tsx = () => 1;

// Minimal JSX element — relies on Preact automatic runtime (jsxImportSource).
// Using a literal keeps the fixture side-effect-free; no actual render path.
export const jsx = <span>tsx-fixture</span>;