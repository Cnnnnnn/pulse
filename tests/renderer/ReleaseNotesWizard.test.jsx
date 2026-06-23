// @vitest-environment happy-dom
/**
 * tests/renderer/ReleaseNotesWizard.test.jsx
 *
 * ON: 向导 modal 组件. 测:
 *   - 默认隐藏
 *   - open signal → 显示
 *   - 翻页 ← →
 *   - 4 种关闭路径 (skip / 完成 / ESC / 遮罩) 都调 mark-seen (auto 路径)
 *   - manual 路径关闭 → 不调 mark-seen
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

const store = await import('../../src/renderer/release-notes-store.js');
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

  it('skip button on auto path → calls mark-seen + closes', async () => {
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/跳过/));
    await waitFor(() => {
      expect(mockReleaseNotesMarkSeen).toHaveBeenCalledWith('2.32.0');
    });
    expect(store.releaseNotesOpen.value).toBe(false);
  });

  it('完成 button on auto path (last page, no slides) → calls mark-seen + closes', async () => {
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/完成/));
    await waitFor(() => {
      expect(mockReleaseNotesMarkSeen).toHaveBeenCalledWith('2.32.0');
    });
  });

  it('ESC key → auto path → calls mark-seen + closes', async () => {
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    render(<ReleaseNotesWizard />);
    // useEffect 注册 listener 在 mount 后跑, 等一个 microtask
    await new Promise((r) => setTimeout(r, 0));
    // happy-dom 下 fireEvent.keyDown 不可靠; 用原生 KeyboardEvent dispatch
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => {
      expect(mockReleaseNotesMarkSeen).toHaveBeenCalledWith('2.32.0');
    });
  });

  it('overlay click → auto path → calls mark-seen + closes', async () => {
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { container } = render(<ReleaseNotesWizard />);
    fireEvent.click(container.querySelector('.release-notes-wizard-overlay'));
    await waitFor(() => {
      expect(mockReleaseNotesMarkSeen).toHaveBeenCalledWith('2.32.0');
    });
  });

  it('manual path close → does NOT call mark-seen', async () => {
    store.__resetForTest();
    store.releaseNotesEntryPath.value = 'manual';
    store.releaseNotesPayload.value = { version: '2.32.0', changelogMd: '# x', slides: null };
    store.releaseNotesOpen.value = true;
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/跳过/));
    await waitFor(() => {
      expect(store.releaseNotesOpen.value).toBe(false);
    });
    expect(mockReleaseNotesMarkSeen).not.toHaveBeenCalled();
  });

  it('mark-seen failure (ok:false) → still closes + shows toast', async () => {
    mockReleaseNotesMarkSeen.mockResolvedValue({ ok: false, version: '2.32.0' });
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/跳过/));
    await waitFor(() => {
      expect(store.releaseNotesOpen.value).toBe(false);
    });
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('保存失败'), 'warn');
  });

  it('mark-seen throw → still closes + shows toast', async () => {
    mockReleaseNotesMarkSeen.mockRejectedValue(new Error('IPC fail'));
    openAsAuto({ version: '2.32.0', changelogMd: '# x', slides: null });
    const { getByText } = render(<ReleaseNotesWizard />);
    fireEvent.click(getByText(/跳过/));
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
    // (ponytail: marked 将 'before <script>...</script> after' 当 block html
    // 整体吞掉, 所以 body 可能是空. 关键断言: 没有任何 <script> 元素注入到 DOM.
    // 真实 XSS 防护由 DOMPurify 承担, 跟 changelog.test.js 41-46 同一断言.)
    expect(container.querySelector('script')).toBeFalsy();
  });
});
