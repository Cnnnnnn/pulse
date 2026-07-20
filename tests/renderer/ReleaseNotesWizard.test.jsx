// @vitest-environment happy-dom
/**
 * tests/renderer/ReleaseNotesWizard.test.jsx
 *
 * ON: 向导 modal 组件. 新版行为 (v2 — "每次都弹直到收到"):
 *   - 默认隐藏
 *   - open signal → 显示
 *   - 翻页 ← →
 *   - skip / ESC / 遮罩 → 只关向导, **不调** mark-seen (下次启动还会弹)
 *   - 完成按钮 (auto 入口) → 弹 confirm; 收到 → mark-seen; 稍后再说 → 不调
 *   - 完成按钮 (manual 入口) → 不弹 confirm, 不调 mark-seen
 *   - mark-seen 失败 → 仍关闭 + toast
 *   - 只有 changelog 无 slides → 单页
 *   - slide body 走 DOMPurify (无 <script> 注入)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/preact';

const mockToast = vi.fn();
const mockReleaseNotesMarkSeen = vi.fn();
const mockReleaseNotesGetCurrent = vi.fn();
const mockReleaseNotesGetVersion = vi.fn();

// confirm mock: 默认 resolve true (收到). 单测可临时改成 false (稍后) 或 reject.
const mockOpenConfirm = vi.fn();

vi.mock('../../src/renderer/api.js', () => ({
  api: {
    releaseNotes: {
      getCurrent: (...args) => mockReleaseNotesGetCurrent(...args),
      getVersion: (...args) => mockReleaseNotesGetVersion(...args),
      markSeen: (...args) => mockReleaseNotesMarkSeen(...args),
    },
  },
}));

vi.mock('../../src/renderer/store.js', () => ({
  showToast: (...args) => mockToast(...args),
}));

vi.mock('../../src/renderer/store/confirmStore.js', () => ({
  openConfirm: (...args) => mockOpenConfirm(...args),
}));

const store = await import('../../src/renderer/store/release-notes-store.js');
const { ReleaseNotesWizard } = await import('../../src/renderer/components/ReleaseNotesWizard.jsx');

function openAsAuto(payload) {
  store.__resetForTest();
  store.releaseNotesEntryPath.value = 'auto';
  store.releaseNotesPayload.value = payload;
  store.releaseNotesOpen.value = true;
}

beforeEach(() => {
  cleanup();
  store.__resetForTest();
  vi.clearAllMocks();
  mockReleaseNotesMarkSeen.mockResolvedValue({ ok: true, version: '2.32.0' });
  // 默认 confirm 点「收到」
  mockOpenConfirm.mockResolvedValue(true);
});

describe('ReleaseNotesWizard', () => {
  it('does not render when open is false', () => {
    const { container } = render(<ReleaseNotesWizard />);
    expect(container.querySelector('.release-notes-wizard')).toBeFalsy();
  });

  it('renders when open is true', () => {
    openAsAuto({ version: '2.32.0', changelogMd: '# hi', slides: null });
    const { container } = render(<ReleaseNotesWizard />);
    expect(container.querySelector('.release-notes-wizard')).toBeTruthy();
  });

  it('next / prev advance and retreat current page', () => {
    openAsAuto({
      version: '2.32.0',
      changelogMd: '# changelog',
      slides: { version: '2.32.0', slides: [
        { id: 's1', title: 'A', body: 'a' },
        { id: 's2', title: 'B', body: 'b' },
      ] },
    });
    const { container, getByText } = render(<ReleaseNotesWizard />);
    expect(container.textContent).toContain('changelog');
    fireEvent.click(getByText(/下一步/));
    expect(container.textContent).toContain('A');
    fireEvent.click(getByText(/下一步/));
    expect(container.textContent).toContain('B');
    fireEvent.click(getByText(/上一步/));
    expect(container.textContent).toContain('A');
  });

  // ── 新版: skip / ESC / 遮罩 都不调 mark-seen (下次启动还会弹) ──

  it('skip button → closes WITHOUT mark-seen (下次启动还会弹)', async () => {
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/跳过/));
    await waitFor(() => {
      expect(store.releaseNotesOpen.value).toBe(false);
    });
    expect(mockReleaseNotesMarkSeen).not.toHaveBeenCalled();
  });

  it('ESC key → closes WITHOUT mark-seen', async () => {
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    render(<ReleaseNotesWizard />);
    await new Promise((r) => setTimeout(r, 0));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => {
      expect(store.releaseNotesOpen.value).toBe(false);
    });
    expect(mockReleaseNotesMarkSeen).not.toHaveBeenCalled();
  });

  it('overlay click → closes WITHOUT mark-seen', async () => {
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { container } = render(<ReleaseNotesWizard />);
    fireEvent.click(container.querySelector('.release-notes-wizard-overlay'));
    await waitFor(() => {
      expect(store.releaseNotesOpen.value).toBe(false);
    });
    expect(mockReleaseNotesMarkSeen).not.toHaveBeenCalled();
  });

  // ── 新版: 完成 → confirm → 收到/稍后 ──

  it('完成 (auto) → confirm → 收到 → calls mark-seen + closes', async () => {
    mockOpenConfirm.mockResolvedValue(true);
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/完成/));
    await waitFor(() => {
      expect(mockReleaseNotesMarkSeen).toHaveBeenCalledWith('2.32.0');
    });
    await waitFor(() => {
      expect(store.releaseNotesOpen.value).toBe(false);
    });
    // confirm 用了正确的文案
    expect(mockOpenConfirm).toHaveBeenCalledWith(expect.objectContaining({
      confirmText: '收到',
      cancelText: '稍后再说',
    }));
  });

  it('完成 (auto) → confirm → 稍后再说 → does NOT call mark-seen, still closes', async () => {
    mockOpenConfirm.mockResolvedValue(false);
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/完成/));
    await waitFor(() => {
      expect(store.releaseNotesOpen.value).toBe(false);
    });
    expect(mockReleaseNotesMarkSeen).not.toHaveBeenCalled();
  });

  it('完成 (manual 入口) → does NOT open confirm, does NOT call mark-seen', async () => {
    store.__resetForTest();
    store.releaseNotesEntryPath.value = 'manual';
    store.releaseNotesPayload.value = { version: '2.32.0', changelogMd: '# x', slides: null };
    store.releaseNotesOpen.value = true;
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/完成/));
    await waitFor(() => {
      expect(store.releaseNotesOpen.value).toBe(false);
    });
    expect(mockOpenConfirm).not.toHaveBeenCalled();
    expect(mockReleaseNotesMarkSeen).not.toHaveBeenCalled();
  });

  it('mark-seen failure (ok:false after 收到) → still closes + shows toast', async () => {
    mockOpenConfirm.mockResolvedValue(true);
    mockReleaseNotesMarkSeen.mockResolvedValue({ ok: false, version: '2.32.0' });
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/完成/));
    await waitFor(() => {
      expect(store.releaseNotesOpen.value).toBe(false);
    });
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('保存失败'), 'warn');
  });

  it('mark-seen throw (after 收到) → still closes + shows toast', async () => {
    mockOpenConfirm.mockResolvedValue(true);
    mockReleaseNotesMarkSeen.mockRejectedValue(new Error('IPC fail'));
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/完成/));
    await waitFor(() => {
      expect(store.releaseNotesOpen.value).toBe(false);
    });
    expect(mockToast).toHaveBeenCalled();
  });

  it('changelog only (no slides) → single page with 完成 button (no 上一步/下一步)', () => {
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { container, queryByText } = render(<ReleaseNotesWizard />);
    expect(container.textContent).toContain('x');
    expect(queryByText(/上一步/)).toBeFalsy();
    expect(queryByText(/下一步/)).toBeFalsy();
    expect(queryByText(/完成/)).toBeTruthy();
  });

  it('script tag in slide body is sanitized by DOMPurify (XSS protection)', async () => {
    openAsAuto({
      version: '2.32.0',
      changelogMd: '',
      slides: { version: '2.32.0', slides: [
        { id: 'evil', title: 'Safe', body: 'before <script>alert(1)</script> after' },
      ] },
    });
    const { container, getByText } = render(<ReleaseNotesWizard />);
    // step to slide 1 (page 0 = changelog, page 1 = first slide)
    fireEvent.click(getByText(/下一步/));
    // preact batches setState; wait a tick for re-render
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('script')).toBeFalsy();
  });
});
