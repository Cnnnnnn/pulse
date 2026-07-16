// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import { GithubProjectRow, GithubProjectCard } from '../../src/renderer/github/GithubProjectList.jsx';

function makeProject(overrides = {}) {
  return {
    id: 'facebook/react',
    name: 'facebook/react',
    description: '用于构建用户界面的 JavaScript 库。',
    language: '',
    stars: 228000,
    addedAt: Date.now(),
    aiParse: null,
    ...overrides,
  };
}

describe('GitHub 项目列表 · 语言示意圆点', () => {
  it('行视图：JavaScript 渲染橙色圆点（引用设计令牌，非裸 hex）', () => {
    const { container } = render(
      <GithubProjectRow project={makeProject({ language: 'JavaScript' })} />,
    );
    const dot = container.querySelector('.github-lang-dot');
    expect(dot).toBeTruthy();
    expect(dot.getAttribute('style')).toContain('var(--accent-orange)');
    expect(dot.getAttribute('aria-hidden')).toBe('true');
  });

  it('行视图：未收录语言回退中性灰令牌', () => {
    const { container } = render(
      <GithubProjectRow project={makeProject({ language: 'COBOL' })} />,
    );
    const dot = container.querySelector('.github-lang-dot');
    expect(dot).toBeTruthy();
    expect(dot.getAttribute('style')).toContain('var(--accent-gray)');
  });

  it('卡片视图：TypeScript 渲染蓝色圆点', () => {
    const { container } = render(
      <GithubProjectCard project={makeProject({ language: 'TypeScript' })} />,
    );
    const dot = container.querySelector('.github-lang-dot');
    expect(dot).toBeTruthy();
    expect(dot.getAttribute('style')).toContain('var(--accent-blue)');
  });

  it('语言为空时不渲染语言 chip 与圆点', () => {
    const { container } = render(
      <GithubProjectCard project={makeProject({ language: '' })} />,
    );
    expect(container.querySelector('.github-lang-dot')).toBeNull();
  });
});
