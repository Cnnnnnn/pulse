/**
 * tests/main/register-core-release-notes.test.js
 *
 * ON: IPC handler 单测. 用 deps 注入 fake stateStore / loader, 不用 vi.mock.
 * 优势: 不依赖 vitest mock 行为, 跟项目其它 state-store 测试风格一致.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const { registerReleaseNotes } = requireMain('release-notes');
const mockApp = {
  getVersion: vi.fn(() => '2.32.0'),
};
const mockStateStore = {
  getLastSeenRelease: vi.fn(),
  setLastSeenRelease: vi.fn(),
};
const mockLoader = {
  readReleaseNotes: vi.fn(),
  readSlides: vi.fn(),
};

const handlers = {};
const fakeIpcMain = {
  handle: (channel, fn) => { handlers[channel] = fn; },
};

function setupHandlers(overrides = {}) {
  Object.keys(handlers).forEach((k) => delete handlers[k]);
  registerReleaseNotes({
    ipcMain: fakeIpcMain,
    app: overrides.app || mockApp,
    stateStore: overrides.stateStore || mockStateStore,
    loader: overrides.loader || mockLoader,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupHandlers();
});

describe('release-notes:get-current', () => {
  it('returns { alreadySeen: true } when seen.version === currentVersion', async () => {
    mockStateStore.getLastSeenRelease.mockReturnValue({ version: '2.32.0', at: 1 });
    mockLoader.readReleaseNotes.mockReturnValue('# v2.32.0\nfoo');
    mockLoader.readSlides.mockReturnValue({ version: '2.32.0', slides: [{ id: 'a' }] });
    const result = await handlers['release-notes:get-current']();
    expect(result.alreadySeen).toBe(true);
    expect(result.version).toBe('2.32.0');
    expect(result.changelogMd).toBe('# v2.32.0\nfoo');
    expect(result.slides).toEqual({ version: '2.32.0', slides: [{ id: 'a' }] });
  });

  it('returns { alreadySeen: false } when seen.version !== currentVersion', async () => {
    mockStateStore.getLastSeenRelease.mockReturnValue({ version: '2.31.0', at: 1 });
    mockLoader.readReleaseNotes.mockReturnValue('# v2.32.0\nfoo');
    mockLoader.readSlides.mockReturnValue(null);
    const result = await handlers['release-notes:get-current']();
    expect(result.alreadySeen).toBe(false);
    expect(result.slides).toBeNull();
  });

  it('returns { alreadySeen: false } when no previous seen record (fresh install / upgrade from < 2.32)', async () => {
    mockStateStore.getLastSeenRelease.mockReturnValue(null);
    mockLoader.readReleaseNotes.mockReturnValue('# v2.32.0\nfoo');
    mockLoader.readSlides.mockReturnValue(null);
    const result = await handlers['release-notes:get-current']();
    expect(result.alreadySeen).toBe(false);
  });

  it('returns null when md file missing (release build without notes)', async () => {
    mockStateStore.getLastSeenRelease.mockReturnValue(null);
    mockLoader.readReleaseNotes.mockReturnValue(null);
    const result = await handlers['release-notes:get-current']();
    expect(result).toBeNull();
  });

  it('returns { slides: null } when slides.json missing (md-only mode)', async () => {
    mockStateStore.getLastSeenRelease.mockReturnValue(null);
    mockLoader.readReleaseNotes.mockReturnValue('# v2.32.0\nfoo');
    mockLoader.readSlides.mockReturnValue(null);
    const result = await handlers['release-notes:get-current']();
    expect(result.slides).toBeNull();
    expect(result.changelogMd).toBe('# v2.32.0\nfoo');
  });

  it('fail-safe: state-store throw → alreadySeen: true (do not block bootstrap)', async () => {
    mockStateStore.getLastSeenRelease.mockImplementation(() => { throw new Error('corrupt'); });
    mockLoader.readReleaseNotes.mockReturnValue('# v2.32.0\nfoo');
    const result = await handlers['release-notes:get-current']();
    expect(result.alreadySeen).toBe(true);
  });
});

describe('release-notes:mark-seen', () => {
  it('writes last_seen_release and returns { ok: true, version }', async () => {
    mockStateStore.setLastSeenRelease.mockReturnValue(undefined);
    const result = await handlers['release-notes:mark-seen']({}, '2.32.0');
    expect(result).toEqual({ ok: true, version: '2.32.0' });
    expect(mockStateStore.setLastSeenRelease).toHaveBeenCalledWith('2.32.0', expect.any(Number));
  });

  it('returns { ok: false } on write failure (does not throw)', async () => {
    mockStateStore.setLastSeenRelease.mockImplementation(() => { throw new Error('EACCES'); });
    const result = await handlers['release-notes:mark-seen']({}, '2.32.0');
    expect(result).toEqual({ ok: false, version: '2.32.0' });
  });
});

describe('release-notes:get-version', () => {
  it('returns payload for the requested version regardless of seen status', async () => {
    mockStateStore.getLastSeenRelease.mockReturnValue({ version: '2.31.0', at: 1 });
    mockLoader.readReleaseNotes.mockReturnValue('# v2.32.0\nfoo');
    mockLoader.readSlides.mockReturnValue(null);
    const result = await handlers['release-notes:get-version']({}, '2.32.0');
    expect(result.version).toBe('2.32.0');
    expect(result.changelogMd).toBe('# v2.32.0\nfoo');
    expect(result.slides).toBeNull();
  });

  it('returns null when requested version has no md', async () => {
    mockLoader.readReleaseNotes.mockReturnValue(null);
    const result = await handlers['release-notes:get-version']({}, '9.9.9');
    expect(result).toBeNull();
  });
});
