import { describe, it, expect } from "vitest";
const { requireMain } = require("../_setup/require-main.cjs");

describe("movies sample (L4)", () => {
  const { getMoviesSample } = requireMain("movies/sample");

  it("返回 8 热映 + 6 即将上映，全部 isSample=true", () => {
    const p = getMoviesSample();
    expect(p.nowPlaying.length).toBe(8);
    expect(p.coming.length).toBe(6);
    expect(p.source).toBe("sample");
    for (const m of [...p.nowPlaying, ...p.coming]) {
      expect(m.isSample).toBe(true);
      expect(typeof m.id).toBe("string");
      expect(typeof m.title).toBe("string");
      expect(m.poster).toMatch(/^https:\/\//);
    }
  });

  it("每次调用返回新对象（避免共享引用污染）", () => {
    const a = getMoviesSample();
    const b = getMoviesSample();
    expect(a.nowPlaying).not.toBe(b.nowPlaying);
    a.nowPlaying[0].title = "X";
    expect(b.nowPlaying[0].title).not.toBe("X");
  });
});

describe("shouldFetchMaoyanDetail", () => {
  const { shouldFetchMaoyanDetail } = requireMain("movies/types");

  it("示例和 TMDB 不打猫眼，猫眼片要打", () => {
    expect(shouldFetchMaoyanDetail({ id: "s1", title: "x", source: "sample", isSample: true })).toBe(false);
    expect(shouldFetchMaoyanDetail({ id: "9", title: "x", source: "tmdb" })).toBe(false);
    expect(shouldFetchMaoyanDetail({ id: "1", title: "x", source: "maoyan-netstart" })).toBe(true);
    expect(shouldFetchMaoyanDetail(null)).toBe(true);
  });
});
