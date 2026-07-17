/**
 * src/renderer/github/GithubReadmeView.jsx
 *
 * GitHub 优秀项目收录 — README 渲染。
 * 渲染逻辑抽到公共组件 GithubMarkdown（marked + DOMPurify），
 * 与 release notes 复用。本组件只保留骨架屏 + 空态。
 */

import { GithubMarkdown } from "./GithubMarkdown.jsx";

export function GithubReadmeView({ markdown, loading }) {
  if (loading) {
    return <GithubReadmeSkeleton />;
  }
  if (!markdown || !markdown.trim()) {
    return (
      <div class="github-readme-empty">该项目没有可用的 README 内容。</div>
    );
  }
  return <GithubMarkdown markdown={markdown} />;
}

export default GithubReadmeView;

/**
 * README 加载态骨架屏 —— 结构镜像真实 README（标题 / 徽章 / 段落 / 代码块），
 * 用项目令牌做主题安全的 shimmer，避免深色主题下固定深色渐变不可见。
 * role=status + 视觉隐藏文案，保证屏幕阅读器能播报加载状态。
 */
function GithubReadmeSkeleton() {
  return (
    <div class="github-skel" role="status" aria-live="polite">
      <span class="github-skel__sr">README 加载中…</span>
      <div class="github-skel__title github-skel__block" />
      <div class="github-skel__badges">
        {[0, 1, 2, 3].map((i) => (
          <span class="github-skel__badge github-skel__block" key={i} />
        ))}
      </div>
      <div class="github-skel__line github-skel__block" />
      <div class="github-skel__line github-skel__block" />
      <div class="github-skel__line github-skel__block github-skel__short" />
      <div class="github-skel__code github-skel__block" />
      <div class="github-skel__line github-skel__block" />
      <div class="github-skel__line github-skel__block github-skel__mid" />
      <div class="github-skel__line github-skel__block" />
      <div class="github-skel__line github-skel__block github-skel__short" />
    </div>
  );
}
