// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { DiagnosticsDrawer } from '../../src/renderer/components/DiagnosticsDrawer.jsx';
import { diagnosticsDrawerOpen, errorEntries, errorStats, errorLoading } from '../../src/renderer/diagnostics/diagnostics-store.js';
import { api } from '../../src/renderer/api.js';

describe('DiagnosticsDrawer', () => {
  beforeEach(() => {
    cleanup();
    diagnosticsDrawerOpen.value = false;
    errorEntries.value = [];
    errorStats.value = { total: 0, byLevel: {}, skipped: 0 };
    errorLoading.value = false;
  });

  afterEach(() => {
    diagnosticsDrawerOpen.value = false;
    vi.restoreAllMocks();
  });

  it('renders nothing when drawer closed', () => {
    const { container } = render(<DiagnosticsDrawer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders empty list message when open and no entries', async () => {
    diagnosticsDrawerOpen.value = true;
    vi.spyOn(api, 'errorFetchEntries').mockResolvedValue({ ok: true, entries: [], stats: { total: 0, byLevel: {}, skipped: 0 } });
    const { container } = render(<DiagnosticsDrawer />);
    await waitFor(() => {
      expect(container.textContent).toMatch(/暂无错误|empty|no error/i);
    });
  });

  it('renders one row per entry', async () => {
    diagnosticsDrawerOpen.value = true;
    vi.spyOn(api, 'errorFetchEntries').mockResolvedValue({
      ok: true,
      entries: [
        { id: '1', ts: Date.now(), source: 'main', level: 'error', message: 'something broke' },
        { id: '2', ts: Date.now(), source: 'renderer', level: 'warn', message: 'soft fail' },
      ],
      stats: { total: 2, byLevel: { error: 1, warn: 1 } },
    });
    const { container } = render(<DiagnosticsDrawer />);
    await waitFor(() => {
      expect(container.textContent).toContain('something broke');
      expect(container.textContent).toContain('soft fail');
    });
  });

  it('closes when close button clicked', () => {
    diagnosticsDrawerOpen.value = true;
    const { getByText } = render(<DiagnosticsDrawer />);
    const closeBtn = getByText('×');
    fireEvent.click(closeBtn);
    expect(diagnosticsDrawerOpen.value).toBe(false);
  });

  it('copy-all button calls api.errorCopyAll', async () => {
    diagnosticsDrawerOpen.value = true;
    const copySpy = vi.spyOn(api, 'errorCopyAll').mockResolvedValue({ ok: true, text: '' });
    const { getByText } = render(<DiagnosticsDrawer />);
    const copyBtn = getByText(/复制全部|copy all/i);
    fireEvent.click(copyBtn);
    await waitFor(() => expect(copySpy).toHaveBeenCalled());
  });
});