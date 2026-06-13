/**
 * src/renderer/store/ui-store.js
 *
 * Search query / filter / cached state (含 changelog_history).
 */

import { signal } from "@preact/signals";

export const cachedState = signal(null);
export const searchQuery = signal("");
export const activeFilter = signal("all");
