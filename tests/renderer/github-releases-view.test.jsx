// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { GithubReleasesView } from '../../src/renderer/github/GithubReleasesView.jsx';

const { fetchGithubReleaseMock, markGithubSeenMock } = vi.hoisted(() => ({
  fetchGithubReleaseMock: vi.fn(() => Promise.resolve({ ok: true })),
  markGithubSeenMock: vi.fn(),
}));

vi.mock('../../src/renderer/store/github-projects-store.js', async () => {
  const actual = await vi.importActual(
    '../../src/renderer/store/github-projects-store.js',
  );
  return {
    ...actual,
    fetchGithubRelease: fetchGithubReleaseMock,
    markGithubSeen: markGithubSeenMock,
  };
});

import { githubDensity } from '../../src/renderer/store/github-projects-store.js';

function makeProject(overrides = {}) {
  return {
    id: 'facebook/react',
    name: 'facebook/react',
    latestVersion: '',
    latestVersionPublishedAt: 0,
    lastSeenVersion: '',
    releases: [],
    releaseFetchedAt: 0,
    ...overrides,
  };
}

const DAY = 86400000;

beforeEach(() => {
  fetchGithubReleaseMock.mockReset();
  markGithubSeenMock.mockReset();
  fetchGithubReleaseMock.mockReturnValue(Promise.resolve({ ok: true }));
  githubDensity.value = "comfortable";
});

describe('GitHub 更新 tab · GithubReleasesView', () => {
  it('已有 release 数据且 hasUpdate：渲染时间线 + 标记已读按钮，不触发自动拉取', () => {
    const onMarkSeen = vi.fn();
    const now = Date.now();
    const { container } = render(
      <GithubReleasesView
        project={makeProject({
          releaseFetchedAt: now,
          latestVersion: '2.0.0',
          latestVersionPublishedAt: now - 3 * DAY,
          lastSeenVersion: '1.0.0',
          releases: [
            {
              version: '2.0.0',
              tagName: 'v2.0.0',
              publishedAt: now - 3 * DAY,
              notesUrl: 'https://github.com/x/y/releases/tag/v2.0.0',
              body: '## Changes\n- fixed a bug',
            },
            {
              version: '1.0.0',
              tagName: 'v1.0.0',
              publishedAt: now - 30 * DAY,
              notesUrl: '',
              body: '',
            },
          ],
        })}
        onMarkSeen={onMarkSeen}
      />,
    );

    // 已带数据，不应再自动请求
    expect(fetchGithubReleaseMock).not.toHaveBeenCalled();
    // 两条 release 节点
    expect(container.querySelectorAll('.github-rel-item').length).toBe(2);
    // 最新节点高亮
    expect(container.querySelector('.github-rel-item.is-latest')).toBeTruthy();
    // 最新版标题
    expect(container.querySelector('.github-rel-ver').textContent).toContain(
      'v2.0.0',
    );
    // 有 release 链接
    expect(container.querySelector('.github-rel-link')).toBeTruthy();
    // 标记已读按钮存在
    const markBtn = container.querySelector('.github-rel-markseen');
    expect(markBtn).toBeTruthy();
    fireEvent.click(markBtn);
    expect(markGithubSeenMock).toHaveBeenCalledWith('facebook/react');
    expect(onMarkSeen).toHaveBeenCalled();
  });

  it('已最新（latestVersion === lastSeenVersion）：不显示「标记已读」', () => {
    const now = Date.now();
    const { container } = render(
      <GithubReleasesView
        project={makeProject({
          releaseFetchedAt: now,
          latestVersion: '1.5.0',
          latestVersionPublishedAt: now - 10 * DAY,
          lastSeenVersion: '1.5.0',
          releases: [
            {
              version: '1.5.0',
              tagName: 'v1.5.0',
              publishedAt: now - 10 * DAY,
              notesUrl: '',
              body: 'minor',
            },
          ],
        })}
      />,
    );
    expect(container.querySelector('.github-rel-markseen')).toBeNull();
    expect(container.querySelectorAll('.github-rel-item').length).toBe(1);
  });

  it('releaseFetchedAt 为 0：自动拉取期间显示骨架屏', () => {
    fetchGithubReleaseMock.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <GithubReleasesView project={makeProject({ releaseFetchedAt: 0 })} />,
    );
    expect(container.querySelector('.github-rel-skel')).toBeTruthy();
    expect(fetchGithubReleaseMock).toHaveBeenCalledWith('facebook/react');
  });

  it('自动拉取失败：显示错误态 + 重试再次调用', async () => {
    fetchGithubReleaseMock.mockReturnValue(
      Promise.resolve({ ok: false, reason: 'rate_limited' }),
    );
    const { container } = render(
      <GithubReleasesView project={makeProject({ releaseFetchedAt: 0 })} />,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(container.textContent).toContain('频率受限');
    fireEvent.click(container.querySelector('.github-rel-reparse'));
    expect(fetchGithubReleaseMock).toHaveBeenCalledTimes(2);
  });

  it('无 release：显示空态', () => {
    const { container } = render(
      <GithubReleasesView
        project={makeProject({
          releaseFetchedAt: Date.now(),
          latestVersion: '',
          releases: [],
        })}
      />,
    );
    expect(container.textContent).toContain('还没有发布 Release');
  });

  it('release body 含 markdown → 经 GithubMarkdown 渲染（容器带 readme-content class）', () => {
    const { container } = render(
      <GithubReleasesView
        project={makeProject({
          releaseFetchedAt: Date.now(),
          latestVersion: '1.0.0',
          latestVersionPublishedAt: Date.now(),
          lastSeenVersion: '1.0.0',
          releases: [
            {
              version: '1.0.0',
              tagName: 'v1.0.0',
              publishedAt: Date.now(),
              notesUrl: '',
              body: '## What changed\n\n- fix a\n- add b',
            },
          ],
        })}
      />,
    );
    // body 走 GithubMarkdown，容器是 readme-content（不再是纯 <p>）
    const md = container.querySelector('.github-rel-notes.readme-content');
    expect(md).toBeTruthy();
    // 文本内容仍在（不管 markdown 标签如何转换）
    expect(container.textContent).toContain('What changed');
    expect(container.textContent).toContain('fix a');
  });
});

