/**
 * src/renderer/movies/MovieCard.tsx
 *
 * 电影卡片（热映 / 即将上映通用）.
 *   - 热映：评分 + 场次(showInfo)，无 wish
 *   - 即将上映：想看数(wish, 万) + 上映文案 + 预热状态
 *   - 海报单图失败 → onError 兜底隐藏，容器显示占位底色（不影响其余字段）
 *   - isSample → 角标
 */
import { Component } from "preact";

function formatWish(wish?: number): string {
  if (typeof wish !== "number") return "";
  if (wish >= 10000) return `${(wish / 10000).toFixed(1)}万 想看`;
  return `${wish} 想看`;
}

export class MovieCard extends Component<any, { imgError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { imgError: false };
  }

  onImgError = (e: any) => {
    this.setState({ imgError: true });
    if (e && e.currentTarget) e.currentTarget.style.visibility = "hidden";
  };

  render() {
    const { movie, kind, onClick } = this.props;
    if (!movie) return null;
    const sampleCls = movie.isSample ? " movie-card--sample" : "";
    const wishStr = formatWish(movie.wish);

    return (
      <div class={`movie-card${sampleCls}`} onClick={() => onClick && onClick(movie)}>
        <div class="movie-card__poster">
          {!this.state.imgError && movie.poster ? (
            <img
              src={movie.poster}
              alt={movie.title || "电影海报"}
              loading="lazy"
              onError={this.onImgError}
            />
          ) : (
            <div class="movie-card__poster-fallback">🎬</div>
          )}
          {movie.isSample && <span class="movie-card__sample">示例</span>}
        </div>
        <div class="movie-card__body">
          <div class="movie-card__title" title={movie.title}>
            {movie.title}
          </div>
          {movie.enTitle && <div class="movie-card__entitle">{movie.enTitle}</div>}
          <div class="movie-card__meta">
            {kind === "coming" ? (
              <>
                {wishStr && <span class="movie-card__wish">{wishStr}</span>}
                {movie.showState && (
                  <span class="movie-card__state">{movie.showState}</span>
                )}
                {movie.comingTitle && (
                  <span class="movie-card__coming">{movie.comingTitle}</span>
                )}
              </>
            ) : (
              <>
                {typeof movie.rating === "number" ? (
                  <span class="movie-card__rating">{movie.rating.toFixed(1)}</span>
                ) : (
                  <span class="movie-card__rating movie-card__rating--none">
                    {movie.ratingLabel || "暂无评分"}
                  </span>
                )}
                {movie.showInfo && (
                  <span class="movie-card__show">{movie.showInfo}</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
}

export default MovieCard;
