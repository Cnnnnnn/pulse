// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { DigestDrawer } from '../../../src/renderer/digest/DigestDrawer.tsx';
import { digestDrawerOpen, digestSections, digestLines, digestDate, digestLoading } from '../../../src/renderer/digest/digest-store.ts';
import { api } from '../../../src/renderer/api.ts';

describe('DigestDrawer', () => {
  beforeEach(() => {
    cleanup();
    digestDrawerOpen.value = false;
    digestSections.value = [];
    digestLines.value = [];
    digestDate.value = null;
    digestLoading.value = false;
  });

  it('renders nothing when digestDrawerOpen is false', () => {
    const { container } = render(<DigestDrawer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders drawer with empty state when open and no sections', async () => {
    digestDrawerOpen.value = true;
    const { container } = render(<DigestDrawer />);
    await waitFor(() => {
      expect(container.textContent).toMatch(/今天还没有要点/);
    });
  });

  it('renders one section per kind in digestSections', async () => {
    digestDrawerOpen.value = true;
    digestDate.value = '2026-06-20';
    digestSections.value = [
      { kind: 'updates', items: [{ name: 'Cursor', latest_version: '3.6.33' }] },
      { kind: 'hot', items: [{ title: '热搜A' }] },
    ];
    const { container } = render(<DigestDrawer />);
    await waitFor(() => {
      expect(container.textContent).toContain('Cursor');
      expect(container.textContent).toContain('热搜A');
    });
  });

  it('closes drawer when close button clicked', () => {
    digestDrawerOpen.value = true;
    const { getByText } = render(<DigestDrawer />);
    const closeBtn = getByText('关闭');
    fireEvent.click(closeBtn);
    expect(digestDrawerOpen.value).toBe(false);
  });

  it('shows skeleton loader when digestLoading=true', () => {
    const originalFetch = api.digestFetchSections;
    api.digestFetchSections = () => new Promise(() => {});
    try {
      digestDrawerOpen.value = true;
      digestLoading.value = true;
      const { container } = render(<DigestDrawer />);
      expect(container.querySelector('.digest-drawer__skeleton')).toBeTruthy();
    } finally {
      api.digestFetchSections = originalFetch;
    }
  });
});
