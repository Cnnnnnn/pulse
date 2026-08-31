// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/preact";

const movieData = vi.hoisted(() => ({
  now: [
    {
      id: "dune-2",
      title: "沙丘 2",
      enTitle: "Dune: Part Two",
      poster: "https://image.example/dune.jpg",
      rating: 8.8,
      showInfo: "正在热映",
      source: "maoyan-netstart",
    },
    {
      id: "mickey-17",
      title: "编号 17",
      poster: "https://image.example/mickey.jpg",
      rating: 7.8,
      showInfo: "正在热映",
      source: "maoyan-netstart",
    },
    {
      id: "ne-zha-2",
      title: "哪吒之魔童闹海",
      poster: "https://image.example/ne-zha.jpg",
      rating: 8.6,
      showInfo: "正在热映",
      source: "maoyan-netstart",
    },
  ],
  coming: [
    {
      id: "mufasa",
      title: "狮子王：木法沙传",
      poster: "https://image.example/mufasa.jpg",
      wish: 124000,
      releaseDate: "12月20日",
      source: "maoyan-netstart",
    },
  ],
}));

// 真信号：点击写入 moviesSelectedId 后组件才会重渲染进详情
vi.mock("../../src/renderer/movies/store.ts", async () => {
  const { signal } = await import("@preact/signals");
  return {
    bootstrapMoviesTab: vi.fn(),
    subscribeMoviesUpdates: vi.fn(),
    cleanupMoviesUpdates: vi.fn(),
    refreshMovies: vi.fn(),
    setMoviesCity: vi.fn(),
    formatMoviesFetchedAt: vi.fn(() => ""),
    moviesNowPlaying: signal(movieData.now),
    moviesComing: signal(movieData.coming),
    moviesLoaded: signal(true),
    moviesLoading: signal(false),
    moviesSource: signal("maoyan-netstart"),
    moviesError: signal<string | null>(null),
    moviesLastFetched: signal(0),
    moviesCityId: signal(1),
    moviesComingNote: signal(""),
    moviesSelectedId: signal<string | null>(null),
  };
});

vi.mock("../../src/renderer/movies/MovieDetailView.tsx", () => ({
  MovieDetailView: ({ movieId }: { movieId: string }) => <div data-testid="movie-detail">{movieId}</div>,
}));

import { MoviesLayout } from "../../src/renderer/movies/MoviesLayout.tsx";
import { moviesSelectedId } from "../../src/renderer/movies/store.ts";

describe("MoviesLayout", () => {
  afterEach(() => {
    moviesSelectedId.value = null;
  });

  it("renders spotlight, tonight picks, rails and grid from now/coming lists", () => {
    const { container } = render(<MoviesLayout />);

    // 焦点片：评分最高的热映片
    expect(container.querySelector(".movies-spotlight__title")?.textContent).toContain("沙丘 2");
    // 今晚值得看 3 张：按评分排序
    const tonightTitles = [...container.querySelectorAll(".movies-tonight__name")].map(
      (el) => el.childNodes[0]?.textContent,
    );
    expect(tonightTitles).toEqual(["沙丘 2", "哪吒之魔童闹海", "编号 17"]);
    // 正在热映横滑排 3 张 + 评分角标
    const railCards = [...container.querySelectorAll(".movies-rail")];
    expect(railCards[0].querySelectorAll(".movie-rail-card")).toHaveLength(3);
    expect(railCards[0].querySelector(".movie-rail-card__badge")?.textContent).toBe("8.8");
    // 即将上映横滑排 1 张 + 想看角标
    expect(railCards[1].querySelectorAll(".movie-rail-card")).toHaveLength(1);
    expect(railCards[1].querySelector(".movie-rail-card__badge")?.textContent).toContain("想看");
    // 底部网格（全部范围 = 热映 + 即将）
    expect(container.querySelectorAll(".movies-gallery .movie-card")).toHaveLength(4);
  });

  it("opens movie detail from a rail card", () => {
    const { container } = render(<MoviesLayout />);

    fireEvent.click(container.querySelector(".movie-rail-card")!);

    expect(container.querySelector("[data-testid=movie-detail]")?.textContent).toBe("dune-2");
  });

  it("opens movie detail from the grid", () => {
    const { container } = render(<MoviesLayout />);

    const gridCards = [...container.querySelectorAll(".movies-gallery .movie-card")];
    fireEvent.click(gridCards.find((el) => el.textContent?.includes("狮子王"))!);

    expect(container.querySelector("[data-testid=movie-detail]")?.textContent).toBe("mufasa");
  });
});
