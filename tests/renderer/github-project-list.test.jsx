// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { GithubProjectRow, GithubProjectCard, GithubProjectList } from '../../src/renderer/github/GithubProjectList.jsx';
import { githubProjects, githubDensity } from '../../src/renderer/store/github-projects-store.js';

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

describe('GitHub 项目列表 · 全部已读', () => {
  beforeEach(() => {
    githubProjects.value = [];
  });

  function seedList(items) {
    githubProjects.value = items.map((x) => ({
      id: x.id,
      name: x.id,
      description: '',
      language: '',
      stars: 0,
      addedAt: Date.now(),
      aiParse: null,
      latestVersion: x.latestVersion || '',
      lastSeenVersion: x.lastSeenVersion || '',
      releases: x.releases || [],
      releaseFetchedAt: x.releaseFetchedAt || 0,
    }));
  }

  it('存在未读更新时显示「全部已读」按钮，点击调用 onMarkAllSeen', () => {
    seedList([
      { id: 'a/b', latestVersion: '2.0.0', lastSeenVersion: '1.0.0' },
      { id: 'c/d', latestVersion: '1.0.0', lastSeenVersion: '1.0.0' },
    ]);
    const onMarkAllSeen = vi.fn();
    const { container } = render(
      <GithubProjectList
        onView={vi.fn()}
        onParse={vi.fn()}
        onCheckUpdates={vi.fn()}
        onMarkAllSeen={onMarkAllSeen}
      />,
    );
    const btn = container.querySelector('.github-markall-btn');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain('全部已读');
    expect(btn.textContent).toContain('1'); // 未读计数胶囊
    fireEvent.click(btn);
    expect(onMarkAllSeen).toHaveBeenCalledTimes(1);
  });

  it('无未读更新时不显示「全部已读」按钮', () => {
    seedList([{ id: 'a/b', latestVersion: '1.0.0', lastSeenVersion: '1.0.0' }]);
    const { container } = render(
      <GithubProjectList
        onView={vi.fn()}
        onParse={vi.fn()}
        onCheckUpdates={vi.fn()}
        onMarkAllSeen={vi.fn()}
      />,
    );
    expect(container.querySelector('.github-markall-btn')).toBeNull();
  });
});

describe('GitHub 项目列表 · 排序（最近发布 / 最近检查）', () => {
  beforeEach(() => {
    githubProjects.value = [];
  });

  function seedForSort(items) {
    githubProjects.value = items.map((x) => ({
      id: x.id,
      name: x.id,
      description: '',
      language: '',
      stars: 0,
      addedAt: 1000, // 固定，排除 addedAt 干扰
      aiParse: null,
      pinned: !!x.pinned,
      latestVersion: x.latestVersion || '',
      latestVersionPublishedAt: x.latestVersionPublishedAt || 0,
      lastSeenVersion: x.lastSeenVersion || '',
      releases: x.releases || [],
      releaseFetchedAt: x.releaseFetchedAt || 0,
    }));
  }

  /** 从渲染的列表里提取项目 name 的顺序。 */
  function rowOrder(container) {
    return [...container.querySelectorAll('.github-row__name')]
      .map((el) => el.textContent.trim());
  }

  it('排序：最近发布 → 按 latestVersionPublishedAt 降序，无 release 的排最后', () => {
    seedForSort([
      { id: 'a/old', latestVersion: '1.0.0', latestVersionPublishedAt: 1000, lastSeenVersion: '1.0.0' },
      { id: 'b/new', latestVersion: '2.0.0', latestVersionPublishedAt: 9000, lastSeenVersion: '2.0.0' },
      { id: 'c/mid', latestVersion: '1.5.0', latestVersionPublishedAt: 5000, lastSeenVersion: '1.5.0' },
      { id: 'd/norel', latestVersion: '', latestVersionPublishedAt: 0 },
    ]);
    const { container } = render(<GithubProjectList />);
    fireEvent.change(container.querySelector('.github-select__el'), { target: { value: 'published' } });
    expect(rowOrder(container)).toEqual(['b/new', 'c/mid', 'a/old', 'd/norel']);
  });

  it('排序：最近检查 → 按 releaseFetchedAt 降序，从未检查的排最后', () => {
    seedForSort([
      { id: 'a/never', releaseFetchedAt: 0 },
      { id: 'b/recent', releaseFetchedAt: 9000 },
      { id: 'c/stale', releaseFetchedAt: 1000 },
    ]);
    const { container } = render(<GithubProjectList />);
    fireEvent.change(container.querySelector('.github-select__el'), { target: { value: 'checked' } });
    expect(rowOrder(container)).toEqual(['b/recent', 'c/stale', 'a/never']);
  });

  it('置顶项始终优先，与排序方式无关（最近发布）', () => {
    seedForSort([
      { id: 'a/pinned', latestVersion: '1.0.0', latestVersionPublishedAt: 1000, lastSeenVersion: '1.0.0', pinned: true },
      { id: 'b/new', latestVersion: '2.0.0', latestVersionPublishedAt: 9000, lastSeenVersion: '2.0.0' },
    ]);
    const { container } = render(<GithubProjectList />);
    fireEvent.change(container.querySelector('.github-select__el'), { target: { value: 'published' } });
    // pinned 优先，即便它的发布时间更早
    expect(rowOrder(container)).toEqual(['a/pinned', 'b/new']);
  });

  it('排序下拉含「最近发布」和「最近检查」选项', () => {
    githubProjects.value = [{
      id: 'a/a', name: 'a/a', description: '', language: '', stars: 0, addedAt: 1000,
    }];
    const { container } = render(<GithubProjectList />);
    const options = [...container.querySelectorAll('.github-select__el option')].map((o) => o.value);
    expect(options).toContain('published');
    expect(options).toContain('checked');
  });
});

