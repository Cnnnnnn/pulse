/**
 * src/shared/electron/state-store-adapter.d.ts
 *
 * Adapter type surface for src/main/state-store.js.
 *
 * ponytail: 1:1 mirrors the existing ~85-symbol public surface — the
 *           state-store has grown to host nearly every persisted concern
 *           (apps / mutes / last_opened / worldcup / ai prompts / usage /
 *           watchlist / startup samples / …). Forcing a fully type-safe
 *           shape for every distinct payload here would dwarf the runtime
 *           the adapter exposes.
 *
 *           The chosen line: ship an `interface`-only surface that names
 *           every export (so the 1:1 contract test holds), with passthrough
 *           return shapes typed as `unknown` for the storage-layer
 *           helpers. Upgrade path: when a new caller needs a precise
 *           payload type, narrow the relevant method's return shape in
 *           this file — never silently widen by exposing storage IO here.
 */

export type StateRecord = Record<string, unknown>;

/** Plain-object result entry from `loadAiFeedback` / `saveAiFeedback`. */
export type StateFeedbackSample = Record<string, unknown>;

/** Watchlist item post-normalization (see `normalizeWatchlistItem`). */
export type StateWatchlistItem = Record<string, unknown>;

/** Last-opened map values from `loadLastOpened` / `saveLastOpened`. */
export type StateLastOpenedMap = Record<string, unknown>;

/** LLM classify cache: `{ lowercaseAppName: categoryId }`. */
export type StateLLMClassifyMap = Record<string, string>;

/** Recovery event returned by `getLastRecoveryEvent`. */
export type StateRecoveryEvent = {
  path: string;
  backup: string | null;
  backupFailed: boolean;
  reason: "parse_failed" | "schema_failed";
  errors: string[];
  ts: number;
};

/** Catastrophic-state error class exported as `StateCorruptedError`. */
export interface StateCorruptedErrorCtor {
  new (
    message: string,
    info?: {
      path?: string;
      raw?: string | null;
      parseError?: Error | null;
      schemaErrors?: unknown[];
    },
  ): Error;
}

export interface StateStoreAdapter {
  // core load/save
  load(statePath?: string): StateRecord | null;
  saveAll(results: unknown[], statePath?: string): StateRecord;
  saveOne(result: StateRecord, statePath?: string): StateRecord;
  markNotified(names: string[], statePath?: string): StateRecord | null;
  defaultPath(): string;
  initStateStorePaths(): string;
  migrateLegacyStateIfNeeded(targetPath: string): void;
  readonly SCHEMA_VERSION: number;
  writeAtomic(filePath: string, data: unknown): void;
  patchState(
    updater: (next: StateRecord, existing: StateRecord, now: number) => void,
    statePath?: string,
    opts?: { dropAiSessionsConfig?: boolean },
  ): StateRecord;

  // mutes (Phase 27)
  isMuteActive(mute: { until?: number } | null | undefined, now: number): boolean;
  cleanExpiredMutes(mutes: StateRecord, now: number): StateRecord;
  getMutes(statePath?: string, now?: number): StateRecord;
  setMute(
    name: string,
    untilMs: number,
    reason?: string,
    statePath?: string,
  ): StateRecord;
  clearMute(name: string, statePath?: string): StateRecord;

  // last opened (Phase 29)
  loadLastOpened(statePath?: string): StateLastOpenedMap;
  saveLastOpened(map: StateLastOpenedMap, statePath?: string): StateRecord;

  // active category tab (Phase A)
  loadActiveCategory(statePath?: string): string;
  saveActiveCategory(id: string, statePath?: string): StateRecord;

  // task summaries
  readonly TASK_SUMMARIES_GC_DAYS: number;
  cleanExpiredTaskSummaries(map: StateRecord, now: number): StateRecord;
  loadTaskSummaries(statePath?: string): StateRecord;
  saveTaskSummary(entry: StateRecord & { taskKey: string }, statePath?: string): StateRecord;

  // AI sessions config
  loadAISessionsConfig(statePath?: string): StateRecord | null;
  saveAISessionsConfig(cfg: StateRecord | null, statePath?: string): StateRecord;

  // AI usage snapshot (v1 compat + v2 multi-provider)
  loadAiUsageSnapshot(statePath?: string): StateRecord | null;
  saveAiUsageSnapshot(snapshot: StateRecord, statePath?: string): StateRecord;
  loadAiUsageSnapshotProvider(
    providerId: string,
    statePath?: string,
  ): StateRecord | null;
  saveAiUsageSnapshotProvider(
    providerId: string,
    snapshot: StateRecord,
    statePath?: string,
  ): StateRecord;

  // AI usage history (v1 + v2)
  readonly USAGE_HISTORY_GC_DAYS: number;
  readonly USAGE_HISTORY_MAX_DAYS: number;
  cleanExpiredUsageHistory(days: unknown[] | null | undefined): unknown[];
  loadAiUsageHistory(statePath?: string): { days: unknown[] };
  appendAiUsageHistoryDay(
    entry: { date: string; used: number; percent?: number | null },
    statePath?: string,
  ): StateRecord;
  loadAiUsageHistoryProvider(
    providerId: string,
    statePath?: string,
  ): { days: unknown[] };
  appendAiUsageHistoryDayProvider(
    providerId: string,
    entry: { date: string; used?: number; percent: number },
    statePath?: string,
  ): StateRecord;

  // Step B LLM classify cache
  loadLLMClassifyCache(statePath?: string): StateLLMClassifyMap;
  saveLLMClassifyCache(map: StateLLMClassifyMap, statePath?: string): StateRecord;

