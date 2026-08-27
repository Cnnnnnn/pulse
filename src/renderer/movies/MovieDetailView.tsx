/**
 * src/renderer/movies/MovieDetailView.tsx
 *
 * 电影详情视图（P0：猫眼详情字段）.
 *   海报/背景图 + 译名&原名 + 评分 + 上映日 + 类型 + 片长 + 剧情 + 主演 + 预告.
 *   按需 fetchMovieDetail(movieId)；单图失败兜底；预告可播放.
 */
import { useEffect, useState } from "preact/hooks";
import { api } from "../api.ts";
import { fetchMovieDetail, moviesCityId, moviesDetailLoading, moviesDetailError } from "./store.ts";
import { CinemaShowtimes } from "./CinemaShowtimes.tsx";

function isYoutubeTrailer(url: string): boolean {
  return /youtube\.com\/watch|youtu\.be\/|youtube\.com\/embed/.test(url);
}

export function MovieDetailView({ movieId, onBack }: any) {
  const [detail, setDetail] = useState<any>(null);
  const [imgError, setImgError] = useState(false);
  const [watched, setWatched] = useState(false);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setImgError(false);
    fetchMovieDetail(movieId).then((d) => {
      if (alive) setDetail(d);
    });
    return () => {
      alive = false;
    };
  }, [movieId]);

  useEffect(() => {
    api.moviesWatchlistList().then((response: any) => {
      setWatched(Boolean(response?.items?.some((item: any) => item.movieId === movieId && item.cityId === moviesCityId.value)));
    });
  }, [movieId]);

  const loading = moviesDetailLoading.value;
  const error = moviesDetailError.value;

  if (loading && !detail) {
    return (
      <div class="movie-detail">
        <button class="movie-detail__back" onClick={onBack}>
          ← 返回
        </button>
        <div class="movie-detail__loading">加载中…</div>
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div class="movie-detail">
        <button class="movie-detail__back" onClick={onBack}>
          ← 返回
        </button>
        <div class="movie-detail__error">{error}</div>
      </div>
    );
  }

  if (!detail) return null;

  const summaryStyle = detail.backdrop ? { backgroundImage: `url(${detail.backdrop})` } : undefined;

  return (
    <div class="movie-detail movie-detail--light">
      <button class="movie-detail__back" onClick={onBack}>
        ← 返回
      </button>
      <div class="movie-detail__layout">
        <div class="movie-detail__poster">
          {!imgError && detail.poster ? (
            <img src={detail.poster} alt={detail.title} onError={() => setImgError(true)} />
          ) : (
            <div class="movie-card__poster-fallback">🎬</div>
          )}
        </div>
        <main class="movie-detail__content">
          <header class="movie-detail__headinfo">
            <h2 class="movie-detail__title">{detail.title}</h2>
            {detail.enTitle && <div class="movie-detail__entitle">{detail.enTitle}</div>}
            {typeof detail.rating === "number" ? (
              <div class="movie-detail__rating">{detail.rating.toFixed(1)}</div>
            ) : detail.ratingLabel ? (
              <div class="movie-detail__rating movie-detail__rating--label">{detail.ratingLabel}</div>
            ) : null}
            <div class="movie-detail__facts">
              {detail.releaseDate && <span>{detail.releaseDate}</span>}
              {detail.durationMin && <span>{detail.durationMin} 分钟</span>}
              {detail.genres?.map((genre: string, i: number) => <span key={i}>{genre}</span>)}
              {detail.showInfo && <span>{detail.showInfo}</span>}
            </div>
            <button
              class="movie-detail__watch"
              onClick={async () => {
                const response: any = await api.moviesWatchlistToggle({
                  movieId,
                  cityId: moviesCityId.value,
                  title: detail.title,
                  poster: detail.poster,
                  releaseDate: detail.releaseDate,
                });
                if (response?.ok) setWatched(Boolean(response.watched));
              }}
            >
              {watched ? "已想看" : "想看"}
            </button>
          </header>

          {detail.summary && (
            <section
              class={`movie-detail__summary-panel${detail.backdrop ? " movie-detail__summary-panel--backdrop" : ""}`}
              style={summaryStyle}
            >
              <h3>剧情简介</h3>
              <p>{detail.summary}</p>
            </section>
          )}

          {(detail.director || detail.star) && (
            <section class="movie-detail__credits">
              {detail.director && <div><strong>导演</strong><span>{detail.director}</span></div>}
              {detail.star && <div><strong>主演</strong><span>{detail.star}</span></div>}
            </section>
          )}

          {detail.trailerUrl && (
            <section class="movie-detail__trailer-section">
              <h3>预告片</h3>
              {isYoutubeTrailer(String(detail.trailerUrl)) ? (
                <button
                  class="movie-detail__trailer-open"
                  type="button"
                  onClick={() => api.openUrl(detail.trailerUrl)}
                >
                  在 YouTube 打开预告片
                </button>
              ) : (
                <video class="movie-detail__trailer" src={detail.trailerUrl} controls preload="none" />
              )}
            </section>
          )}

          <CinemaShowtimes
            movieId={movieId}
            cityId={moviesCityId.value}
            source={detail.source}
            isSample={detail.isSample}
          />
        </main>
      </div>
    </div>
  );
}

export default MovieDetailView;
