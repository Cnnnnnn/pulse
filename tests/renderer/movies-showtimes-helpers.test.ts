import { describe, it, expect } from "vitest";
import {
  supportsMaoyanShowtimes,
  movieShowDay,
  MOVIE_CITY_HK,
} from "../../src/shared/movies-constants.ts";

describe("movies showtimes helpers", () => {
  it("内地城市支持排片，港澳不支持", () => {
    expect(supportsMaoyanShowtimes(30)).toBe(true);
    expect(supportsMaoyanShowtimes(1)).toBe(true);
    expect(supportsMaoyanShowtimes(MOVIE_CITY_HK)).toBe(false);
  });

  it("movieShowDay 产出 YYYY-MM-DD", () => {
    expect(movieShowDay(0, new Date(2026, 7, 27))).toBe("2026-08-27");
    expect(movieShowDay(1, new Date(2026, 7, 27))).toBe("2026-08-28");
  });
});
