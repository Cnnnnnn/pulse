/**
 * tests/renderer/nav-store.test.js
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  activeNav,
  setActiveNav,
} from "../../src/renderer/worldcup/navStore.js";

describe("navStore", () => {
  beforeEach(() => {
    activeNav.value = "versions";
  });

  it("setActiveNav accepts ithome", () => {
    setActiveNav("ithome");
    expect(activeNav.value).toBe("ithome");
  });

  it("setActiveNav ignores unknown keys", () => {
    setActiveNav("unknown");
    expect(activeNav.value).toBe("versions");
  });
});
