/**
 * tests/detectors/github-release.test.js
 *
 * GithubReleaseDetector — api.github.com/repos/{owner}/{repo}/releases/latest
 * 取 tag_name (去 v 前缀). 纯 HTTP, mac/win 通用.
 */
import { describe, it, expect } from 'vitest';
import { GithubReleaseDetector } from '../../src/detectors/github-release.js';
import { MockHttp, makeCtx } from '../helpers/mock-http.js';
import { REASONS } from '../../src/detectors/errors.js';

describe('GithubReleaseDetector', () => {
  it('取 tag_name, 去掉 v 前缀', async () => {
    const http = new MockHttp({
      get: [
        {
          status: 200,
          body: JSON.stringify({ tag_name: 'v3.7.12', name: 'Release 3.7.12' }),
        },
      ],
    });
    const r = await new GithubReleaseDetector({
      url: 'https://api.github.com/repos/anysphere/cursor/releases/latest',
    }).detect(makeCtx({ http }));
    expect(r.version).toBe('3.7.12');
    expect(r.confidence).toBe('high');
    expect(r.source).toBe('github_release');
  });

  it('tag_name 无 v 前缀也行', async () => {
    const http = new MockHttp({
      get: [{ status: 200, body: JSON.stringify({ tag_name: '2.5.0' }) }],
    });
    const r = await new GithubReleaseDetector({ url: 'x' }).detect(
      makeCtx({ http }),
    );
    expect(r.version).toBe('2.5.0');
  });

  it('404 → HTTP_4XX', async () => {
    const http = new MockHttp({ get: [{ status: 404, body: '' }] });
    await expect(
      new GithubReleaseDetector({ url: 'x' }).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.HTTP_4XX });
  });

  it('tag_name 缺 → no_version', async () => {
    const http = new MockHttp({
      get: [{ status: 200, body: JSON.stringify({ name: 'Release' }) }],
    });
    await expect(
      new GithubReleaseDetector({ url: 'x' }).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('JSON 解析失败 → parse', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: 'not json' }] });
    await expect(
      new GithubReleaseDetector({ url: 'x' }).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.PARSE });
  });

  it('无 url → no_version', async () => {
    await expect(
      new GithubReleaseDetector({}).detect(makeCtx({})),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('release body 带 body → changelog', async () => {
    const http = new MockHttp({
      get: [
        {
          status: 200,
          body: JSON.stringify({
            tag_name: '1.0.0',
            body: '## Changes\n- Fixed bug',
          }),
        },
      ],
    });
    const r = await new GithubReleaseDetector({ url: 'x' }).detect(
      makeCtx({ http }),
    );
    expect(r.changelog).toContain('Fixed bug');
  });

  // P53: html_url 透传到 release_url, 让 ChangelogPanel 跳到该版本 release page.
  it('html_url 透传到 release_url', async () => {
    const htmlUrl =
      'https://github.com/owner/repo/releases/tag/v3.7.12';
    const http = new MockHttp({
      get: [
        {
          status: 200,
          body: JSON.stringify({
            tag_name: 'v3.7.12',
            html_url: htmlUrl,
            body: 'changes',
          }),
        },
      ],
    });
    const r = await new GithubReleaseDetector({ url: 'x' }).detect(
      makeCtx({ http }),
    );
    expect(r.release_url).toBe(htmlUrl);
  });

  it('html_url 缺失 → release_url 为空字符串', async () => {
    const http = new MockHttp({
      get: [
        {
          status: 200,
          body: JSON.stringify({ tag_name: '1.0.0' }),
        },
      ],
    });
    const r = await new GithubReleaseDetector({ url: 'x' }).detect(
      makeCtx({ http }),
    );
    expect(r.release_url).toBe('');
  });
});
