import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const { requireMain } = require("../_setup/require-main.cjs");
const repository = requireMain("ithome/news-repository");

function tmpStatePath() {
  const dir = join(
    tmpdir(),
    `pulse-ithome-repository-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

describe("ithome news repository", () => {
  it("missing state returns a normalized empty news snapshot", () => {
    const loaded = repository.load(tmpStatePath());
    expect(loaded).toEqual({
      ts: 0,
      articles: {},
      summaries: {},
      favorites: {},
      dayStats: {},
    });
  });

  it("normalizes invalid domain fields without changing valid siblings", () => {
    expect(
      repository.normalizeNews({
        ts: "bad",
        articles: null,
        summaries: { a: { text: "摘要" } },
        favorites: [],
        dayStats: { today: { count: 1 } },
      }),
    ).toEqual({
      ts: 0,
      articles: {},
      summaries: { a: { text: "摘要" } },
      favorites: {},
      dayStats: { today: { count: 1 } },
    });
  });

  it("saves only the news domain while preserving unrelated state", () => {
    const statePath = tmpStatePath();
    writeFileSync(
      statePath,
      JSON.stringify({
        v: 1,
        apps: { Cursor: { name: "Cursor" } },
        mutes: { Cursor: { until: 0 } },
        watchlist: [{ type: "app", ref: "Cursor" }],
      }),
    );

    repository.save(
      {
        ts: 123,
        articles: { a: { id: "a", title: "A" } },
        summaries: {},
        favorites: {},
        dayStats: {},
      },
      statePath,
    );

    const raw = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(raw.apps.Cursor.name).toBe("Cursor");
    expect(raw.mutes.Cursor.until).toBe(0);
    expect(raw.watchlist).toEqual([{ type: "app", ref: "Cursor" }]);
    expect(raw.ithome_news.articles.a.title).toBe("A");
  });
});
