import { afterEach, describe, expect, it, vi } from "vitest";

const { logFetchError } = require("../../../src/main/games/log.js");

afterEach(() => vi.restoreAllMocks());

describe("logFetchError", () => {
  it("格式化 Error 对象的 message", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logFetchError("playstation:psgamespider", new Error("timeout"));
    expect(warn).toHaveBeenCalledWith(
      "[games] fetch failed: playstation:psgamespider — timeout",
    );
  });

  it("格式化字符串异常", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logFetchError("switch:algolia", "network down");
    expect(warn).toHaveBeenCalledWith(
      "[games] fetch failed: switch:algolia — network down",
    );
  });

  it("格式化无 message 的异常对象", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logFetchError("itad:xbox", { code: 42 });
    expect(warn).toHaveBeenCalledWith(
      "[games] fetch failed: itad:xbox — [object Object]",
    );
  });

  it("格式化 null/undefined 异常", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logFetchError("xbox:free-play-days", null);
    expect(warn).toHaveBeenCalledWith(
      "[games] fetch failed: xbox:free-play-days — null",
    );
    logFetchError("exchange-rates:USD", undefined);
    expect(warn).toHaveBeenLastCalledWith(
      "[games] fetch failed: exchange-rates:USD — undefined",
    );
  });
});
