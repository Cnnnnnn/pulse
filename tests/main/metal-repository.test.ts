import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const { requireMain } = require("../_setup/require-main.cjs");
const repository = requireMain("metals/metal-repository");

function tmpStatePath() {
  const dir = join(
    tmpdir(),
    `pulse-metal-repository-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

describe("metal repository", () => {
  it("cold start returns complete defaults", () => {
    expect(repository.load(tmpStatePath())).toEqual({
      watchedIds: ["XAU", "XAG", "AU9999", "AG9999"],
      holdings: { XAU: null, XAG: null, AU9999: null, AG9999: null },
      deletedIds: [],
      historyMap: {},
      lastBackfillAt: 0,
    });
  });

  it("normalizes malformed config without treating invalid values as live data", () => {
    const normalized = repository.normalizeConfig({
      watchedIds: ["XAU", 0, ""],
      holdings: [],
      deletedIds: {},
      historyMap: { XAU: [{ date: "today" }], XAG: "bad" },
      lastBackfillAt: "not-a-timestamp",
    });
    expect(normalized.watchedIds).toEqual(["XAU"]);
    expect(normalized.holdings).toEqual({
      XAU: null,
      XAG: null,
      AU9999: null,
      AG9999: null,
    });
    expect(normalized.deletedIds).toEqual([]);
    expect(normalized.historyMap).toEqual({ XAU: [{ date: "today" }] });
    expect(normalized.lastBackfillAt).toBe(0);
  });

  it("updates metals without dropping sibling state", () => {
    const statePath = tmpStatePath();
    writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: { Cursor: { name: "Cursor" } },
        funds: { holdings: [{ code: "000001" }] },
      }),
    );
    repository.saveHistoryMap(
      { XAU: [{ date: "2026-08-16", close: 100 }] },
      statePath,
    );
    repository.markBackfilled(1234, statePath);
    const raw = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(raw.apps.Cursor.name).toBe("Cursor");
    expect(raw.funds.holdings).toEqual([{ code: "000001" }]);
    expect(raw.metals.historyMap.XAU[0].close).toBe(100);
    expect(raw.metals.lastBackfillAt).toBe(1234);
  });
});
