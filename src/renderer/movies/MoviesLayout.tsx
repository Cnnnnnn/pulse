/**
 * src/renderer/movies/MoviesLayout.tsx
 *
 * 电影模块主视图（v2.84 布局重构：苹果原生风 + 焦点片/横滑分区）.
 *   header: 标题 + 刷新 + 「示例」徽标(source=sample 时)
 *   controls: 范围 segmented(全部/热映/即将) + 搜索 + 排序（作用于底部网格）
 *   spotlight: 「今晚首选」焦点片（今晚 picks 轮换）
 *   tonight: 今晚值得看 3 张宽卡
 *   rails: 正在热映 / 即将上映 两条横滑海报排
 *   grid: 全部影片网格（搜索/排序/范围过滤）→ 点卡片进 MovieDetailView
 */
import { useEffect, useMemo, useState } from "preact/hooks";
import "./movies.css";
import {
  bootstrapMoviesTab,
  subscribeMoviesUpdates,
  cleanupMoviesUpdates,
  refreshMovies,
  setMoviesCity,
  formatMoviesFetchedAt,
  moviesNowPlaying,
  moviesComing,
  moviesLoaded,
  moviesLoading,
  moviesSource,
  moviesError,
  moviesLastFetched,
  moviesCityId,
  moviesComingNote,
  moviesSelectedId,
} from "./store.ts";
import { MOVIE_CITIES, MOVIE_SOURCE_LABEL, getMovieCity } from "../../shared/movies-constants.ts";
import { pickTonightMovies } from "./tonight.ts";
import { getMovieReason, filterAndSortMovies } from "./discovery.ts";
import { MovieCard, MovieRailCard } from "./MovieCard.tsx";
import { MovieDetailView } from "./MovieDetailView.tsx";

type GridScope = "all" | "now" | "coming";
type SortKey = "rating-desc" | "release-asc" | "wish-desc";

const SCOPES: { key: GridScope; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "now", label: "正在热映" },
  { key: "coming", label: "即将上映" },
];

