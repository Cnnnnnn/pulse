/**
 * CardFreshness — 数据时间戳角标. 嵌在每张数据卡标题区右侧.
 *
 * ponytail: 2026-07-07 — 后端 stock-detail-fetcher.js 已在 perAngle[k].fetchedAt
 * 写入拉取时间戳, 这里只做格式化展示. 不引第三方日期库 (原生 Date 够用).
 * 陈旧阈值 30 天 — 季报披露后的窗口期, 超过一般意味着数据源/行业节奏断了.
 */
const STALE_MS = 30 * 24 * 60 * 60 * 1000;

function formatRelative(ts, now) {
  const diff = now - ts;
  if (diff < 60 * 1000) return "刚刚";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function CardFreshness({ fetchedAt }) {
  if (!fetchedAt) return null;
  const ts = typeof fetchedAt === "number" ? fetchedAt : Date.parse(fetchedAt);
  if (!Number.isFinite(ts)) return null;
  const stale = Date.now() - ts > STALE_MS;
  return (
    <span
      class={`card-freshness${stale ? " card-freshness-stale" : ""}`}
      title={new Date(ts).toLocaleString("zh-CN")}
    >
      数据更新于 {formatRelative(ts, Date.now())}
    </span>
  );
}

export default CardFreshness;