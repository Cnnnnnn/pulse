/**
 * src/renderer/ithome/NewsShareCard.jsx
 *
 * 分享卡片 Preact 组件 — 1080×1080 视觉卡片,纯展示,无副作用。
 * Props: { article, summary }
 */
import { normalizeArticleSummary } from "./NewsArticleSummary.jsx";

const MAX_SUMMARY_CHARS = 300;
const MAX_KEYWORDS = 5;

function truncate(text, max) {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function formatShareCardTime(pubDate) {
  if (!pubDate) return "";
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(d);
  const [, mm, dd] = parts.split("-");
  const hm = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${mm}-${dd} ${hm}`;
}

export function NewsShareCard({ article, summary }) {
  if (!article) return null;
  const fields = normalizeArticleSummary(summary);
  const truncated = truncate(fields.abstract, MAX_SUMMARY_CHARS);
  const keywords = fields.keywords.slice(0, MAX_KEYWORDS);
  const timeLabel = formatShareCardTime(article.pubDate);

  return (
    <div class="share-card" data-testid="share-card">
      <div class="share-card-meta">
        <span class="share-card-source">IT之家</span>
        {article.category && (
          <span class="share-card-tag">{article.category}</span>
        )}
        {timeLabel && <span class="share-card-time">{timeLabel}</span>}
      </div>

      <h1 class="share-card-title">{article.title}</h1>

      {truncated && (
        <div class="share-card-summary">
          <p class="share-card-summary-text">{truncated}</p>
        </div>
      )}

      {keywords.length > 0 && (
        <div class="share-card-keywords">
          {keywords.map((kw) => (
            <span key={kw} class="share-card-keyword">#{kw}</span>
          ))}
        </div>
      )}

      {fields.domain && (
        <div class="share-card-field">
          <div class="share-card-field-label">所属领域</div>
          <div class="share-card-field-text">{fields.domain}</div>
        </div>
      )}

      {fields.impact && (
        <div class="share-card-field">
          <div class="share-card-field-label">影响方面</div>
          <div class="share-card-field-text">{fields.impact}</div>
        </div>
      )}

      <div class="share-card-watermark">◆ Pulse · IT之家新闻速读</div>
    </div>
  );
}

export default NewsShareCard;
