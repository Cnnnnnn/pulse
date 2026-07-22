// tests/_smoke/loader-smoke.test.tsx
//
// Task 4 follow-up: vitest include assertion probe.
//
// vitest.config.js include globs are `tests/**/*.test.{js,jsx,ts,tsx}`.
// This file uses `.test.tsx` and intentionally avoids rendering JSX so the
// smoke test stays independent of happy-dom / preact resolution. It only
// needs to *be collected* by vitest — vitest's --list run will print it.
import { describe, expect, it } from "vitest";

describe("vitest include collector smoke", () => {
  it("is collected by vitest's tests/**/*.test.{js,jsx,ts,tsx} include", () => {
    expect(typeof it).toBe("function");
    // Tiny TSX-friendly expression so the file is genuinely TS+JSX, not .ts.
    const marker: number = 1;
    expect(marker).toBe(1);
  });
});