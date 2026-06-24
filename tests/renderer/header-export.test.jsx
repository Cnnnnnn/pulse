// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { Header } from '../../src/renderer/components/Header.jsx';
import { checkSession } from '../../src/renderer/store.js';
import { api } from '../../src/renderer/api.js';

describe('Header C7 export', () => {
  beforeEach(() => {
    cleanup();
    checkSession.value = { id: 's-1', phase: 'done', startedAt: 1, finishedAt: 2, error: null, appOrder: [] };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('点击 JSON 按钮调用 detectResultsExport 并显示成功', async () => {
    vi.spyOn(api, 'detectResultsExport').mockResolvedValue({
      ok: true,
      path: '/Users/x/Desktop/pulse-detect-results.json',
      sizeBytes: 100,
      rowCount: 3,
      format: 'json',
    });
    const { container } = render(<Header onCheck={() => {}} />);
    fireEvent.click(container.querySelector('#btn-export-json'));
    await waitFor(() => {
      expect(api.detectResultsExport).toHaveBeenCalledWith({ format: 'json' });
      expect(container.textContent).toMatch(/已导出 JSON/);
    });
  });

  it('导出失败显示错误', async () => {
    vi.spyOn(api, 'detectResultsExport').mockResolvedValue({ ok: false, reason: 'bad_format' });
    const { container } = render(<Header onCheck={() => {}} />);
    fireEvent.click(container.querySelector('#btn-export-csv'));
    await waitFor(() => {
      expect(container.textContent).toMatch(/导出失败/);
    });
  });
});
