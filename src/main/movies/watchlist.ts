import { load, patchState } from "../state-store.js";

export type MovieWatchItem = {
  movieId: string;
  cityId: number;
  title: string;
  poster?: string;
  releaseDate?: string;
  createdAt: number;
  reminderId?: string;
};

type ToggleInput = Omit<MovieWatchItem, "createdAt">;

export function createMovieWatchlist({
  loadState = load,
  patch = patchState,
  now = Date.now,
}: {
  loadState?: () => any;
  patch?: (updater: (state: any) => void) => unknown;
  now?: () => number;
} = {}) {
  function list(): MovieWatchItem[] {
    const value = loadState()?.movieWatchlist;
    return Array.isArray(value) ? value.filter(isMovieWatchItem) : [];
  }

  function toggle(input: ToggleInput) {
    const item = normalizeInput(input, now());
    if (!item) return { ok: false as const, reason: "invalid_args" as const };
    let watched = false;
    patch((state) => {
    const entries = Array.isArray(state.movieWatchlist) ? state.movieWatchlist.filter(isMovieWatchItem) : [];
    const index = entries.findIndex((entry: any) => sameKey(entry, item));
    if (index >= 0) {
        item.reminderId = entries[index].reminderId;
        entries.splice(index, 1);
      } else {
        entries.push(item);
        watched = true;
      }
      state.movieWatchlist = entries;
    });
    return { ok: true as const, watched, item };
  }

  function setReminder(movieId: string, cityId: number, reminderId: string): boolean {
    if (!movieId || !Number.isInteger(cityId) || !reminderId) return false;
    let updated = false;
    patch((state) => {
      const entries = Array.isArray(state.movieWatchlist) ? state.movieWatchlist.filter(isMovieWatchItem) : [];
      const entry = entries.find((candidate: any) => candidate.movieId === movieId && candidate.cityId === cityId);
      if (entry) {
        entry.reminderId = reminderId;
        updated = true;
      }
      state.movieWatchlist = entries;
    });
    return updated;
  }

  return { list, toggle, setReminder };
}

const defaultWatchlist = createMovieWatchlist();
export const listMovieWatchlist = defaultWatchlist.list;
export const toggleMovieWatchlist = defaultWatchlist.toggle;
export const setMovieWatchlistReminder = defaultWatchlist.setReminder;

function normalizeInput(input: ToggleInput, createdAt: number): MovieWatchItem | null {
  if (!input || typeof input.movieId !== "string" || !input.movieId || typeof input.title !== "string" || !input.title) return null;
  if (!Number.isInteger(input.cityId) || input.cityId <= 0) return null;
  return {
    movieId: input.movieId,
    cityId: input.cityId,
    title: input.title.slice(0, 160),
    ...(typeof input.poster === "string" ? { poster: input.poster } : {}),
    ...(typeof input.releaseDate === "string" ? { releaseDate: input.releaseDate } : {}),
    createdAt,
  };
}

function sameKey(a: MovieWatchItem, b: MovieWatchItem): boolean {
  return a.movieId === b.movieId && a.cityId === b.cityId;
}

function isMovieWatchItem(value: any): value is MovieWatchItem {
  return value && typeof value.movieId === "string" && Number.isInteger(value.cityId) && typeof value.title === "string";
}
