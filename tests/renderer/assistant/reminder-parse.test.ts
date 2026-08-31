import { describe, expect, it } from "vitest";
import {
  parseReminderTriggerAt,
  formatReminderWhen,
} from "../../src/renderer/assistant/reminder-parse";

describe("reminder-parse", () => {
  it("parses ISO and relative offsets", () => {
    const iso = "2030-01-15T09:00:00.000Z";
    expect(parseReminderTriggerAt(iso)).toBe(Date.parse(iso));
    const h = parseReminderTriggerAt("+2h");
    expect(h).toBeGreaterThan(Date.now());
    expect(h!).toBeLessThan(Date.now() + 3 * 3_600_000);
  });

  it("formatReminderWhen returns string", () => {
    expect(formatReminderWhen(Date.now())).toMatch(/\d/);
  });
});
