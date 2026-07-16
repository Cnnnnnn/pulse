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
});