export function MoviesLayout() {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<GridScope>("all");
  const [sort, setSort] = useState<SortKey>("rating-desc");
  const [heroIdx, setHeroIdx] = useState(0);
  const selectedId = moviesSelectedId.value;

  useEffect(() => {
    bootstrapMoviesTab();
    subscribeMoviesUpdates();
    return () => {
      cleanupMoviesUpdates();
    };
  }, []);

  if (selectedId) {
    return (
      <MovieDetailView
        movieId={selectedId}
        onBack={() => {
          moviesSelectedId.value = null;
        }}
      />
    );
  }

  const loading = moviesLoading.value;
  const loaded = moviesLoaded.value;
  const isSample = moviesSource.value === "sample";
  const tmdbCity = getMovieCity(moviesCityId.value);
  const sourceLabel = MOVIE_SOURCE_LABEL[moviesSource.value] || moviesSource.value;
  const fetchedLabel = formatMoviesFetchedAt(moviesLastFetched.value);
  const err =
    moviesError.value ||
    (isSample && tmdbCity && tmdbCity.tmdbRegion
      ? "港澳片单走 TMDB，请在设置中配置 API Key"
      : null);

  const nowList = moviesNowPlaying.value;
  const comingList = moviesComing.value;
  const tonightMovies = useMemo(() => pickTonightMovies(nowList, 3), [nowList]);
  const heroMovie = tonightMovies[heroIdx % Math.max(tonightMovies.length, 1)];
  const nowRail = useMemo(
    () => filterAndSortMovies(nowList, { sort: "rating-desc" }),
    [nowList],
  );
  const comingRail = useMemo(
    () => filterAndSortMovies(comingList, { sort: "release-asc" }),
    [comingList],
  );

  const scopeList =
    scope === "now" ? nowList : scope === "coming" ? comingList : [...nowList, ...comingList];
  const sortOptions: { key: SortKey; label: string }[] =
    scope === "now"
      ? [{ key: "rating-desc", label: "评分优先" }]
      : [
          { key: "release-asc", label: "上映日期" },
          { key: "wish-desc", label: "想看人数" },
          { key: "rating-desc", label: "评分优先" },
        ];
  const effectiveSort = sortOptions.some((o) => o.key === sort) ? sort : sortOptions[0].key;
  const gridList = filterAndSortMovies(scopeList, { query, sort: effectiveSort });
  const gridEmpty = loading && scopeList.length === 0
    ? "加载中…"
    : !loaded && scopeList.length === 0
      ? "暂无数据，请点击刷新"
      : gridList.length === 0
        ? "没有匹配的影片"
        : null;

  const openMovie = (movie: any) => {
    moviesSelectedId.value = movie.id;
  };

  return (
    <div class="movies-layout">
      <div class="movies-header">
        <div class="movies-header__left">
          <div class="movies-header__title">
            电影
            {isSample && <span class="movies-header__badge">示例数据</span>}
          </div>
          <div class="movies-header__meta">
            {sourceLabel && <span>{sourceLabel}</span>}
            {fetchedLabel && <span>{fetchedLabel}</span>}
            {err && <span class="movies-header__err">{err}</span>}
          </div>
        </div>
        <div class="movies-header__actions">
          <select
            class="movies-header__city"
            value={String(moviesCityId.value)}
            disabled={loading}
            onChange={(e: any) => setMoviesCity(Number(e.currentTarget.value))}
          >
            {MOVIE_CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            class="movies-header__refresh"
            onClick={() => refreshMovies()}
            disabled={loading}
          >
            {loading ? "刷新中…" : "刷新"}
          </button>
        </div>
      </div>

      <div class="movies-controls">
        <div class="movies-segmented" role="tablist" aria-label="片单范围">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              class={`movies-segmented__item${scope === s.key ? " movies-segmented__item--on" : ""}`}
              onClick={() => setScope(s.key)}
              role="tab"
              aria-selected={scope === s.key}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div class="movies-controls__right">
          <input
            class="movies-search"
            value={query}
            onInput={(event: any) => setQuery(event.currentTarget.value)}
            placeholder="搜索片名、类型…"
            aria-label="搜索电影"
          />
          <select
            class="movies-sort"
            value={effectiveSort}
            onChange={(event: any) => setSort(event.currentTarget.value)}
            aria-label="电影排序"
          >
            {sortOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {heroMovie && (
        <section
          class={`movies-spotlight${heroMovie.poster ? "" : " movies-spotlight--noposter"}`}
          onClick={openMovie.bind(null, heroMovie)}
          role="button"
          tabIndex={0}
          onKeyDown={(event: any) => {
            if (event.key === "Enter") openMovie(heroMovie);
          }}
        >
          <div class="movies-spotlight__poster">
            {heroMovie.poster ? <img src={heroMovie.poster} alt="" loading="lazy" /> : <span>🎬</span>}
          </div>
          <div class="movies-spotlight__body">
            <div class="movies-spotlight__kicker">
              今晚首选{heroIdx > 0 ? ` · 备选 ${heroIdx + 1}` : " · 评分最高"}
            </div>
            <div class="movies-spotlight__title">
              {heroMovie.title}
              {typeof heroMovie.rating === "number" && heroMovie.rating > 0 && (
                <span class="movies-spotlight__score">★ {heroMovie.rating.toFixed(1)}</span>
              )}
            </div>
            <div class="movies-spotlight__facts">
              {[
                Array.isArray(heroMovie.genres) && heroMovie.genres.length > 0
                  ? heroMovie.genres.join(" / ")
                  : heroMovie.showInfo || "类型待定",
                heroMovie.durationMin ? `${heroMovie.durationMin} 分钟` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div class="movies-spotlight__reason">
              {getMovieReason(heroMovie) || heroMovie.summary || "今日热映推荐"}
            </div>
            <div class="movies-spotlight__cta">
              <button class="movies-btn movies-btn--primary">查看详情</button>
              <button
                class="movies-btn movies-btn--ghost"
                onClick={(e: any) => {
                  e.stopPropagation();
                  setHeroIdx((heroIdx + 1) % tonightMovies.length);
                }}
              >
                换一部
              </button>
            </div>
          </div>
          <div class="movies-spotlight__dots" aria-hidden="true">
            {tonightMovies.map((_: any, i: number) => (
              <i key={i} class={i === heroIdx % tonightMovies.length ? "on" : ""} />
            ))}
          </div>
        </section>
      )}

      {tonightMovies.length > 0 && (
        <section class="movies-tonight">
          <div class="movies-section__head">
            <h2 class="movies-section__title">今晚值得看</h2>
            <span class="movies-section__more">按评分挑选</span>
          </div>
          <div class="movies-tonight__row">
            {tonightMovies.map((movie: any) => (
              <button class="movies-tonight__card" key={movie.id} onClick={() => openMovie(movie)}>
                <span class="movies-tonight__poster">
                  {movie.poster ? <img src={movie.poster} alt="" loading="lazy" /> : <span>🎬</span>}
                </span>
                <span class="movies-tonight__body">
                  <span class="movies-tonight__name">
                    {movie.title}
                    {typeof movie.rating === "number" && (
                      <em>{movie.rating.toFixed(1)}</em>
                    )}
                  </span>
                  <small>{getMovieReason(movie) || movie.showInfo || "热门推荐"}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {nowRail.length > 0 && (
        <section class="movies-rail-section">
          <div class="movies-section__head">
            <h2 class="movies-section__title">正在热映</h2>
            <span class="movies-section__more">{nowRail.length} 部</span>
          </div>
          <div class="movies-rail-wrap">
            <div class="movies-rail">
              {nowRail.map((movie: any) => (
                <MovieRailCard key={movie.id} movie={movie} kind="now" onClick={openMovie} />
              ))}
            </div>
          </div>
        </section>
      )}

      {comingRail.length > 0 && (
        <section class="movies-rail-section">
          <div class="movies-section__head">
            <h2 class="movies-section__title movies-section__title--blue">即将上映</h2>
            <span class="movies-section__more">{comingRail.length} 部</span>
          </div>
          <div class="movies-rail-wrap">
            <div class="movies-rail">
              {comingRail.map((movie: any) => (
                <MovieRailCard key={movie.id} movie={movie} kind="coming" onClick={openMovie} />
              ))}
            </div>
          </div>
          {moviesComingNote.value && <div class="movies-coming-note">{moviesComingNote.value}</div>}
        </section>
      )}

      <section class="movies-grid-section">
        <div class="movies-section__head">
          <h2 class="movies-section__title">
            {scope === "all" ? "全部影片" : scope === "now" ? "正在热映" : "即将上映"}
          </h2>
          {gridList.length > 0 && <span class="movies-section__more">{gridList.length} 部</span>}
        </div>
        {gridEmpty ? (
          <div class="movies-empty">{gridEmpty}</div>
        ) : (
          <div class="movies-gallery">
            {gridList.map((m: any) => (
              <MovieCard key={m.id} movie={m} kind={m.wish != null ? "coming" : "now"} onClick={openMovie} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default MoviesLayout;
