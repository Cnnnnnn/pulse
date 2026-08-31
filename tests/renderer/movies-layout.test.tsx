// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/preact";

const movieState = vi.hoisted(() => ({
  activeTab: { value: "now" as "now" | "coming" },
  activeList: {
    value: [
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
  },
  loaded: { value: true },
  loading: { value: false },
  source: { value: "maoyan-netstart" },
  error: { value: null as string | null },
  lastFetched: { value: 0 },
  cityId: { value: 1 },
  comingNote: { value: "" },
}));

vi.mock("../../src/renderer/movies/store.ts", () => ({
  bootstrapMoviesTab: vi.fn(),
  subscribeMoviesUpdates: vi.fn(),
  cleanupMoviesUpdates: vi.fn(),
  refreshMovies: vi.fn(),
  setMoviesCity: vi.fn(),
  formatMoviesFetchedAt: vi.fn(() => ""),
  moviesActiveTab: movieState.activeTab,
  moviesActiveList: movieState.activeList,
  moviesLoaded: movieState.loaded,
  moviesLoading: movieState.loading,
  moviesSource: movieState.source,
  moviesError: movieState.error,
  moviesLastFetched: movieState.lastFetched,
  moviesCityId: movieState.cityId,
  moviesComingNote: movieState.comingNote,
}));

vi.mock("../../src/renderer/movies/MovieDetailView.tsx", () => ({
  MovieDetailView: ({ movieId }: { movieId: string }) => <div data-testid="movie-detail">{movieId}</div>,
}));

import { MoviesLayout } from "../../src/renderer/movies/MoviesLayout.tsx";

describe("MoviesLayout", () => {
  it("shows three tonight picks above a scannable movie list", () => {
    const { container } = render(<MoviesLayout />);

    expect(container.querySelector(".movies-spotlight")).toBeNull();
    const titles = [...container.querySelectorAll(".movies-tonight__copy strong")].map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(["沙丘 2", "哪吒之魔童闹海", "编号 17"]);
    expect(container.querySelectorAll(".movies-gallery .movie-card")).toHaveLength(3);
    expect(container.querySelectorAll(".movies-gallery .movie-card__status")).toHaveLength(3);
    expect(container.querySelector(".movies-preview")).toBeNull();
    expect(container.querySelectorAll(".movies-library-head span")).toHaveLength(5);
  });

  it("opens movie detail from a list row", () => {
    const { container } = render(<MoviesLayout />);

    fireEvent.click(container.querySelector(".movies-gallery .movie-card")!);

    expect(container.querySelector("[data-testid=movie-detail]")?.textContent).toBe("dune-2");
  });
});
