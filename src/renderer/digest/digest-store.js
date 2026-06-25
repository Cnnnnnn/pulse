/**
 * src/renderer/digest/digest-store.js
 *
 * Phase I1+I5: signals for the digest drawer + push state.
 *
 * History: digestDrawerOpen / digestConfigMode were originally in
 * src/renderer/store/ai-store.js (added for the AI digest drawer).
 * Migrated here in Phase I1. aiTasksDrawerOpen split out so daily digest
 * (DigestDrawer) and AI tasks (AITasksDrawer) no longer share one boolean.
 */
import { signal } from "@preact/signals";

/** Daily digest drawer (DigestDrawer) — opened via IPC onDigestOpen */
export const digestDrawerOpen = signal(false);
/** AI tasks drawer (AITasksDrawer) — Header calendar button */
export const aiTasksDrawerOpen = signal(false);
export const digestConfigMode = signal(false);

// Phase I1+I5: pure-state signals driven by IPC push + drawer fetch
export const digestSections = signal([]); // [{kind, items}]
export const digestLines = signal([]);    // string[]
export const digestLoading = signal(false);
export const digestDate = signal(null);   // 'YYYY-MM-DD' from server