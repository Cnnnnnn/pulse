/**
 * src/renderer/movies/MovieDetailView.tsx
 *
 * 电影详情视图（P0：猫眼详情字段）.
 *   海报/背景图 + 译名&原名 + 评分 + 上映日 + 类型 + 片长 + 剧情 + 主演 + 预告.
 *   按需 fetchMovieDetail(movieId)；单图失败兜底；预告可播放.
 */
import { useEffect, useState } from "preact/hooks";
import { fetchMovieDetail, moviesDetailLoading, moviesDetailError } from "./store.ts";

function formatGenres(g: any): string {
  if (Array.isArray(g) && g.length) return g.join(" / ");
  return "未知";
}

export function MovieDetailView({ movieId, onBack }: any) {
  const [detail, setDetail] = useState<any>(null);
  const [imgError, setImgError] = useState(false);

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

  return (
    <div
      class="movie-detail"
      style={
        detail.backdrop
          ? { backgroundImage: `linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.65)), url(${detail.backdrop})` }
          : undefined
      }
    >
      <button class="movie-detail__back" onClick={onBack}>
        ← 返回
      </button>
      <div class="movie-detail__hero">
        <div class="movie-detail__poster">
          {!imgError && detail.poster ? (
            <img src={detail.poster} alt={detail.title} onError={() => setImgError(true)} />
          ) : (
            <div class="movie-card__poster-fallback">🎬</div>
          )}
        </div>
        <div class="movie-detail__headinfo">
          <h2 class="movie-detail__title">{detail.title}</h2>
          {detail.enTitle && <div class="movie-detail__entitle">{detail.enTitle}</div>}
          <div class="movie-detail__line">
            {typeof detail.rating === "number" ? (
              <span class="movie-detail__rating">{detail.rating.toFixed(1)}</span>
            ) : (
              <span class="movie-detail__rating movie-card__rating--none">
                {detail.ratingLabel || "暂无评分"}
              </span>
            )}
            {detail.releaseDate && <span>上映 {detail.releaseDate}</span>}
            {detail.durationMin && <span>片长 {detail.durationMin} 分钟</span>}
          </div>
          {detail.genres && (
            <div class="movie-detail__genres">
              {detail.genres.map((g: string, i: number) => (
                <span class="movie-detail__chip" key={i}>
                  {g}
                </span>
              ))}
            </div>
          )}
          {detail.showInfo && <div class="movie-detail__line movie-detail__muted">{detail.showInfo}</div>}
          {detail.director && <div class="movie-detail__line movie-detail__muted">导演：{detail.director}</div>}
          {detail.star && <div class="movie-detail__line movie-detail__muted">主演：{detail.star}</div>}
        </div>
      </div>
      {detail.summary && (
        <div class="movie-detail__section">
          <h3>剧情简介</h3>
          <p class="movie-detail__summary">{detail.summary}</p>
        </div>
      )}
      {detail.trailerUrl && (
        <div class="movie-detail__section">
          <h3>预告片</h3>
          <video class="movie-detail__trailer" src={detail.trailerUrl} controls preload="none" />
        </div>
      )}
    </div>
  );
}

export default MovieDetailView;
