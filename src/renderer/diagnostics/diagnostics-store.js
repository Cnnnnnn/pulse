/**
 * src/renderer/diagnostics/diagnostics-store.js
 *
 * Phase Q6: signals for the diagnostics drawer.
 */
import { signal } from "@preact/signals";

export const diagnosticsDrawerOpen = signal(false);
export const errorEntries = signal([]);
export const errorStats = signal({ total: 0, byLevel: {}, skipped: 0 });
export const errorLoading = signal(false);