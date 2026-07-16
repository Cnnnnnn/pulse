// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import GithubReadmeView from '../../src/renderer/github/GithubReadmeView.jsx';

describe('GithubReadmeView 骨架屏', () => {
  it('loading=true 时渲染骨架屏而非纯文字', () => {
    const { container } = render(<GithubReadmeView markdown="" loading={true} />);
    expect(container.querySelector('.github-skel')).toBeTruthy();
    // a11y：屏幕阅读器可播报的加载状态文案
    expect(container.querySelector('.github-skel__sr')?.textContent).toBe('README 加载中…');
    // 骨架屏态不应出现已渲染的 README 正文容器
    expect(container.querySelector('.readme-content')).toBeNull();
  });

  it('loading=false 且无内容时渲染空状态', () => {
    const { container } = render(<GithubReadmeView markdown="" loading={false} />);
    expect(container.querySelector('.github-readme-empty')).toBeTruthy();
    expect(container.querySelector('.github-skel')).toBeNull();
  });
});
