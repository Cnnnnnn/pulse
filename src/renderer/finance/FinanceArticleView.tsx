/**
 * src/renderer/finance/FinanceArticleView.tsx
 *
 * 详情 + 相关推荐（同 category 或共享 tags 前 5 条）。
 * UI 重设计（2026-07-29）：标题区 / 配图 / 分段正文 / 来源卡片 / 相关推荐卡片网格。
 * 复用列表卡片（FinanceRow）与项目设计令牌（--cat-* / data-cat / 圆角 / 焦点环）。
 * MVP 无财联社详情接口 → body 为空时直接展示 summary，不做远程拉取。
 *
 * 优化（2026-07-30）：
 * - P0-1 相关推荐优先从内存 financeList 派生（0 IPC），仅列表为空时回退 fetch；
 * - P0-2 收藏/已读统一走 store 动作 toggleFinanceFavorite/markFinanceRead（单一真相源，列表↔详情一致）；
 * - P1-1 正文分段 useMemo 缓存；P1-3 切相关推荐保留旧内容不白屏；
 * - P1-4 相关卡片收藏走 store 动作；P1-5 引入 FinArticle 类型；
 * - P2-3 配图 onError 兜底；P2-4 sc-sub 仅当 sourceKey 存在才显示；P2-5 加载失败展示 r.reason。
 */

import { useEffect, useMemo, useState } from "preact/hooks";
import { api } from "../api.ts";
import {
  financeSelectedId,
  financeList,
  formatFinanceTime,
  toggleFinanceFavorite,
  markFinanceRead,
} from "./financeStore.ts";
import type { FinArticle } from "../../shared/finance-types.ts";
import { segmentBody, deriveRelated } from "./finance-text.ts";
import { catColorVar } from "./finance-cats.ts";
import { FinanceRow } from "./FinanceRow.tsx";
import { FinanceAiPanel } from "./FinanceAiPanel.tsx";