describe('GitHub 项目列表 · license + homepage 展示', () => {
  it('卡片：有 license → 渲染 license chip', () => {
    const { container } = render(
      <GithubProjectCard project={makeProject({ license: 'MIT' })} />,
    );
    const chips = [...container.querySelectorAll('.github-chip')].map((c) => c.textContent);
    expect(chips).toContain('MIT');
  });

  it('卡片：无 license → 不渲染 license chip', () => {
    const { container } = render(
      <GithubProjectCard project={makeProject({ license: '' })} />,
    );
    const chips = [...container.querySelectorAll('.github-chip--license')];
    expect(chips.length).toBe(0);
  });

  it('行视图：有 license → 渲染 license chip', () => {
    const { container } = render(
      <GithubProjectRow project={makeProject({ license: 'Apache-2.0' })} />,
    );
    const chips = [...container.querySelectorAll('.github-chip')].map((c) => c.textContent);
    expect(chips).toContain('Apache-2.0');
  });

  it('卡片：有 homepage → 渲染域名链接（点击走 api.openUrl）', () => {
    const { container } = render(
      <GithubProjectCard project={makeProject({ homepage: 'https://example.com/path' })} />,
    );
    const link = container.querySelector('.github-chip--link');
    expect(link).toBeTruthy();
    expect(link.textContent).toContain('example.com');
  });

  it('卡片：homepage 等于 GitHub 仓库地址 → 不渲染（避免冗余）', () => {
    const { container } = render(
      <GithubProjectCard
        project={makeProject({
          url: 'https://github.com/facebook/react',
          homepage: 'https://github.com/facebook/react',
        })} />,
    );
    const link = container.querySelector('.github-chip--link');
    expect(link).toBeNull();
  });

  it('卡片：homepage 为空 → 不渲染链接', () => {
    const { container } = render(
      <GithubProjectCard project={makeProject({ homepage: '' })} />,
    );
    expect(container.querySelector('.github-chip--link')).toBeNull();
  });
});

describe('GitHub 项目列表 · 视图密度', () => {
  beforeEach(() => {
    githubProjects.value = [];
    githubDensity.value = 'comfortable';
  });

  function seedList(items) {
    githubProjects.value = items.map((x) => ({
      id: x.id,
      name: x.id,
      description: '',
      language: '',
      stars: 0,
      addedAt: Date.now(),
      aiParse: null,
      latestVersion: x.latestVersion || '',
      lastSeenVersion: x.lastSeenVersion || '',
      releases: x.releases || [],
      releaseFetchedAt: x.releaseFetchedAt || 0,
    }));
  }

  it('默认舒适：列表根节点带 github-list--comfortable 类', () => {
    seedList([{ id: 'a/b' }]);
    const { container } = render(
      <GithubProjectList
        onView={vi.fn()}
        onParse={vi.fn()}
        onCheckUpdates={vi.fn()}
        onMarkAllSeen={vi.fn()}
      />,
    );
    const root = container.querySelector('.github-list');
    expect(root.className).toContain('github-list--comfortable');
  });

  it('点击「紧凑」后根节点切换为 github-list--compact（密度反馈在列表页可见）', () => {
    seedList([{ id: 'a/b' }]);
    const { container } = render(
      <GithubProjectList
        onView={vi.fn()}
        onParse={vi.fn()}
        onCheckUpdates={vi.fn()}
        onMarkAllSeen={vi.fn()}
      />,
    );
    const densityBtns = container.querySelectorAll('.github-density__btn');
    expect(densityBtns.length).toBe(2);
    fireEvent.click(densityBtns[1]); // 第二个按钮 = 紧凑
    const root = container.querySelector('.github-list');
    expect(root.className).toContain('github-list--compact');
    expect(githubDensity.value).toBe('compact');
  });
});
