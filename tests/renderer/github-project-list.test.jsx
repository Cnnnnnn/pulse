// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
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

describe('GitHub 项目列表 · 更新状态徽标', () => {
  it('行视图：hasUpdate 渲染蓝色脉冲「新版本」徽标', () => {
    const { container } = render(
      <GithubProjectRow
        project={makeProject({
          latestVersion: '2.0.0',
          lastSeenVersion: '1.0.0',
        })}
      />,
    );
    const badge = container.querySelector('.github-chip--update');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('新版本 v2.0.0');
    expect(container.querySelector('.github-chip--update-dot')).toBeTruthy();
  });

  it('行视图：hasUpdate 徽标点击调用 onView(id, "update")', () => {
    const onView = vi.fn();
    const { container } = render(
      <GithubProjectRow
        project={makeProject({
          latestVersion: '2.0.0',
          lastSeenVersion: '1.0.0',
        })}
        onView={onView}
      />,
    );
    fireEvent.click(container.querySelector('.github-chip--update'));
    expect(onView).toHaveBeenCalledWith('facebook/react', 'update');
  });

  it('行视图：无 latestVersion 时不渲染任何更新徽标', () => {
    const { container } = render(<GithubProjectRow project={makeProject()} />);
    expect(container.querySelector('.github-chip--update')).toBeNull();
    expect(container.querySelector('.github-chip--version')).toBeNull();
  });

  it('行视图：已最新（latestVersion === lastSeenVersion）渲染静态版本 chip，无更新徽标', () => {
    const { container } = render(
      <GithubProjectRow
        project={makeProject({
          latestVersion: '1.5.0',
          lastSeenVersion: '1.5.0',
        })}
      />,
    );
    expect(container.querySelector('.github-chip--update')).toBeNull();
    const ver = container.querySelector('.github-chip--version');
    expect(ver).toBeTruthy();
    expect(ver.textContent).toContain('v1.5.0');
  });

  it('卡片视图：hasUpdate 同样渲染更新徽标', () => {
    const { container } = render(
      <GithubProjectCard
        project={makeProject({
          latestVersion: '3.1.0',
          lastSeenVersion: '3.0.0',
        })}
      />,
    );
    const badge = container.querySelector('.github-chip--update');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('新版本 v3.1.0');
  });
});
