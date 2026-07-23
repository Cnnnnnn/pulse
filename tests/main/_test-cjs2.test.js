import { describe, it, expect } from "vitest";
describe("foo", () => {
  it("loads via require with .ts", () => {
    const x = require("../../src/main/timer-registry.ts");
    expect(typeof x.setManagedInterval).toBe("function");
  });
});
