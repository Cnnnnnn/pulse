/**
 * src/renderer/components/Skeleton.jsx
 *
 * 检查中骨架屏 —— 跟旧 styles.css 里的 .skeleton-* 类对齐
 */

export function Skeleton() {
  return (
    <div class="skeleton-container">
      <div class="skeleton-section">
        <div class="skeleton-line skeleton-title"></div>
        {[0, 1, 2].map((i) => (
          <div class="skeleton-row" key={i}>
            <div class="skeleton-avatar"></div>
            <div class="skeleton-text">
              <div class="skeleton-line"></div>
              <div class="skeleton-line short"></div>
            </div>
            <div class="skeleton-badge"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
