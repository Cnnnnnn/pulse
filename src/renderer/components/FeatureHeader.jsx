/**
 * src/renderer/components/FeatureHeader.jsx — 共享 header 壳 (P3 创建, P4 迁移 Worldcup + News)
 *
 * ponytail: 提供一个语义化 shell, 强制 brand + controls 两栏结构.
 * 默认无任何样式 (壳本身透明), 视觉由调用方的 className + styles.css 中的 .X-header 控制.
 * 这避免了"壳 CSS 与 feature 特有 CSS 抢优先级"的问题.
 *
 * 用法 (WorldcupHeader 改造示例):
 *   <FeatureHeader className="worldcup-header" brand={<><IconFootball/>世界杯 2026</>}>
 *     <SubtabList .../>
 *     <input .../>
 *   </FeatureHeader>
 *
 * 渲染结果: <div class="worldcup-header feature-header">
 *            <div class="worldcup-header-brand feature-header-brand">{brand}</div>
 *            <div class="worldcup-header-controls feature-header-controls">{children}</div>
 *          </div>
 *
 * P4 决策: 迁移 WorldcupHeader + NewsHeader, FundHeader/MetalHeader/WechatHotHeader 因结构差异
 * (3 栏 / 2 段 / 倒计时) 暂不迁.
 */
import "./FeatureHeader.css";

export function FeatureHeader({ className = "", brand, children }) {
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