/**
 * src/renderer/digest/DigestDrawer.tsx
 *
 * Phase I1+I5: 480px right-side drawer rendering all digest sections.
 * Driven by digest-store signals. Fetches sections on open.
 */
import { useEffect } from 'preact/hooks';
import { DIGEST_UI_TITLE } from '../../shared/digest-labels.ts';
import {
  digestDrawerOpen,
  digestSections,
  digestLines,
  digestDate,
  digestLoading,
} from './digest-store.ts';
import { api } from '../api.ts';
import { DigestSection } from './DigestSection.tsx';
import { DrawerShell } from '../components/DrawerShell.tsx';
import { DrawerEmpty } from '../components/EmptyState.tsx';

export function DigestDrawer() {
  const open = digestDrawerOpen.value;
  const sections = digestSections.value;
  const loading = digestLoading.value;
  const date = digestDate.value;

  useEffect(() => {
    if (!open) return;
    digestLoading.value = true;
    const result = api.digestFetchSections();
    const p = (result && typeof result.then === 'function') ? result : Promise.resolve(null);
    p.then((resp) => {
      if (resp && resp.ok) {
        digestSections.value = resp.sections || [];
        digestLines.value = resp.lines || [];
        digestDate.value = resp.date || null;
      }
    }).finally(() => {
      digestLoading.value = false;
    });
  }, [open]);

  function close() {
    digestDrawerOpen.value = false;
  }

  return (
    <DrawerShell
      open={open}
      onClose={close}
      title={DIGEST_UI_TITLE}
      titleExtra={date ? <span class="digest-drawer__date">{date}</span> : null}
      showOverlay={false}
      overlayClass="digest-overlay"
      drawerClass="digest-drawer"
      ariaLabel={DIGEST_UI_TITLE}
    >
      {loading && <div class="digest-drawer__loading">加载中...</div>}
      {!loading && sections.length === 0 && (
        <DrawerEmpty message="今天没有重要变化" className="digest-drawer__empty" />
      )}
      {!loading && sections.map((s, i) => (
        <DigestSection key={i} section={s} />
      ))}
    </DrawerShell>
  );
}
