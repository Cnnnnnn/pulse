import { CardFreshness } from "./CardFreshness.jsx";
import { DataHealthPill } from "./DataHealthPill.jsx";

/**
 * ModuleCard — 诊断卡外壳 (9 张 stock diagnosis 卡统一抽).
 *
 * ponytail 2026-07-08 — 形态同构: 外壳 + 标题区 (emoji+文字 + 可选 freshness)
 *          + 主体/空态.
 * ponytail 2026-07-18 P0-1 T7 — 标题区右侧加 <DataHealthPill>, 把"数据新不新"
 *          变成主信号; CardFreshness 保留为辅助时间戳.
 * ponytail 2026-07-18 P0-1 T8 — DataHealthPill failed → retry 按钮回调 onRefresh:
 *          最初走 diagnosisStore.refreshAngle (= 重新 LLM 解读, 不重拉数据),
 *          数据 failed 时 retry LLM 通常返 no_data, pill 状态不变.
 * ponytail 2026-07-18 P0-1 polish #2 — onRefresh 改为走 reloadAngle (单条 angle
 *          数据重拉, 走 stocks:angle-reload). 数据成功 → perAngleData 替换,
 *          pill 自动 failed → ok. 这才是用户视角 retry 按钮应有的语义.
 *
 * 用法:
 *   <ModuleCard
 *     variant="capital"
 *     title="🌊 资金面"
 *     angle={perAngleData.capital_flow}
 *     onRefresh={() => reloadAngle("capital_flow")}
 *     body={<div>5日主力 ...</div>}
 *   />
 *
 * - variant: 必传, CSS modifier (`module-card--{variant}`)
 * - title:   必传 (emoji+名称)
 * - angle:   可选, perAngleData[k] 完整对象, 用来派生 DataHealthPill
 * - onRefresh: 可选, 失败时 pill 显示"重试"按钮
 * - fetchedAt: 可选, 辅助时间戳 (跟 DataHealthPill 互补)
 * - titleExtra: 标题右侧额外内容 (如 " · 元件")
 * - body / empty: 见原注释
 */
export function ModuleCard({
  variant,
  title,
  angle = null,
  onRefresh = null,
  fetchedAt = null,
  titleExtra = null,
  body = null,
  empty = null,
}) {
  const showBody = body != null && body !== false;
  return (
    <div class={`module-card module-card--${variant}`}>
      <div class="module-card-title">
        <span>{title}{titleExtra}</span>
        <span class="module-card-title-extras">
          {angle ? <DataHealthPill angle={angle} onRefresh={onRefresh} /> : null}
          {fetchedAt ? <CardFreshness fetchedAt={fetchedAt} /> : null}
        </span>
      </div>
      {showBody ? body : <div class="module-card-empty">{empty}</div>}
    </div>
  );
}

export default ModuleCard;