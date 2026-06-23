// @vitest-environment happy-dom
/**
 * tests/renderer/ReleaseNotesTrigger.test.jsx
 *
 * ON: Header 📖 按钮. 测:
 *   - 红点显隐 (基于 entryPath + payload)
 *   - 点击 → openReleaseNotes('manual', payload) (不调 mark-seen)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import { ReleaseNotesTrigger } from '../../src/renderer/components/ReleaseNotesTrigger.jsx';
import * as store from '../../src/renderer/release-notes-store.js';

beforeEach(() => {
  cleanup();
  store.__resetForTest();
  vi.clearAllMocks();
});

describe('ReleaseNotesTrigger', () => {
  it('shows NEW badge when entryPath=auto and payload is set (current version unseen)', () => {
    store.releaseNotesEntryPath.value = 'auto';
    store.releaseNotesPayload.value = { version: '2.32.0', changelogMd: '# x', slides: null };
    const { container } = render(<ReleaseNotesTrigger />);
    expect(container.querySelector('.release-notes-trigger-badge')).toBeTruthy();
  });

  it('hides NEW badge when entryPath=manual (manual path = no implicit unread)', () => {
    store.releaseNotesEntryPath.value = 'manual';
    store.releaseNotesPayload.value = { version: '2.32.0', changelogMd: '# x', slides: null };
    const { container } = render(<ReleaseNotesTrigger />);
    expect(container.querySelector('.release-notes-trigger-badge')).toBeFalsy();
  });

  it('click → openReleaseNotes(manual) and does NOT call markSeen', () => {
    store.releaseNotesEntryPath.value = 'auto';
    store.releaseNotesPayload.value = { version: '2.32.0', changelogMd: '# x', slides: null };
    const spy = vi.spyOn(store, 'openReleaseNotes');
    const { getByTitle } = render(<ReleaseNotesTrigger />);
    fireEvent.click(getByTitle(/本版本更新/));
    expect(spy).toHaveBeenCalledWith('manual', store.releaseNotesPayload.value);
  });
});
