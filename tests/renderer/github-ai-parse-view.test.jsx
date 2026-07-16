// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import GithubAiParseView from '../../src/renderer/github/GithubAiParseView.jsx';

describe('GithubAiParseView 骨架屏', () => {
  it('loading=true 时渲染 AI 骨架屏而非转圈文案', () => {
    const { container } = render(
      <GithubAiParseView result={null} loading={true} error={null} />,
    );
    expect(container.querySelector('.github-ai-skel')).toBeTruthy();
    // a11y：屏幕阅读器可播报的加载状态文案
    expect(container.querySelector('.github-skel__sr')?.textContent).toBe('AI 解析中…');
    // 不应再出现旧的 spinner 加载态
    expect(container.querySelector('.github-ai-loading')).toBeNull();
    // 骨架屏态不应出现已解析内容
    expect(container.querySelector('.github-ai')).toBeNull();
  });

  it('loading=false 且 result 为空时渲染空态', () => {
    const { container } = render(
      <GithubAiParseView result={null} loading={false} error={null} />,
    );
    expect(container.querySelector('.github-ai-empty')).toBeTruthy();
    expect(container.querySelector('.github-ai-skel')).toBeNull();
  });
});
