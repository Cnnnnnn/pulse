import { describe, it, expect } from "vitest";
import { pickTonightMovies } from "../../src/renderer/movies/tonight.ts";

describe("pickTonightMovies", () => {
  it("按评分从高到低取 n 部", () => {
    const list = [
      { id: "a", rating: 7.1 },
      { id: "b", rating: 9.0 },
      { id: "c" },
      { id: "d", rating: 8.2 },
    ];
    expect(pickTonightMovies(list, 3).map((m) => m.id)).toEqual(["b", "d", "a"]);
  });
});
