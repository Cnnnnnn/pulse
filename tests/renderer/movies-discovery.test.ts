import { describe, expect, it } from "vitest";
import {
  filterAndSortMovies,
  getMovieReason,
  groupComingMovies,
} from "../../src/renderer/movies/discovery.ts";

describe("movie discovery selectors", () => {
  it("prefers a high rating when deriving tonight's reason", () => {
    expect(getMovieReason({ rating: 8.6, showInfo: "今日 100 家影院" }, new Date("2026-08-20"))).toBe("评分较高");
    expect(getMovieReason({ showInfo: "今日 100 家影院" }, new Date("2026-08-20"))).toBe("今日有排片");
  });

  it("filters title, original title, and genres then sorts without mutating input", () => {
    const list = [
      { id: "a", title: "奥德赛", enTitle: "The Odyssey", rating: 8.1, genres: ["动作"] },
      { id: "b", title: "八仙", rating: 9.2, genres: ["动画"] },
      { id: "c", title: "无声之城", rating: 7.4, genres: ["犯罪"] },
    ];

    expect(filterAndSortMovies(list, { query: "动画", sort: "rating-desc" }).map((movie) => movie.id)).toEqual(["b"]);
    expect(filterAndSortMovies(list, { query: "odyssey", sort: "rating-desc" }).map((movie) => movie.id)).toEqual(["a"]);
    expect(list.map((movie) => movie.id)).toEqual(["a", "b", "c"]);
  });

  it("groups coming movies into this week, next week, later, and unknown dates", () => {
    const groups = groupComingMovies([
      { id: "this", releaseDate: "2026-08-21" },
      { id: "next", releaseDate: "2026-08-25" },
      { id: "later", releaseDate: "2026-09-12" },
      { id: "unknown" },
    ], new Date("2026-08-20T08:00:00"));

    expect(groups.map((group) => [group.key, group.movies.map((movie) => movie.id)])).toEqual([
      ["this-week", ["this"]],
      ["next-week", ["next"]],
      ["later", ["later"]],
      ["unknown", ["unknown"]],
    ]);
  });
});
