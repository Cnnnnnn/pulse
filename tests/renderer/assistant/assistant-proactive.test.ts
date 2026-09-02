import { describe, expect, it } from "vitest";
import { countConcertPriceDrops } from "../../../src/renderer/assistant/assistant-proactive.ts";

describe("assistant-proactive", () => {
  it("countConcertPriceDrops returns 0 without prev snapshots", () => {
    expect(countConcertPriceDrops()).toBe(0);
  });
});
