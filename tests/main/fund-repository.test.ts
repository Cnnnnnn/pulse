import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const { requireMain } = require("../_setup/require-main.cjs");
const repository = requireMain("funds/fund-repository");

function tmpStatePath() {
  const dir = join(
    tmpdir(),
    `pulse-fund-repository-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

describe("fund repository", () => {
  it("cold start returns the complete normalized fund snapshot", () => {
    expect(repository.load(tmpStatePath())).toMatchObject({
      holdings: [],
      deletedIds: [],
      dailySnapshots: [],
      navSource: "tiantian",
      alertPrefs: {
        enabled: false,
        profitPct: 10,
        lossPct: -5,
        lastNotified: {},
      },
    });
  });

  it("normalizes invalid collections and keeps valid holdings", () => {
    const normalized = repository.normalizeFunds({
      holdings: [
        { id: "ok", code: "000001" },
        { id: "bad", code: "12345" },
      ],
      deletedIds: "bad",
      dailySnapshots: [{ date: "bad" }],
      navSource: "unsupported",
    });
    expect(normalized.holdings).toEqual([{ id: "ok", code: "000001" }]);
    expect(normalized.deletedIds).toEqual([]);
    expect(normalized.dailySnapshots).toEqual([]);
    expect(normalized.navSource).toBe("tiantian");
  });

  it("saves the fund domain without dropping sibling state", () => {
    const statePath = tmpStatePath();
    writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: { Cursor: { name: "Cursor" } },
        ithome_news: { articles: { a: { id: "a" } } },
      }),
    );
    repository.save(
      {
        holdings: [{ id: "h", code: "000001" }],
        deletedIds: [],
      },
      statePath,
    );
    const raw = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(raw.apps.Cursor.name).toBe("Cursor");
    expect(raw.ithome_news.articles.a.id).toBe("a");
    expect(raw.funds.holdings).toEqual([{ id: "h", code: "000001" }]);
    expect(raw.funds.navSource).toBe("tiantian");
  });
});
