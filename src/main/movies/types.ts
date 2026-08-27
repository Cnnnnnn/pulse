"use strict";

/**
 * src/main/movies/types.ts
 *
 * 电影模块共享数据模型 (主进程真相).
 * Phase 7: export + module.exports 双导出 (test 经 requireMain 拿内部导出,
 * 业务 caller 经 ESM import 拿 named export). 新增 runtime export 须同步到底部
 * module.exports = {...}.
 */

export const SOURCE = {
  MAOYAN_NETSTART: "maoyan-netstart",
  MAOYAN_DIRECT: "maoyan-direct",
  TMDB: "tmdb",
  SAMPLE: "sample",
} as const;

/** 单部电影（列表字段覆盖热映/即将上映；detail 字段为详情拉取后补充） */
export interface MovieItem {
  id: string;                 // 字符串化 movieId（猫眼）或 tmdbId
  title: string;              // nm / title
  enTitle?: string;           // enm / original_title
  rating?: number;            // sc（0-10）或 TMDB vote_average
  ratingLabel?: string;       // 猫眼 scoreLabel（sc=0 时 "暂无评分"）
  poster?: string;            // 完整 https URL（已补协议）
  wish?: number;              // 想看数（仅即将上映）
  showInfo?: string;          // 热映：影院/场次文案
  releaseDate?: string;       // rt
  comingTitle?: string;       // 即将上映展示文案（comingTitle）
  showState?: string;         // 预售/点映/待映（showStateButton.content）
  // —— detail 补充字段（P0 来自猫眼 detailmovie）——
  genres?: string[];          // cat 拆分
  durationMin?: number;       // dur
  summary?: string;           // dra
  director?: string;          // dir
  star?: string;              // star（主演文本）
  trailerUrl?: string;        // videourl
  backdrop?: string;          // photos[0] 或 img
  source: string;
  isSample?: boolean;
}

export interface MoviesPayload {
  ok?: true;
  nowPlaying: MovieItem[];
  coming: MovieItem[];
  fetchedAt: number;
  source: string;
  cityId?: number;
  /** 网络失败时返回上次成功片单 */
  degraded?: boolean;
  /** 即将上映回退说明（如澳门空档用香港待映） */
  comingNote?: string;
}

/** 示例 / TMDB 片不要打猫眼详情（ID 空间不同） */
export function shouldFetchMaoyanDetail(item: MovieItem | null | undefined): boolean {
  if (!item) return true;
  if (item.isSample) return false;
  if (item.source === SOURCE.SAMPLE || item.source === SOURCE.TMDB) return false;
  return true;
}

/** 补 https: 协议到猫眼 //cdn 海报 URL；空返回 undefined */
export function normalizePoster(img?: string): string | undefined {
  if (!img || typeof img !== "string") return undefined;
  return img.startsWith("//") ? `https:${img}` : img;
}

/** 猫眼 cat "剧情,犯罪" → ["剧情","犯罪"] */
export function splitGenres(cat?: string): string[] | undefined {
  if (!cat || typeof cat !== "string") return undefined;
  const parts = cat.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

module.exports = { SOURCE, normalizePoster, splitGenres, shouldFetchMaoyanDetail };