describe('GitHub 更新 tab · 月份分组 + 视图密度', () => {
  it('跨月份 release 渲染月份分组标题，节点总数不变', () => {
    const { container } = render(
      <GithubReleasesView
        project={makeProject({
          releaseFetchedAt: Date.now(),
          latestVersion: '3.0.0',
          latestVersionPublishedAt: Date.parse('2026-06-15T00:00:00Z'),
          lastSeenVersion: '2.0.0',
          releases: [
            {
              version: '3.0.0',
              tagName: 'v3.0.0',
              publishedAt: Date.parse('2026-06-15T00:00:00Z'),
              notesUrl: '',
              body: 'jun15',
            },
            {
              version: '2.5.0',
              tagName: 'v2.5.0',
              publishedAt: Date.parse('2026-06-02T00:00:00Z'),
              notesUrl: '',
              body: 'jun2',
            },
            {
              version: '2.0.0',
              tagName: 'v2.0.0',
              publishedAt: Date.parse('2026-04-10T00:00:00Z'),
              notesUrl: '',
              body: 'apr10',
            },
          ],
        })}
      />,
    );
    const months = container.querySelectorAll('.github-rel-month');
    expect(months.length).toBe(2);
    expect(months[0].textContent).toContain('2026 年 6 月');
    expect(months[1].textContent).toContain('2026 年 4 月');
    expect(container.querySelectorAll('.github-rel-item').length).toBe(3);
    expect(container.querySelector('.github-rel-item.is-latest')).toBeTruthy();
  });

  it('舒适密度：默认展开全部说明', () => {
    githubDensity.value = 'comfortable';
    const { container } = render(
      <GithubReleasesView
        project={makeProject({
          releaseFetchedAt: Date.now(),
          latestVersion: '1.0.0',
          latestVersionPublishedAt: Date.parse('2026-06-15T00:00:00Z'),
          lastSeenVersion: '1.0.0',
          releases: [
            {
              version: '1.0.0',
              tagName: 'v1.0.0',
              publishedAt: Date.parse('2026-06-15T00:00:00Z'),
              notesUrl: '',
              body: 'a',
            },
            {
              version: '0.9.0',
              tagName: 'v0.9.0',
              publishedAt: Date.parse('2026-06-02T00:00:00Z'),
              notesUrl: '',
              body: 'b',
            },
            {
              version: '0.8.0',
              tagName: 'v0.8.0',
              publishedAt: Date.parse('2026-04-10T00:00:00Z'),
              notesUrl: '',
              body: 'c',
            },
          ],
        })}
      />,
    );
    expect(container.querySelectorAll('.github-rel-notes.is-open').length).toBe(3);
  });

  it('紧凑密度：仅最新默认展开，时间线带 --compact 类', () => {
    githubDensity.value = 'compact';
    const { container } = render(
      <GithubReleasesView
        project={makeProject({
          releaseFetchedAt: Date.now(),
          latestVersion: '1.0.0',
          latestVersionPublishedAt: Date.parse('2026-06-15T00:00:00Z'),
          lastSeenVersion: '1.0.0',
          releases: [
            {
              version: '1.0.0',
              tagName: 'v1.0.0',
              publishedAt: Date.parse('2026-06-15T00:00:00Z'),
              notesUrl: '',
              body: 'a',
            },
            {
              version: '0.9.0',
              tagName: 'v0.9.0',
              publishedAt: Date.parse('2026-06-02T00:00:00Z'),
              notesUrl: '',
              body: 'b',
            },
            {
              version: '0.8.0',
              tagName: 'v0.8.0',
              publishedAt: Date.parse('2026-04-10T00:00:00Z'),
              notesUrl: '',
              body: 'c',
            },
          ],
        })}
      />,
    );
    expect(container.querySelector('.github-rel-timeline--compact')).toBeTruthy();
    expect(container.querySelectorAll('.github-rel-notes.is-open').length).toBe(1);
  });
});
