/**
 * 演出票监控模块共享常量（主进程 + 渲染进程）。
 * 平台：
 *   - 票牛 piaoniu.com（内地，人民币）
 *   - 摩天轮国内 motianlun.cn（tking showapi，人民币）
 *   - 摩天轮国际 moretickets.com（港澳/海外，HKD 等）
 *
 * 缓存 TTL 取 2 分钟：票价是逐秒变化的倒卖数据，比片单类（30 分钟）敏感得多；
 * 但轮询频率由渲染端冷却时间限制（30s），避免打爆源站。
 */

export const CONCERTS_CACHE_TTL_MS = 2 * 60 * 1000;

/** 渲染端两次手动刷新之间的最小间隔 */
export const CONCERTS_REFRESH_COOLDOWN_MS = 30 * 1000;

export type ConcertPlatform = "piaoniu" | "motianlun" | "moretickets";

export const CONCERT_PLATFORM_LABEL: Record<string, string> = {
  piaoniu: "票牛",
  motianlun: "摩天轮",
  moretickets: "摩天轮国际",
};

/** 各平台官网首页（演出页快捷跳转用） */
export const CONCERT_PLATFORM_SITE: Record<ConcertPlatform, string> = {
  piaoniu: "https://www.piaoniu.com",
  motianlun: "https://www.motianlun.cn",
  moretickets: "https://www.moretickets.com",
};

/** 场次售票状态 → UI 文案（源站枚举不同，归一到这里） */
export const CONCERT_SESSION_STATUS_LABEL: Record<string, string> = {
  ONSALE: "在售",
  SOLDOUT: "售罄",
  UPCOMING: "未开售",
  ENDED: "已结束",
};

const PIAONIU_URL_RE = /^https?:\/\/(?:www\.|m\.|mbeta\.)?piaoniu\.com\/activity\/(\d+)/i;
const MORETICKETS_URL_RE =
  /^https?:\/\/(?:www\.)?moretickets\.com\/[^?#]*[?&]tourId=([^&]+)&showId=([^&#]+)/i;
const MORETICKETS_SWAPPED_RE =
  /^https?:\/\/(?:www\.)?moretickets\.com\/[^?#]*[?&]showId=([^&]+)&.*?[?&]tourId=([^&#]+)/i;
const MOTIANLUN_HOST_RE = /^https?:\/\/(?:www\.|m\.)?motianlun\.cn\//i;

export type ConcertWatchParsed =
  | { platform: "piaoniu"; activityId: string }
  | { platform: "motianlun"; showId: string; sessionId?: string; ticketCount?: number }
  | { platform: "moretickets"; tourId: string; showId: string };

/**
 * 解析用户粘贴的详情页 / 选座页 URL。
 * 支持：
 *   https://www.piaoniu.com/activity/778118?...
 *   https://m.motianlun.cn/pages/show-detail/...?showId=x
 *   https://m.motianlun.cn/...?...showId=x&sessionId=y&ticketCount=2
 *   https://www.moretickets.com/tour-detail?tourId=x&showId=y
 */
export function parseConcertWatchUrl(url: unknown): ConcertWatchParsed | null {
  if (!url || typeof url !== "string") return null;
  const raw = url.trim();
  const pn = raw.match(PIAONIU_URL_RE);
  if (pn) return { platform: "piaoniu", activityId: pn[1] };

  if (MOTIANLUN_HOST_RE.test(raw)) {
    const showIdRaw =
      raw.match(/[?&]showId=([^&#]+)/i)?.[1] ||
      raw.match(/\/show\/([a-zA-Z0-9]+)(?:[/?#]|$)/i)?.[1];
    if (showIdRaw) {
      const sessionIdRaw = raw.match(/[?&]sessionId=([^&#]+)/i)?.[1];
      const tcRaw = raw.match(/[?&]ticketCount=(\d+)/i)?.[1];
      const ticketCount = tcRaw ? Number(tcRaw) : undefined;
      return {
        platform: "motianlun",
        showId: decodeURIComponent(showIdRaw),
        sessionId: sessionIdRaw ? decodeURIComponent(sessionIdRaw) : undefined,
        ticketCount:
          ticketCount != null && ticketCount >= 1 && ticketCount <= 10 ? ticketCount : undefined,
      };
    }
    return null;
  }

  let mt = raw.match(MORETICKETS_URL_RE);
  if (mt) return { platform: "moretickets", tourId: mt[1], showId: mt[2] };
  mt = raw.match(MORETICKETS_SWAPPED_RE);
  if (mt) return { platform: "moretickets", showId: mt[1], tourId: mt[2] };
  return null;
}

/** watch 唯一 key */
export function concertWatchKey(parsed: ConcertWatchParsed): string {
  switch (parsed.platform) {
    case "piaoniu":
      return `piaoniu:${parsed.activityId}`;
    case "motianlun":
      // 演出级监听（详情页 / 选座页同一 show 去重）；场次在刷新时展开
      return `motianlun:${parsed.showId}`;
    case "moretickets":
      return `moretickets:${parsed.tourId}/${parsed.showId}`;
    default: {
      const _exhaustive: never = parsed;
      return _exhaustive;
    }
  }
}

/** 详情页 URL 反推（快照回跳用） */
export function concertDetailUrl(watch: {
  platform: string;
  activityId?: string;
  tourId?: string;
  showId?: string;
  sessionId?: string;
}): string {
  if (watch.platform === "piaoniu" && watch.activityId) {
    return `https://www.piaoniu.com/activity/${watch.activityId}`;
  }
  if (watch.platform === "motianlun" && watch.showId) {
    return `https://m.motianlun.cn/show/${watch.showId}`;
  }
  if (watch.tourId && watch.showId) {
    return `https://www.moretickets.com/tour-detail?tourId=${watch.tourId}&showId=${watch.showId}`;
  }
  return "";
}
