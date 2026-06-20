// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { SnoozeMenu } from '../../src/renderer/components/SnoozeMenu.jsx';
import { api } from '../../src/renderer/api.js';

describe('SnoozeMenu', () => {
  let onClose;

  beforeEach(() => {
    cleanup();
    onClose = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders 4 preset options', () => {
    const { container } = render(
      <SnoozeMenu name="Cursor" latestVersion="3.6.33" onClose={onClose} />,
    );
    const text = container.textContent;
    expect(text).toContain('今晚');
    expect(text).toContain('明早');
    expect(text).toContain('周六');
    expect(text).toContain('跳过此版本');
  });

  it('clicking 今晚 calls api.setAppSnooze with until timestamp', async () => {
    const spy = vi.spyOn(api, 'setAppSnooze').mockResolvedValue({ ok: true });
    const { getByText } = render(
      <SnoozeMenu name="Cursor" onClose={onClose} />,
    );
    const btn = getByText(/今晚/);
    fireEvent.click(btn);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [name, opts] = spy.mock.calls[0];
    expect(name).toBe('Cursor');
    expect(typeof opts.until).toBe('number');
  });

  it('clicking 跳过此版本 calls api.setAppSnooze with version', async () => {
    const spy = vi.spyOn(api, 'setAppSnooze').mockResolvedValue({ ok: true });
    const { getByText } = render(
      <SnoozeMenu name="Cursor" latestVersion="3.6.33" onClose={onClose} />,
    );
    const btn = getByText(/跳过此版本/);
    fireEvent.click(btn);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [name, opts] = spy.mock.calls[0];
    expect(name).toBe('Cursor');
    expect(opts.version).toBe('3.6.33');
  });

  it('shows 已延后 + cancel button when snoozeUntil is in future', async () => {
    const futureMs = Date.now() + 86400_000;
    const clearSpy = vi.spyOn(api, 'clearAppSnooze').mockResolvedValue({ ok: true });
    const { getByText } = render(
      <SnoozeMenu name="Cursor" snoozeUntil={futureMs} skippedVersion={null} onClose={onClose} />,
    );
    expect(getByText(/已延后/)).toBeTruthy();
    const cancelBtn = getByText(/取消/);
    fireEvent.click(cancelBtn);
    await waitFor(() => expect(clearSpy).toHaveBeenCalledWith('Cursor'));
  });

  it('shows 跳过版本 + cancel button when skippedVersion present', async () => {
    const clearSpy = vi.spyOn(api, 'clearAppSnooze').mockResolvedValue({ ok: true });
    const { getByText } = render(
      <SnoozeMenu name="Cursor" latestVersion="3.6.33" skippedVersion="3.6.33" onClose={onClose} />,
    );
    expect(getByText(/跳过 3.6.33/)).toBeTruthy();
    const cancelBtn = getByText(/取消/);
    fireEvent.click(cancelBtn);
    await waitFor(() => expect(clearSpy).toHaveBeenCalledWith('Cursor'));
  });
});
