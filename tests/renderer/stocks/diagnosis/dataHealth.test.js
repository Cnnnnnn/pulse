import { describe, it, expect } from "vitest";
import {
  deriveAngleStatus,
  STALE_MS,
  failureReasonText,
  HEALTH_REASON_TEXT,
} from "../../../../src/renderer/stocks/diagnosis/dataHealth.js";

describe("deriveAngleStatus", () => {
  const NOW = 1_700_000_000_000;
  const recent = NOW - 1000;
  const stale = NOW - STALE_MS - 1000;

  it("failed status when angle.status='failed'", () => {
    expect(deriveAngleStatus({ status: "failed", fetchedAt: recent, data: null }, NOW))
      .toBe("failed");
  });

  it("ok when status='ok' and fetchedAt is recent", () => {
    expect(deriveAngleStatus({ status: "ok", fetchedAt: recent, data: { x: 1 } }, NOW))
      .toBe("ok");
  });

  it("stale when status='ok' but fetchedAt older than STALE_MS", () => {
    expect(deriveAngleStatus({ status: "ok", fetchedAt: stale, data: { x: 1 } }, NOW))
      .toBe("stale");
  });

  it("partial when status='ok' but data is null/empty", () => {
    expect(deriveAngleStatus({ status: "ok", fetchedAt: recent, data: null }, NOW))
      .toBe("partial");
    expect(deriveAngleStatus({ status: "ok", fetchedAt: recent, data: {} }, NOW))
      .toBe("partial");
  });

  it("failed takes precedence over stale when both apply", () => {
    expect(deriveAngleStatus({ status: "failed", fetchedAt: stale, data: null }, NOW))
      .toBe("failed");
  });
});

describe("STALE_MS", () => {
  it("is 30 days in ms", () => {
    expect(STALE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("failureReasonText", () => {
  it("translates known reason codes", () => {
    expect(failureReasonText({ reason: "fetch_failed", error: null }))
      .toBe(HEALTH_REASON_TEXT.fetch_failed);
    expect(failureReasonText({ reason: "parse_failed", error: "bad json" }))
      .toBe(`${HEALTH_REASON_TEXT.parse_failed}: bad json`);
  });

  it("falls back to error string for unknown reason", () => {
    expect(failureReasonText({ reason: "exotic_thing", error: "raw msg" }))
      .toBe("exotic_thing: raw msg");
  });

  it("returns generic unknown when no reason and no error", () => {
    expect(failureReasonText({ reason: null, error: null }))
      .toBe(HEALTH_REASON_TEXT.unknown);
  });
});
