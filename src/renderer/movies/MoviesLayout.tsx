/**
 * src/renderer/movies/MoviesLayout.tsx
 *
 * 电影模块主视图（P0）.
 *   header: 标题 + 刷新 + 「示例」徽标(source=sample 时)
 *   tonight: 热映按评分取 3 片
 *   tab: 热映 / 即将上映
 *   列表: MovieCard 纵向快速片单
 *   详情: 点列表行 → MovieDetailView（按需拉取）
 */
import { useEffect, useState } from "preact/hooks";
import "./movies.css";
import {
  bootstrapMoviesTab,
  subscribeMoviesUpdates,
  cleanupMoviesUpdates,
  refreshMovies,
  setMoviesCity,
  formatMoviesFetchedAt,
  moviesActiveTab,
  moviesActiveList,
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
import { filterAndSortMovies, getMovieReason, groupComingMovies } from "./discovery.ts";
import { MovieCard } from "./MovieCard.tsx";
import { MovieDetailView } from "./MovieDetailView.tsx";

export function MoviesLayout() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"rating-desc" | "release-asc" | "wish-desc">("rating-desc");
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

  const tab = moviesActiveTab.value;
  const list = moviesActiveList.value;
  const loading = moviesLoading.value;
  const loaded = moviesLoaded.value;
  const isSample = moviesSource.value === "sample";
  const tmdbCity = getMovieCity(moviesCityId.value);
  const sourceLabel = MOVIE_SOURCE_LABEL[moviesSource.value] || moviesSource.value;
  const fetchedLabel = formatMoviesFetchedAt(moviesLastFetched.value);
  const effectiveSort = tab === "now" && sort === "wish-desc" ? "rating-desc" : sort;
  const filteredList = filterAndSortMovies(list, { query, sort: effectiveSort });
  const tonightMovies = tab === "now" ? pickTonightMovies(filteredList) : [];
  const comingGroups = tab === "coming" ? groupComingMovies(filteredList) : [];
  const err =
    moviesError.value ||
    (isSample && tmdbCity && tmdbCity.tmdbRegion
      ? "港澳片单走 TMDB，请在设置中配置 API Key"
      : null);

  const setTab = (t: "now" | "coming") => {
    moviesActiveTab.value = t;
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

      <div class="movies-tabs" role="tablist" aria-label="电影片单">
        <button
          class={`movies-tab${tab === "now" ? " movies-tab--active" : ""}`}
          onClick={() => setTab("now")}
          role="tab"
          aria-selected={tab === "now"}
        >
          热映
        </button>
        <button
          class={`movies-tab${tab === "coming" ? " movies-tab--active" : ""}`}
          onClick={() => setTab("coming")}
          role="tab"
          aria-selected={tab === "coming"}
        >
          即将上映
        </button>
      </div>

      {tonightMovies.length > 0 && (
        <section class="movies-tonight">
          <h2 class="movies-tonight__title">今晚值得看</h2>
          <div class="movies-tonight__picks">
            {tonightMovies.map((movie: any) => (
              <button
                class="movies-tonight__pick"
                key={movie.id}
                onClick={() => {
                  moviesSelectedId.value = movie.id;
                }}
              >
                {movie.poster && <img src={movie.poster} alt="" />}
                <span class="movies-tonight__copy">
                  <strong>{movie.title}</strong>
                  {typeof movie.rating === "number" && <em>{movie.rating.toFixed(1)}</em>}
                  <small>{getMovieReason(movie) || movie.showInfo || "热门推荐"}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div class="movies-discovery-controls">
        <input
          class="movies-discovery-controls__query"
          value={query}
          onInput={(event: any) => setQuery(event.currentTarget.value)}
          placeholder="搜索片名、原名或类型"
          aria-label="搜索电影"
        />
        <select
          class="movies-discovery-controls__sort"
          value={effectiveSort}
          onChange={(event: any) => setSort(event.currentTarget.value)}
          aria-label="电影排序"
        >
          {tab === "now" ? (
            <option value="rating-desc">评分优先</option>
          ) : (
            <>
              <option value="release-asc">上映日期</option>
              <option value="wish-desc">想看人数</option>
              <option value="rating-desc">评分优先</option>
            </>
          )}
        </select>
      </div>

      {tab === "coming" && moviesComingNote.value && (
        <div class="movies-coming-note">{moviesComingNote.value}</div>
      )}

      <div class="movies-library">
        <div class="movies-content">
          <div class="movies-library-head" aria-hidden="true">
            <span>影片</span>
            <span>类型 / 时长</span>
            <span>评分</span>
            <span>{tab === "now" ? "上映状态" : "上映日期"}</span>
            <span />
          </div>
          {loading && list.length === 0 ? (
            <div class="movies-empty">加载中…</div>
          ) : !loaded && list.length === 0 ? (
            <div class="movies-empty">暂无数据，请点击刷新</div>
          ) : filteredList.length === 0 ? (
            <div class="movies-empty">暂无片单</div>
          ) : tab === "coming" ? (
            <div class="movies-coming-groups">
              {comingGroups.map((group) => (
                <section class="movies-coming-group" key={group.key}>
                  <h3>{group.label}</h3>
                  <div class="movies-list movies-gallery">
                    {group.movies.map((movie: any) => (
                      <MovieCard
                        key={movie.id}
                        movie={movie}
                        kind="coming"
                        onClick={(nextMovie: any) => {
                          moviesSelectedId.value = nextMovie.id;
                        }}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div class="movies-gallery">
              {filteredList.map((m: any) => (
                <MovieCard
                  key={m.id}
                  movie={m}
                  kind="now"
                  onClick={(movie: any) => {
                    moviesSelectedId.value = movie.id;
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MoviesLayout;
