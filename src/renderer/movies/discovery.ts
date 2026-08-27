type MovieLike = {
  title?: string;
  enTitle?: string;
  genres?: string[];
  rating?: number;
  releaseDate?: string;
  wish?: number;
  showInfo?: string;
};

type SortKey = "rating-desc" | "release-asc" | "wish-desc";

export function getMovieReason(movie: MovieLike, now = new Date()): string | null {
  if (typeof movie.rating === "number" && movie.rating >= 8) return "评分较高";
  if (movie.showInfo) return "今日有排片";
  const release = parseDate(movie.releaseDate);
  const days = release ? Math.floor((release.getTime() - startOfDay(now).getTime()) / 86_400_000) : Infinity;
  return days >= 0 && days <= 7 ? "近期上映" : null;
}

export function filterAndSortMovies<T extends MovieLike>(
  movies: T[],
  { query = "", sort = "rating-desc" }: { query?: string; sort?: SortKey } = {},
): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = (Array.isArray(movies) ? movies : []).filter((movie) => {
    if (!normalized) return true;
    return [movie.title, movie.enTitle, ...(Array.isArray(movie.genres) ? movie.genres : [])]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLocaleLowerCase().includes(normalized));
  });

  return filtered
    .map((movie, index) => ({ movie, index }))
    .sort((a, b) => compareMovies(a.movie, b.movie, sort) || a.index - b.index)
    .map(({ movie }) => movie);
}

export function groupComingMovies<T extends MovieLike>(movies: T[], now = new Date()) {
  const today = startOfDay(now);
  const endThisWeek = new Date(today);
  endThisWeek.setDate(today.getDate() + (7 - today.getDay()) % 7);
  const endNextWeek = new Date(endThisWeek);
  endNextWeek.setDate(endThisWeek.getDate() + 7);
  const buckets = [
    { key: "this-week", label: "本周上映", movies: [] as T[] },
    { key: "next-week", label: "下周上映", movies: [] as T[] },
    { key: "later", label: "更晚上映", movies: [] as T[] },
    { key: "unknown", label: "日期待定", movies: [] as T[] },
  ];

  for (const movie of Array.isArray(movies) ? movies : []) {
    const release = parseDate(movie.releaseDate);
    const bucket = !release || release < today
      ? buckets[3]
      : release <= endThisWeek
        ? buckets[0]
        : release <= endNextWeek
          ? buckets[1]
          : buckets[2];
    bucket.movies.push(movie);
  }
  return buckets.filter((bucket) => bucket.movies.length > 0);
}

function compareMovies(a: MovieLike, b: MovieLike, sort: SortKey): number {
  if (sort === "wish-desc") return (b.wish || -1) - (a.wish || -1);
  if (sort === "release-asc") {
    const left = parseDate(a.releaseDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const right = parseDate(b.releaseDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  }
  return (b.rating ?? -1) - (a.rating ?? -1);
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function parseDate(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
