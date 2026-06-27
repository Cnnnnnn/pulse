import { describe, it, expect, beforeEach } from "vitest";
import {
  paletteOpen, paletteQuery, paletteResults, paletteSelectedIndex,
  openPalette, closePalette, setPaletteQuery, setPaletteResults, setPaletteSelectedIndex,
} from "../../src/renderer/command-palette-store.js";

beforeEach(() => {
  closePalette();
  setPaletteQuery("");
  setPaletteResults([]);
  setPaletteSelectedIndex(0);
});

describe("command-palette-store", () => {
  it("默认关闭", () => {
    expect(paletteOpen.value).toBe(false);
  });
  it("openPalette / closePalette 切换", () => {
    openPalette();
    expect(paletteOpen.value).toBe(true);
    closePalette();
    expect(paletteOpen.value).toBe(false);
  });
  it("setPaletteQuery 写 query", () => {
    setPaletteQuery("vscode");
    expect(paletteQuery.value).toBe("vscode");
  });
  it("setPaletteResults 写 results", () => {
    setPaletteResults([{ id: "1", label: "test" }]);
    expect(paletteResults.value).toEqual([{ id: "1", label: "test" }]);
  });
  it("setPaletteSelectedIndex 写 index", () => {
    setPaletteSelectedIndex(2);
    expect(paletteSelectedIndex.value).toBe(2);
  });
  it("closePalette 不重置 query/results (允许下次打开恢复)", () => {
    setPaletteQuery("foo");
    openPalette();
    closePalette();
    expect(paletteQuery.value).toBe("foo");
  });
});
