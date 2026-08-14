// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setThemePreference } from "../../src/renderer/theme/theme-manager.ts";

describe("theme manager IPC synchronization", () => {
  const themeSet = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-source");
    themeSet.mockClear();
    window.metalsApi = { themeSet } as any;
  });

  it("does not echo a main-process theme broadcast back to main", () => {
    setThemePreference("dark");
    setThemePreference("light", { syncMain: false });

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme-source")).toBe("light");
    expect(themeSet).toHaveBeenCalledTimes(1);
    expect(themeSet).toHaveBeenLastCalledWith("dark");
  });
});
