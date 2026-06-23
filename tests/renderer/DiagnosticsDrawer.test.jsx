// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { DiagnosticsDrawer } from '../../src/renderer/components/DiagnosticsDrawer.jsx';
import { diagnosticsDrawerOpen, errorEntries, errorStats, errorLoading,
  diagnosticsStartup, diagnosticsMetrics, diagnosticsTopFailures,
  diagnosticsSamples, diagnosticsDiagnosticsLoading, diagnosticsExporting, diagnosticsLastExport,
} from '../../src/renderer/diagnostics/diagnostics-store.js';
import { api } from '../../src/renderer/api.js';

describe('DiagnosticsDrawer', () => {
  beforeEach(() => {
    cleanup();
    diagnosticsDrawerOpen.value = false;
    errorEntries.value = [];
    errorStats.value = { total: 0, byLevel: {}, skipped: 0 };
    errorLoading.value = false;
    diagnosticsStartup.value = null;
    diagnosticsMetrics.value = { latest: null, peak: null, count: 0 };
    diagnosticsTopFailures.value = [];
    diagnosticsSamples.value = [];
    diagnosticsDiagnosticsLoading.value = false;
    diagnosticsExporting.value = false;
    diagnosticsLastExport.value = null;
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

  // Phase Q1 v2 ───────────────────────────────────────────
  it('打开时拉 diagnosticsFetch + diagnosticsFetchSamples', async () => {
    diagnosticsDrawerOpen.value = true;
    const fetchSpy = vi.spyOn(api, 'diagnosticsFetch').mockResolvedValue({
      ok: true,
      startup: { bootstrapMs: 100, readyMs: 500 },
      metrics: { latest: { heapUsed: 12345, rss: 67890, cpuUser: 2000 }, peak: { heapUsed: 22222, rss: 88888 }, count: 30 },
      topFailures: [{ source: 'main', message: 'boom A', count: 3, firstTs: 1, lastTs: 5 }],
      stats: { total: 1, byLevel: { error: 1 }, skipped: 0 },
      sinceMs: 0,
    });
    const samplesSpy = vi.spyOn(api, 'diagnosticsFetchSamples').mockResolvedValue({
      ok: true,
      samples: [
        { ts: 1, heapUsed: 100, rss: 500, cpuUser: 0 },
        { ts: 2, heapUsed: 200, rss: 600, cpuUser: 1 },
      ],
    });
    render(<DiagnosticsDrawer />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(samplesSpy).toHaveBeenCalled();
    expect(diagnosticsStartup.value).toMatchObject({ readyMs: 500 });
    expect(diagnosticsMetrics.value.count).toBe(30);
    expect(diagnosticsTopFailures.value[0].message).toBe('boom A');
    expect(diagnosticsSamples.value).toHaveLength(2);
  });

  it('显示启动时间 ms', async () => {
    diagnosticsDrawerOpen.value = true;
    vi.spyOn(api, 'diagnosticsFetch').mockResolvedValue({
      ok: true,
      startup: { bootstrapMs: 120, readyMs: 480 },
      metrics: { latest: null, peak: null, count: 0 },
      topFailures: [],
      stats: { total: 0, byLevel: {}, skipped: 0 },
      sinceMs: 0,
    });
    vi.spyOn(api, 'diagnosticsFetchSamples').mockResolvedValue({ ok: true, samples: [] });
    const { container } = render(<DiagnosticsDrawer />);
    await waitFor(() => {
      expect(container.textContent).toMatch(/480\s*ms/);
      expect(container.textContent).toMatch(/120\s*ms/);
    });
  });

  it('显示 Top 5 failures + counts', async () => {
    diagnosticsDrawerOpen.value = true;
    vi.spyOn(api, 'diagnosticsFetch').mockResolvedValue({
      ok: true,
      startup: null,
      metrics: { latest: null, peak: null, count: 0 },
      topFailures: [
        { source: 'main', message: 'boom A', count: 5, firstTs: 1, lastTs: 9 },
        { source: 'renderer', message: 'boom B', count: 2, firstTs: 1, lastTs: 2 },
      ],
      stats: { total: 0, byLevel: {}, skipped: 0 },
      sinceMs: 0,
    });
    vi.spyOn(api, 'diagnosticsFetchSamples').mockResolvedValue({ ok: true, samples: [] });
    const { container } = render(<DiagnosticsDrawer />);
    await waitFor(() => {
      expect(container.textContent).toContain('5×');
      expect(container.textContent).toContain('2×');
      expect(container.textContent).toContain('boom A');
      expect(container.textContent).toContain('[main]');
    });
  });

  it('导出按钮 → 调 errorExportZip 并显示路径 + 大小', async () => {
    diagnosticsDrawerOpen.value = true;
    vi.spyOn(api, 'diagnosticsFetch').mockResolvedValue({
      ok: true, startup: null, metrics: { latest: null, peak: null, count: 0 },
      topFailures: [], stats: { total: 0, byLevel: {}, skipped: 0 }, sinceMs: 0,
    });
    vi.spyOn(api, 'diagnosticsFetchSamples').mockResolvedValue({ ok: true, samples: [] });
    const expSpy = vi.spyOn(api, 'errorExportZip').mockResolvedValue({
      ok: true, path: '/Users/me/Desktop/pulse-diagnostics-test.tar.gz', sizeBytes: 12345, fileCount: 4,
    });
    const { getByText } = render(<DiagnosticsDrawer />);
    const exportBtn = getByText(/导出诊断包/);
    fireEvent.click(exportBtn);
    await waitFor(() => expect(expSpy).toHaveBeenCalled());
    await waitFor(() => expect(diagnosticsLastExport.value).toMatchObject({
      path: '/Users/me/Desktop/pulse-diagnostics-test.tar.gz', fileCount: 4,
    }));
  });

  it('导出失败 → 显示错误信息', async () => {
    diagnosticsDrawerOpen.value = true;
    vi.spyOn(api, 'diagnosticsFetch').mockResolvedValue({
      ok: true, startup: null, metrics: { latest: null, peak: null, count: 0 },
      topFailures: [], stats: { total: 0, byLevel: {}, skipped: 0 }, sinceMs: 0,
    });
    vi.spyOn(api, 'diagnosticsFetchSamples').mockResolvedValue({ ok: true, samples: [] });
    vi.spyOn(api, 'errorExportZip').mockResolvedValue({ ok: false, reason: 'mkdir_failed' });
    const { getByText } = render(<DiagnosticsDrawer />);
    fireEvent.click(getByText(/导出诊断包/));
    await waitFor(() => expect(diagnosticsLastExport.value).toMatchObject({ error: 'mkdir_failed' }));
  });
});