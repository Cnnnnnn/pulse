/**
 * src/renderer/movies/MoviesLayout.tsx
 *
 * 电影模块主视图（P0）.
 *   header: 标题 + 刷新 + 「示例」徽标(source=sample 时)
 *   tab: 热映 / 即将上映
 *   列表: MovieCard 网格（长列表朴素滚动，规模适中未引入虚拟滚动）
 *   详情: 点卡片 → MovieDetailView（按需拉取）
 */
import { useEffect, useState } from "preact/hooks";
import "./movies.css";
import {
  bootstrapMoviesTab,
  subscribeMoviesUpdates,
  cleanupMoviesUpdates,
  refreshMovies,
  moviesActiveTab,
  moviesActiveList,
  moviesLoaded,
  moviesLoading,
  moviesSource,
} from "./store.ts";
import { MovieCard } from "./MovieCard.tsx";
import { MovieDetailView } from "./MovieDetailView.tsx";

export function MoviesLayout() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    bootstrapMoviesTab();
    subscribeMoviesUpdates();
    return () => {
      cleanupMoviesUpdates();
    };
  }, []);

  if (selectedId) {
    return <MovieDetailView movieId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  const tab = moviesActiveTab.value;
  const list = moviesActiveList.value;
  const loading = moviesLoading.value;
  const loaded = moviesLoaded.value;
  const isSample = moviesSource.value === "sample";

  const setTab = (t: "now" | "coming") => {
    moviesActiveTab.value = t;
  };

  return (
    <div class="movies-layout">
      <div class="movies-header">
        <div class="movies-header__title">
          电影
          {isSample && <span class="movies-header__badge">示例数据</span>}
        </div>
        <button
          class="movies-header__refresh"
          onClick={() => refreshMovies()}
          disabled={loading}
        >
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      <div class="movies-tabs">
        <button
          class={`movies-tab${tab === "now" ? " movies-tab--active" : ""}`}
          onClick={() => setTab("now")}
        >
          热映
        </button>
        <button
          class={`movies-tab${tab === "coming" ? " movies-tab--active" : ""}`}
          onClick={() => setTab("coming")}
        >
          即将上映
        </button>
      </div>

      <div class="movies-content">
        {loading && list.length === 0 ? (
          <div class="movies-empty">加载中…</div>
        ) : !loaded && list.length === 0 ? (
          <div class="movies-empty">暂无数据，请点击刷新</div>
        ) : list.length === 0 ? (
          <div class="movies-empty">暂无片单</div>
        ) : (
          <div class="movies-grid">
            {list.map((m: any) => (
              <MovieCard
                key={m.id}
                movie={m}
                kind={tab === "coming" ? "coming" : "now"}
                onClick={(movie: any) => setSelectedId(movie.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default MoviesLayout;
