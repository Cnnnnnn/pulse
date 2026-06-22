/**
 * src/renderer/twitter-serenity/store.js
 *
 * Serenity 面板的 Preact signals state. 跟 ithome/store.js 同款模式.
 */

import { signal } from "@preact/signals";

export const serenityTweets = signal([]);
export const serenityLoading = signal(false);
export const serenityError = signal(null);
export const serenityLastFetchedAt = signal(null);
export const serenityDegraded = signal(false);
export const serenitySources = signal([]);

export function resetSerenityStore() {
  serenityTweets.value = [];
  serenityLoading.value = false;
  serenityError.value = null;
  serenityLastFetchedAt.value = null;
  serenityDegraded.value = false;
  serenitySources.value = [];
}
