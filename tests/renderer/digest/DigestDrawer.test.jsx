// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import { DigestDrawer } from '../../../src/renderer/digest/DigestDrawer.jsx';
import { digestDrawerOpen, digestSections, digestLines, digestDate, digestLoading } from '../../../src/renderer/digest/digest-store.js';

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

  it('renders drawer with empty state when open and no sections', () => {
    digestDrawerOpen.value = true;
    const { container } = render(<DigestDrawer />);
    expect(container.textContent).toMatch(/今天没有重要变化/);
  });

  it('renders one section per kind in digestSections', () => {
    digestDrawerOpen.value = true;
    digestDate.value = '2026-06-20';
    digestSections.value = [
      { kind: 'updates', items: [{ name: 'Cursor', latest_version: '3.6.33' }] },
      { kind: 'hot', items: [{ title: '热搜A' }] },
    ];
    const { container } = render(<DigestDrawer />);
    expect(container.textContent).toContain('Cursor');
    expect(container.textContent).toContain('热搜A');
  });

  it('closes drawer when close button clicked', () => {
    digestDrawerOpen.value = true;
    const { getByText } = render(<DigestDrawer />);
    const closeBtn = getByText('×');
    fireEvent.click(closeBtn);
    expect(digestDrawerOpen.value).toBe(false);
  });

  it('shows loading indicator when digestLoading=true', () => {
    digestDrawerOpen.value = true;
    digestLoading.value = true;
    const { container } = render(<DigestDrawer />);
    expect(container.textContent).toMatch(/加载中|loading/i);
  });
});
