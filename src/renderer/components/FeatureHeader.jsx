/**
 * src/renderer/components/FeatureHeader.jsx — P3 共享 header 壳
 *
 * ponytail: 5 个 feature header (Fund/Metal/News/Worldcup/WechatHot) 的真正同构部分:
 *   - 外层 .X-header 容器: padding + flex + border-bottom + background
 *   - 内部分两栏: brand (左, 1fr) + controls (右, auto)
 * 内部 title 元素 / 控件类型 / 字号 完全不动 — 各 feature 保留自己的语义.
 *
 * 用法 (WorldcupHeader 改造示例):
 *   <FeatureHeader className="worldcup-header" brand={...}>
 *     <SubtabList .../>
 *     <input .../>
 *   </FeatureHeader>
 *
 * CSS 设计 (P3 新增 .feature-header 类, 5 个 feature header 可选地复用到自己类):
 *   .feature-header { display: flex; justify-content: space-between;
 *                      padding: var(--space-4) var(--space-5);
 *                      border-bottom: 1px solid var(--border);
 *                      background: var(--bg-section); }
 *   .feature-header-brand { display: flex; align-items: center; gap: var(--space-3); }
 *   .feature-header-controls { display: flex; align-items: center; gap: var(--space-3); }
 *
 * P3 决策: 仅创建壳 + CSS, 5 个 feature header 不强制迁移 (避免大改).
 * 由各 feature 维护者按需选用, 后续 P4 可选统一.
 */
import "./FeatureHeader.css";

export function FeatureHeader({ className = "", brand, children }) {
  // ponytail: 默认 className = "feature-header". 调用方传自己的类会追加.
  // 保留双 class: 'feature-header X-header' — 让 feature 特有 CSS 仍生效.
  const cls = className
    ? `feature-header ${className}`
    : "feature-header";
  const brandCls = className
    ? `feature-header-brand ${className}-brand`
    : "feature-header-brand";
  const controlsCls = className
    ? `feature-header-controls ${className}-controls`
    : "feature-header-controls";
  return (
    <div class={cls}>
      <div class={brandCls}>{brand}</div>
      {children != null && <div class={controlsCls}>{children}</div>}
    </div>
  );
}

export default FeatureHeader;