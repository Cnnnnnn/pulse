/**
 * src/renderer/finance/FinanceRow.tsx
 *
 * 卡片：标题 / 摘要 / 来源 / 时间 / 分类色条 / 标签 / 收藏。
 * 布局从单列文字行（list row）改为卡片网格（CSS grid，由 finance.css 驱动）。
 */

import { formatFinanceTime } from "./financeStore.ts";
import { catColorVar } from "./finance-cats.ts";

export function FinanceRow({
  article,
  onOpen,
  onToggleFavorite,
}: {
  article: any;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) {
  const a = article;

  return (
    <article
      class="finance-card"
      data-cat={a.category || "other"}
      style={`--cat: var(${catColorVar(a.category)});`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e: any) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {/* 顶部：来源 chip + 时间 + 收藏按钮 */}
      <div class="finance-card-header">
        <span class="finance-card-source">{a.source}</span>
        <span class="finance-card-time">{formatFinanceTime(a.pubDate)}</span>
        <button
          type="button"
          class={`finance-card-fav-btn${a.isFavorited ? " is-active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          aria-label={a.isFavorited ? "取消收藏" : "收藏"}
          title={a.isFavorited ? "取消收藏" : "收藏"}
        >
          {a.isFavorited ? "★" : "☆"}
        </button>
      </div>

      {/* 标题 */}
      <h3 class="finance-card-title">{a.title}</h3>

      {/* 摘要 */}
      {a.summary && <p class="finance-card-summary">{a.summary}</p>}

      {/* 底部 meta */}
      <div class="finance-card-footer">
        {/* 分类 chip */}
        <span class="finance-card-cat-chip">{a.category}</span>
        {/* 标签 */}
        {Array.isArray(a.tags) && a.tags.length > 0 && (
          a.tags.slice(0, 3).map((t: string) => (
            <span class="finance-card-tag" key={t}>
              {t}
            </span>
          ))
        )}
        {a.readAt ? (
          <span style={{ color: "var(--gray-400)" }}>已读</span>
        ) : null}
      </div>
    </article>
  );
}

export default FinanceRow;
