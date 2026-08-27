// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/preact";

const detail = {
  id: "movie-1",
  title: "奥德赛",
  enTitle: "The Odyssey",
  poster: "https://image.example/poster.jpg",
  backdrop: "https://image.example/backdrop.jpg",
  rating: 9.7,
  releaseDate: "2026-08-14",
  durationMin: 148,
  genres: ["动作", "冒险"],
  summary: "一场横跨海洋与时间的归途。",
  director: "克里斯托弗·诺兰",
  star: "马特·达蒙, 安妮·海瑟薇",
  trailerUrl: "https://video.example/trailer.mp4",
};

vi.mock("../../src/renderer/movies/store.ts", () => ({
  fetchMovieDetail: vi.fn(async () => detail),
  moviesDetailLoading: { value: false },
  moviesDetailError: { value: null },
  moviesCityId: { value: 1 },
}));

vi.mock("../../src/renderer/api.ts", () => ({
  api: {
    moviesWatchlistList: vi.fn(async () => ({ ok: true, items: [] })),
    moviesWatchlistToggle: vi.fn(async () => ({ ok: true, watched: true })),
    moviesCinemas: vi.fn(async () => ({ ok: true, cinemas: [], total: 0, hasMore: false })),
    moviesCinemaShows: vi.fn(async () => ({ ok: true, days: [] })),
    moviesCinemaFilters: vi.fn(async () => ({ ok: true, districts: [] })),
    openUrl: vi.fn(),
  },
}));

import { MovieDetailView } from "../../src/renderer/movies/MovieDetailView.tsx";

describe("MovieDetailView", () => {
  it("organizes supported movie data into poster, summary, credits, and trailer sections", async () => {
    const { container } = render(<MovieDetailView movieId="movie-1" onBack={vi.fn()} />);

    await waitFor(() => expect(container.querySelector(".movie-detail--light")).not.toBeNull());
    expect(container.querySelector(".movie-detail__summary-panel")?.textContent).toContain("一场横跨海洋");
    expect(container.querySelector(".movie-detail__credits")?.textContent).toContain("克里斯托弗·诺兰");
    expect(container.querySelector(".movie-detail__trailer")).not.toBeNull();
  });
});
