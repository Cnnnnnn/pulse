/**
 * src/renderer/digest/DigestDrawer.jsx
 *
 * Phase I1+I5: 480px right-side drawer rendering all digest sections.
 * Driven by digest-store signals. Fetches sections on open.
 */
import { useEffect } from 'preact/hooks';
import {
  digestDrawerOpen,
  digestSections,
  digestLines,
  digestDate,
  digestLoading,
} from './digest-store.js';
import { api } from '../api.js';
import { DigestSection } from './DigestSection.jsx';

export function DigestDrawer() {
  const open = digestDrawerOpen.value;
  const sections = digestSections.value;
  const loading = digestLoading.value;
  const date = digestDate.value;

  useEffect(() => {
    if (!open) return;
    digestLoading.value = true;
    api.digestFetchSections().then((resp) => {
      if (resp && resp.ok) {
        digestSections.value = resp.sections || [];
        digestLines.value = resp.lines || [];
        digestDate.value = resp.date || null;
      }
    }).finally(() => {
      digestLoading.value = false;
    });
  }, [open]);

  if (!open) return null;

  function close() {
    digestDrawerOpen.value = false;
  }

  return (
    <aside class="digest-drawer" role="complementary">
      <header class="digest-drawer__header">
        <span class="digest-drawer__title">每日早报</span>
        {date && <span class="digest-drawer__date">{date}</span>}
        <button class="digest-drawer__close" onClick={close} aria-label="关闭">×</button>
      </header>
      <div class="digest-drawer__body">
        {loading && <div class="digest-drawer__loading">加载中...</div>}
        {!loading && sections.length === 0 && (
          <div class="digest-drawer__empty">今天没有重要变化</div>
        )}
        {!loading && sections.map((s, i) => (
          <DigestSection key={i} section={s} />
        ))}
      </div>
    </aside>
  );
}