  // Worldcup TXT / scores / bracket / match insights
  loadWorldcupTxt(statePath?: string): { txt: string; ts: number } | null;
  saveWorldcupTxt(
    entry: { txt: string; ts: number },
    statePath?: string,
  ): StateRecord;
  loadWorldcupScores(
    statePath?: string,
  ): { entries: StateRecord; ts: number } | null;
  saveWorldcupScores(
    cache: { entries: StateRecord; ts: number },
    statePath?: string,
  ): StateRecord;
  loadWorldcupMatchInsights(
    statePath?: string,
  ): { entries: StateRecord; ts: number } | null;
  saveWorldcupMatchInsights(
    cache: { entries: StateRecord; ts: number },
    statePath?: string,
  ): StateRecord;
  loadWorldcupBracket(statePath?: string): StateRecord | null;
  saveWorldcupBracket(snapshot: StateRecord, statePath?: string): StateRecord;

  // Phase Q8 — corruption recovery
  readonly StateCorruptedError: StateCorruptedErrorCtor;
  loadOrRecover(statePath?: string): StateRecord | null;
  getLastRecoveryEvent(): StateRecoveryEvent | null;
  _setStatePathForTest(p: string): void;

  // Phase I5 — daily digest
  saveDailyDigest(
    cfg: {
      enabled?: boolean;
      time?: string;
      last_push_date?: string | null;
    },
    statePath?: string,
  ): StateRecord;
  loadDailyDigest(statePath?: string): {
    enabled: boolean;
    time: string;
    last_push_date: string | null;
  };

  // Phase v1 — tray menu prefs
  loadTrayMenuPrefs(statePath?: string): {
    version: number;
    segments: Record<string, boolean>;
  };
  saveTrayMenuPrefs(
    prefs: { version?: number; segments?: Record<string, boolean> },
    statePath?: string,
  ): StateRecord;

  // Phase Q1 v2 — startup samples
  loadStartupSamples(statePath?: string): Array<{
    ts: number;
    readyMs: number;
  }>;
  saveStartupSamples(
    samples: Array<{ ts: number; readyMs: number }>,
    statePath?: string,
  ): StateRecord;

  // A8 — AI feedback samples
  loadAiFeedback(statePath?: string): StateFeedbackSample[];
  saveAiFeedback(
    samples: StateFeedbackSample[],
    statePath?: string,
  ): StateRecord | unknown;

  // P71 — token budget
  loadTokenSpend(statePath?: string): Record<string, number>;
  saveTokenSpend(
    spendMap: Record<string, number>,
    statePath?: string,
  ): StateRecord;
  loadTokenBudgetConfig(statePath?: string): {
    dailyLimit: number;
    mode: "warn" | "block";
  };
  saveTokenBudgetConfig(
    cfg: { dailyLimit: number; mode: "warn" | "block" },
    statePath?: string,
  ): StateRecord;

  // I2 — watchlist + helpers
  loadWatchlist(statePath?: string): StateWatchlistItem[];
  saveWatchlist(
    list: StateWatchlistItem[],
    statePath?: string,
  ): StateRecord;
  normalizeWatchlistItem(w: StateWatchlistItem | null | undefined): StateWatchlistItem | null;
  watchlistItemKey(item: StateWatchlistItem | null | undefined): string;

  // Task 15 — overview AI cache
  loadOverviewCache(
    statePath?: string,
  ): { text: string; fetchedAt: number } | null;
  saveOverviewCache(
    entry: { text: string; fetchedAt: number },
    statePath?: string,
  ): StateRecord;

  // ON — release notes onboarding
  getLastSeenRelease(
    statePath?: string,
  ): { version: string; at: number } | null;
  setLastSeenRelease(
    version: string,
    at: number,
    statePath?: string,
  ): StateRecord;

  // I6 v2 — wechat-hot read ids
  loadWechatHotRead(statePath?: string): Record<string, number>;
  saveWechatHotRead(
    readIds: Record<string, number>,
    statePath?: string,
  ): StateRecord;

  // A7 — AI prompt templates
  loadAiPrompts(
    statePath?: string,
  ): Record<string, { system: string; rules: string }>;
  saveAiPrompts(
    prompts: Record<string, { system: string; rules: string }>,
    statePath?: string,
  ): StateRecord;

  // A2 — upgrade advice cache
  loadUpgradeAdviceCache(statePath?: string): Record<string, unknown>;
  loadUpgradeAdviceEntry(
    cacheKey: string,
    statePath?: string,
  ): unknown;
  saveUpgradeAdviceEntry(
    entry: StateRecord & { cacheKey: string },
    statePath?: string,
  ): StateRecord;

  // A1 — changelog summary cache
  loadChangelogSummaryCache(
    statePath?: string,
  ): Record<string, unknown>;
  loadChangelogSummaryEntry(
    cacheKey: string,
    statePath?: string,
  ): unknown;
  saveChangelogSummaryEntry(
    entry: StateRecord & { cacheKey: string },
    statePath?: string,
  ): StateRecord;

  // A4 — AI usage alert prefs
  loadAiUsageAlertPrefs(statePath?: string): {
    enabled: boolean;
    absMinPct: number;
    spikeRatio: number;
    reAlertStepPct: number;
    lastNotified: Record<string, unknown>;
  };
  saveAiUsageAlertPrefs(
    patch: Partial<{
      enabled: boolean;
      absMinPct: number;
      spikeRatio: number;
      reAlertStepPct: number;
      lastNotified: Record<string, unknown>;
    }>,
    statePath?: string,
  ): StateRecord;

  // A3 — search index injection
  setSearchIndex(si: unknown): void;

  // P-N — HomeGrid nav anchor
  loadLastActiveNav(statePath?: string): string | null;
  saveLastActiveNav(key: string, statePath?: string): StateRecord;
}
