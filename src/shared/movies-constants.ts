/**
 * 电影模块共享常量（主进程 + 渲染进程）。
 * 猫眼 comingList 的 ci 城市码；热映接口本身不带城。
 * 香港/澳门不在猫眼城市表，用合成 id + tmdbRegion，拉取走 TMDB。
 */

export const MOVIES_CACHE_TTL_MS = 30 * 60 * 1000;

export const DEFAULT_MOVIE_CITY_ID = 1;

/** 合成 id，避开猫眼 ci（1–1000+） */
export const MOVIE_CITY_HK = 90001;
export const MOVIE_CITY_MO = 90002;

export type MovieCity = {
  id: number;
  name: string;
  /** 有值则跳过猫眼，直接 TMDB now_playing/upcoming */
  tmdbRegion?: string;
  language?: string;
};

export const MOVIE_CITIES: ReadonlyArray<MovieCity> = [
  { id: 1, name: "北京" },
  { id: 10, name: "上海" },
  { id: 20, name: "广州" },
  { id: 30, name: "深圳" },
  { id: MOVIE_CITY_HK, name: "香港", tmdbRegion: "HK", language: "zh-HK" },
  { id: MOVIE_CITY_MO, name: "澳门", tmdbRegion: "MO", language: "zh-HK" },
  { id: 59, name: "成都" },
  { id: 45, name: "重庆" },
  { id: 50, name: "杭州" },
  { id: 55, name: "南京" },
  { id: 57, name: "武汉" },
  { id: 65, name: "西安" },
];

export const MOVIE_SOURCE_LABEL: Record<string, string> = {
  "maoyan-netstart": "猫眼",
  "maoyan-direct": "猫眼",
  tmdb: "TMDB",
  sample: "示例",
};

export function getMovieCity(id: unknown): MovieCity | undefined {
  const n = typeof id === "number" ? id : Number(id);
  return MOVIE_CITIES.find((c) => c.id === n);
}

export function sanitizeMovieCityId(id: unknown): number {
  const city = getMovieCity(id);
  return city ? city.id : DEFAULT_MOVIE_CITY_ID;
}

/** 内地猫眼城市才有影院排片；港澳走 TMDB，无排片接口 */
export function supportsMaoyanShowtimes(cityId: unknown): boolean {
  const city = getMovieCity(cityId);
  return Boolean(city && !city.tmdbRegion);
}

/** YYYY-MM-DD，本地时区；offsetDays=0 今天 */
export function movieShowDay(offsetDays = 0, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