export function FinanceArticleView({ id }: { id: string }) {
  const [article, setArticle] = useState<FinArticle | null>(null);
  const [related, setRelated] = useState<FinArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fav, setFav] = useState(false);
  const [read, setRead] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // P1-3：保留上一篇文章内容（不清空 article），仅置 loading，避免切「相关推荐」时白屏闪烁
    setLoading(true);
    setError(null);
    setRelated([]);
    api
      .financeGetArticle({ id })
      .then((r: any) => {
        if (cancelled) return;
        if (!r || !r.ok || !r.article) {
          // P2-5：优先展示服务端 reason
          setError((r && r.reason) || "文章不存在");
          setLoading(false);
          return;
        }
        const art = r.article as FinArticle;
        setArticle(art);
        setFav(!!art.isFavorited);
        setRead(!!art.readAt);
        // P0-2：标记已读统一走 store 动作（同步更新 financeList + 持久化），修复相关跳转列表不显已读
        void markFinanceRead(art.id);
        // 财经 AI 解读改为「点击触发」：进入详情不再自动发起，由 FinanceAiPanel 的「AI 解读」按钮驱动

        // P0-1：相关推荐优先从内存 financeList 派生，避免为算 5 条而全量拉取分类列表
        const pool = (financeList.peek() as FinArticle[]) || [];
        if (pool.length > 0) {
          setRelated(deriveRelated(art, pool));
          setLoading(false);
        } else {
          // 回退：列表为空 / 深链直达时，由主进程按同标签优先 + 同分类补全给出相关推荐
          api
            .financeGetRelated({ id: art.id, limit: 5 })
            .then((list: any) => {
              if (cancelled) return;
              const arr: FinArticle[] = Array.isArray(list) ? list : [];
              setRelated(arr);
            })
            .catch(() => {
              /* 相关推荐非关键 */
            })
            .finally(() => {
              if (!cancelled) setLoading(false);
            });
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError((err && err.message) || "加载失败");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function back() {
    financeSelectedId.value = null;
  }

  // P0-2：乐观更新本地态 + 统一走 store 动作（store 动作会同步更新 financeList，列表↔详情一致）
  function toggleFav() {
    if (!article) return;
    const next = !fav;
    setFav(next);
    toggleFinanceFavorite(article.id).catch(() => setFav(!next));
  }

  // P1-1：正文分段缓存，避免每次重渲染重跑正则
  const bodyParagraphs = useMemo(
    () => segmentBody(article?.body, article?.summary),
    [article?.body, article?.summary],
  );

  if (loading && !article) {
    return <div class="finance-article finance-article-loading">加载中…</div>;
  }

  if (error || !article) {
    return (
      <div class="finance-article">
        <button type="button" class="finance-back-btn" onClick={back}>
          ← 返回
        </button>
        <div class="finance-error" role="alert">
          {error || "文章不存在"}
        </div>
      </div>
    );
  }

  const tags: string[] = Array.isArray(article.tags) ? article.tags : [];

  return (
    <div class="finance-article finance-article-detail">
      <div class="detail-toolbar">
        <button
          type="button"
          class="detail-back"
          onClick={back}
          aria-label="返回列表"
        >
          ‹ 返回
        </button>
        <span class="spacer" />
        <button
          type="button"
          class={`detail-icon-btn${fav ? " is-fav" : ""}`}
          aria-pressed={fav ? "true" : "false"}
          aria-label={fav ? "取消收藏" : "收藏"}
          onClick={toggleFav}
        >
          <span class="star">{fav ? "★" : "☆"}</span>
          <span class="label">{fav ? "已收藏" : "收藏"}</span>
        </button>
        {article.url && (
          <a
            class="detail-icon-btn"
            href={article.url}
            target="_blank"
            rel="noreferrer"
            aria-label="查看原文"
          >
            <span>↗</span>
            <span class="label">查看原文</span>
          </a>
        )}
      </div>

      <div class="detail-col">
        <span
          class="detail-cat"
          data-cat={article.category}
          style={`--cat: var(${catColorVar(article.category)});`}
        >
          {article.category}
        </span>
        <h1 class="detail-title">{article.title}</h1>

        <div class="detail-meta">
          <span class="detail-source">{article.source}</span>
          <span class="dot">·</span>
          <span class="num">{formatFinanceTime(article.pubDate)}</span>
          {read && (
            <>
              <span class="dot">·</span>
              <span>已读</span>
            </>
          )}
          {tags.length > 0 && (
            <span class="detail-tags">
              {tags.slice(0, 4).map((t: string) => (
                <span class="detail-tag" key={t}>
                  {t}
                </span>
              ))}
            </span>
          )}
        </div>

        {/* 配图：仅当数据含 image 时渲染（当前 RSS 无图，自动降级为无图）；P2-3 坏链 onError 隐藏 */}
        {article.image && (
          <div class="detail-hero">
            <figure>
              <img
                src={article.image}
                alt={article.title}
                loading="lazy"
                onError={(e: any) => {
                  const fig = e.currentTarget.closest("figure");
                  if (fig) fig.style.display = "none";
                }}
              />
              {article.imageCaption && (
                <figcaption>{article.imageCaption}</figcaption>
              )}
            </figure>
          </div>
        )}

        <div class="detail-body">
          {bodyParagraphs.length === 0 ? (
            <p class="lead">{article.summary || "暂无正文，可前往原文查看详情。"}</p>
          ) : (
            <>
              <p class="lead">{bodyParagraphs[0]}</p>
              {bodyParagraphs.slice(1).map((p: string, i: number) => (
                <p key={i}>{p}</p>
              ))}
            </>
          )}
        </div>

        <div class="detail-sourcecard">
          <div class="sc-ico" aria-hidden="true">
            {article.source ? article.source.slice(0, 1) : "源"}
          </div>
          <div class="sc-meta">
            <div class="sc-name">{article.source}</div>
            {/* P2-4：仅当存在 sourceKey 才显示「原文发布于 …」，避免已知来源却写「未知来源」 */}
            {article.sourceKey && (
              <div class="sc-sub">原文发布于 {article.sourceKey}</div>
            )}
          </div>
          {article.url && (
            <a class="sc-go" href={article.url} target="_blank" rel="noreferrer">
              阅读原文 ↗
            </a>
          )}
        </div>

        <FinanceAiPanel article={article} />

        {related.length > 0 && (
          <section class="detail-related">
            <h2>相关推荐</h2>
            <div class="related-grid">
              {related.map((x: FinArticle) => (
                <FinanceRow
                  key={x.id}
                  article={x}
                  onOpen={() => {
                    financeSelectedId.value = x.id;
                  }}
                  onToggleFavorite={() => {
                    // P1-4：统一走 store 动作，保持与列表一致
                    void toggleFinanceFavorite(x.id);
                  }}
                />
              ))}
            </div>
          </section>
        )}

        <p class="finance-disclaimer">内容仅供参考，不构成投资建议</p>
      </div>
    </div>
  );
}

export default FinanceArticleView;
