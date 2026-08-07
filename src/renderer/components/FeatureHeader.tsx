/**
 * src/renderer/components/FeatureHeader.tsx — 共享 header 壳 (P3 创建, P4 迁移 News)
 *
 * ponytail: 提供一个语义化 shell, 强制 brand + controls 两栏结构.
 * 默认无任何样式 (壳本身透明), 视觉由调用方的 className + styles.css 中的 .X-header 控制.
 * 这避免了"壳 CSS 与 feature 特有 CSS 抢优先级"的问题.
 *
 * 用法 (NewsHeader 改造示例):
 *   <FeatureHeader className="news-header" brand={<><IconNews/>新闻</>}>
 *     <SubtabList .../>
 *   </FeatureHeader>
 *
 * 渲染结果: <div class="news-header feature-header">
 *            <div class="news-header-brand feature-header-brand">{brand}</div>
 *            <div class="news-header-controls feature-header-controls">{children}</div>
 *          </div>
 *
 * P4 决策: NewsHeader 迁入; WorldcupHeader 已下线 (WC 模块整体下线 v2.80).
 * FundHeader/MetalHeader/WechatHotHeader 因结构差异 (3 栏 / 2 段 / 倒计时) 暂不迁.
 */
import type { ComponentChildren } from "preact";
import "./FeatureHeader.css";

export function FeatureHeader({
  className = "",
  brand,
  children,
}: {
  className?: string;
  brand?: ComponentChildren;
  children?: ComponentChildren;
}) {
  // ponytail: 默认 className = "feature-header". 调用方传自己的类会追加.
  // 双 class 'feature-header X-header' 让 feature 特有 CSS 与壳 CSS 协同
  // (feature-header 后载入, 但 feature 特有样式用更高特异性覆写, 见 CSS 注释).
  const cls = className
    ? `feature-header ${className}`
    : "feature-header";
  const brandCls = className
    ? `${className}-brand feature-header-brand`
    : "feature-header-brand";
  const controlsCls = className
    ? `${className}-controls feature-header-controls`
    : "feature-header-controls";
  return (
    <div class={cls}>
      <div class={brandCls}>{brand}</div>
      {children != null && <div class={controlsCls}>{children}</div>}
    </div>
  );
}

export default FeatureHeader;