/**
 * tests/renderer/changelog-panel-releases.test.jsx
 *
 * P53: ChangelogPanel ↗ Releases 按钮 (deep link to GitHub Releases / release page).
 *
 * 验证:
 *   1. result.release_url 存在 → 渲染 .changelog-releases-btn, 文案带 ↗
 *   2. source 含 'github' → 文案 "↗ GitHub Releases"
 *   3. 点击按钮 → api.openUrl 被调 (走主进程 shell.openExternal)
 *   4. release_url 缺失 → 按钮不渲染
 *   5. history view (非 current) → 按钮不渲染 (避免误导)
 */

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/preact';

// mock api.js 用 inline forwarder 指向 mockApi (vi.mock hoist safe).
const mockApi = {
  openUrl: vi.fn(async () => ({ ok: true })),
};
vi.mock('../../src/renderer/api.js', () => ({
  get api() {
    return mockApi;
  },
}));

// mock ChangelogSummary: 避免依赖 (appName → AI token 用量 etc.)
vi.mock(
  '../../src/renderer/components/ChangelogSummary.jsx',
  () => ({
    ChangelogSummary: () => null,
  }),
);

// mock changelog.js: 简化 renderChangelog (避免 DOMPurify happy-dom 路径噪音)
vi.mock('../../src/renderer/changelog.js', () => ({
  renderChangelog: (src, format, url) => {
    // 简单返回 src 当 HTML (happy-dom 用 innerHTML 即可)
    return `<div class="mock-body">${src || ''}</div>${
      url ? `<a href="${url}" target="_blank">查看完整 release notes</a>` : ''
    }`;
  },
}));

import { ChangelogPanel } from '../../src/renderer/components/ChangelogPanel.jsx';

beforeEach(() => {
  mockApi.openUrl.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ChangelogPanel: ↗ Releases 按钮', () => {
  it('release_url 存在 → 渲染 .changelog-releases-btn, 文案含 ↗', () => {
    const result = {
      name: 'MyApp',
      latest_version: '2.5.0',
      source: 'github_release',
      changelog: '## Changes\n- New feature',
      release_url:
        'https://github.com/owner/myapp/releases/tag/v2.5.0',
    };
    const { container } = render(<ChangelogPanel result={result} />);
    const btn = container.querySelector('.changelog-releases-btn');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toMatch(/↗/);
  });

  it('source 含 github → 文案 "↗ GitHub Releases"', () => {
    const result = {
      name: 'MyApp',
      latest_version: '2.5.0',
      source: 'github_release',
      changelog: 'changes',
      release_url: 'https://github.com/owner/myapp/releases/tag/v2.5.0',
    };
    const { container } = render(<ChangelogPanel result={result} />);
    const btn = container.querySelector('.changelog-releases-btn');
    expect(btn.textContent).toBe('↗ GitHub Releases');
  });

  it('source 是 sparkle → 文案 "↗ 项目主页"', () => {
    const result = {
      name: 'MyApp',
      latest_version: '2.5.0',
      source: 'sparkle_appcast',
      changelog: 'changes',
      release_url: 'https://example.com/release/2.5.0',
    };
    const { container } = render(<ChangelogPanel result={result} />);
    const btn = container.querySelector('.changelog-releases-btn');
    expect(btn.textContent).toBe('↗ 项目主页');
  });

  it('source 是其他 → 通用 "↗ 查看发布页"', () => {
    const result = {
      name: 'MyApp',
      latest_version: '2.5.0',
      source: 'api_json',
      changelog: 'changes',
      release_url: 'https://example.com/release',
    };
    const { container } = render(<ChangelogPanel result={result} />);
    const btn = container.querySelector('.changelog-releases-btn');
    expect(btn.textContent).toBe('↗ 查看发布页');
  });

  it('点击按钮 → api.openUrl 被调, 传 release_url', () => {
    const releaseUrl = 'https://github.com/owner/myapp/releases/tag/v2.5.0';
    const result = {
      name: 'MyApp',
      latest_version: '2.5.0',
      source: 'github_release',
      changelog: 'changes',
      release_url: releaseUrl,
    };
    const { container } = render(<ChangelogPanel result={result} />);
    const btn = container.querySelector('.changelog-releases-btn');
    btn.click();
    expect(mockApi.openUrl).toHaveBeenCalledTimes(1);
    expect(mockApi.openUrl).toHaveBeenCalledWith(releaseUrl);
  });

  it('release_url 缺失 → 按钮不渲染', () => {
    const result = {
      name: 'MyApp',
      latest_version: '2.5.0',
      source: 'github_release',
      changelog: 'changes',
      // release_url 故意缺
    };
    const { container } = render(<ChangelogPanel result={result} />);
    expect(container.querySelector('.changelog-releases-btn')).toBeNull();
  });

  it('release_url 是空串 → 按钮不渲染', () => {
    const result = {
      name: 'MyApp',
      latest_version: '2.5.0',
      source: 'github_release',
      changelog: 'changes',
      release_url: '',
    };
    const { container } = render(<ChangelogPanel result={result} />);
    expect(container.querySelector('.changelog-releases-btn')).toBeNull();
  });

  it('button title 含 release_url (hover 看得到)', () => {
    const releaseUrl = 'https://github.com/owner/myapp/releases/tag/v2.5.0';
    const result = {
      name: 'MyApp',
      latest_version: '2.5.0',
      source: 'github_release',
      changelog: 'changes',
      release_url: releaseUrl,
    };
    const { container } = render(<ChangelogPanel result={result} />);
    const btn = container.querySelector('.changelog-releases-btn');
    expect(btn.title).toBe(`在浏览器打开: ${releaseUrl}`);
  });
});
