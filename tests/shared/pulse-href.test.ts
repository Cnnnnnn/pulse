import { describe, expect, it } from "vitest";
import {
  actionToPulseHref,
  normalizeUiAction,
  parsePulseHref,
} from "../../src/shared/pulse-href";

describe("pulse-href", () => {
  it("round-trips navigate actions", () => {
    const href = actionToPulseHref({
      tool: "navigate",
      params: { nav: "invest", tab: "stocks" },
    });
    expect(href).toBe("pulse://nav/invest?tab=stocks");
    expect(parsePulseHref(href!)).toEqual({
      tool: "navigate",
      params: { nav: "invest", tab: "stocks" },
    });
  });

  it("parses movie detail href", () => {
    expect(parsePulseHref("pulse://movies/detail?title=八仙")).toEqual({
      tool: "open_movie_detail",
      params: { title: "八仙" },
    });
  });

  it("normalizes pulse_open tool", () => {
    expect(
      normalizeUiAction({
        tool: "pulse_open",
        params: { href: "pulse://overlay/search" },
      }),
    ).toEqual({ tool: "open_search", params: {} });
  });
});
