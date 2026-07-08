import { CardFreshness } from "./CardFreshness.jsx";

/**
 * ModuleCard — 诊断卡外壳 (9 张 stock diagnosis 卡统一抽).
 *
 * ponytail: 2026-07-08 — 形态同构: 外壳 + 标题区 (emoji+文字 + 可选 freshness)
 *          + 主体/空态. 之前每张卡片自己重复写一遍
 *          `<div class="module-card module-card--xxx"><div class="module-card-title">…</div>...`,
 *          9 张共 ~110 行重复. 这里抽成壳.
 *
 *          body / empty 形态由调用方决定 (props.children / props.body /
 *          props.empty 之一渲染). 不强制 <div class="module-card-body">
 *          包裹, 避免破坏某些卡片已有的 <ul> / <sub> 等特殊结构.
 *
 * 用法:
 *   <ModuleCard
 *     variant="capital"
 *     title="🌊 资金面"
 *     empty="数据不足"
 *     body={<div>5日主力 ...</div>}
 *   />
 *
 * - variant: 必传, CSS modifier (`module-card--{variant}`)
 * - title:   必传 (emoji+名称)
 * - fetchedAt: 可选时间戳
 * - titleExtra: 标题右侧额外内容 (如 " · 元件")
 * - body:    有数据时渲染 (任意 JSX)
 * - empty:   没数据时渲染 (字符串或 JSX)
 * - 行为: body 非空时优先 body, 否则 empty (空态)
 */
export function ModuleCard({ variant, title, fetchedAt, titleExtra, body = null, empty = null }) {
  const showBody = body != null && body !== false;
  return (
    <div class={`module-card module-card--${variant}`}>
      <div class="module-card-title">
        <span>{title}{titleExtra}</span>
        {fetchedAt ? <CardFreshness fetchedAt={fetchedAt} /> : null}
      </div>
      {showBody ? body : <div class="module-card-empty">{empty}</div>}
    </div>
  );
}

export default ModuleCard;
