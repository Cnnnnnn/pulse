import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
describe("foo", () => {
  it("loads via require bare", () => {
    const x = require("../../src/main/timer-registry");
    expect(typeof x.setManagedInterval).toBe("function");
  });
});
