/**
 * src/renderer/digest/digest-store.js
 *
 * Phase I1+I5: signals for the digest drawer + push state.
 *
 * History: digestDrawerOpen / digestConfigMode were originally in
 * src/renderer/store/ai-store.js (added for the AI digest drawer).
 * Migrated here in Phase I1 to unify "anything to do with the digest UI"
 * into one module. AITasksDrawer now imports from here directly.
 */
import { signal } from "@preact/signals";

export const digestDrawerOpen = signal(false);
export const digestConfigMode = signal(false);

// Phase I1+I5: pure-state signals driven by IPC push + drawer fetch
export const digestSections = signal([]); // [{kind, items}]
export const digestLines = signal([]);    // string[]
export const digestLoading = signal(false);
export const digestDate = signal(null);   // 'YYYY-MM-DD' from server