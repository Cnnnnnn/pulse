import { describe, expect, it } from "vitest";
import { createMovieWatchlist } from "../../src/main/movies/watchlist.ts";

describe("movie watchlist", () => {
  it("keeps city-specific movie entries and toggles only the matching key", () => {
    let state: any = { movieWatchlist: [] };
    const watchlist = createMovieWatchlist({
      loadState: () => state,
      patch: (updater: any) => { updater(state); },
      now: () => 100,
    });

    expect(watchlist.toggle({ movieId: "1", cityId: 1, title: "奥德赛" })).toMatchObject({ watched: true });
    expect(watchlist.setReminder("1", 1, "reminder-1")).toBe(true);
    expect(watchlist.list()[0].reminderId).toBe("reminder-1");
    expect(watchlist.toggle({ movieId: "1", cityId: 2, title: "奥德赛" })).toMatchObject({ watched: true });
    expect(watchlist.toggle({ movieId: "1", cityId: 1, title: "奥德赛" })).toMatchObject({ watched: false });
    expect(watchlist.list()).toEqual([
      expect.objectContaining({ movieId: "1", cityId: 2, title: "奥德赛", createdAt: 100 }),
    ]);
  });

  it("rejects malformed input without persisting it", () => {
    const watchlist = createMovieWatchlist({ loadState: () => ({}), patch: () => {} });
    expect(watchlist.toggle({ movieId: "", cityId: 1, title: "" })).toEqual({ ok: false, reason: "invalid_args" });
  });
});
