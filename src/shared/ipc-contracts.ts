/**
 * Typed IPC boundary for the domains that already have stable renderer/main
 * contracts. Runtime channel strings remain in preload/main for now; this
 * file makes their argument, response, and event shapes one shared surface.
 */

import type { FinArticle } from "./finance-types";
import type {
  MetricsSample,
  MetricsSummary,
  StartupSnapshot,
} from "./electron/diagnostics-adapter";
import type { Callback, Unsubscribe } from "./preload-types";

export interface IpcFailure {
  ok: false;
  reason?: string;
  error?: string;
  message?: string;
}

export interface SidenavBadgePayload {
  key: string;
  count: number;
}

export type StateRecoveryReason = "parse_failed" | "schema_failed" | string;

export interface StateRecoveredPayload {
  path: string;
  backup: string | null;
  backupFailed: boolean;
  reason: StateRecoveryReason;
  errors: string[];
  ts: number;
}

export interface MainErrorPayload {
  kind: string;
  message: string;
  name: string;
  ts: number;
  [key: string]: unknown;
}

/** Common main → renderer event bridges; every subscription is disposable. */
export interface CoreEventsApiContract {
  onCheckProgress(cb: Callback<CheckProgressPayload>): Unsubscribe;
  onCheckStarted(cb: Callback<CheckStartedPayload>): Unsubscribe;
  onCheckDetecting(cb: Callback<CheckDetectingPayload>): Unsubscribe;
  onStartCheck(cb: () => void): Unsubscribe;
  onAutoCheckFinished(cb: Callback<CheckFinishedPayload>): Unsubscribe;
  onCheckFinished(cb: Callback<CheckFinishedPayload>): Unsubscribe;
  onTrayFocus(cb: Callback<TrayFocusPayload>): Unsubscribe;
  onBulkUpgradeProgress(cb: Callback<BulkUpgradeProgressPayload>): Unsubscribe;
  onBulkUpgradeDone(cb: Callback<BulkUpgradeSummary>): Unsubscribe;
  onLastOpenedUpdated(cb: Callback<LastOpenedUpdatedPayload>): Unsubscribe;
  onAiTaskSummaryUpdated(cb: Callback<AiTaskSummaryUpdatedPayload>): Unsubscribe;
  onAiSessionsConfigUpdated(cb: Callback<AiSessionsConfigUpdatedPayload>): Unsubscribe;
  onSidenavBadge(cb: Callback<SidenavBadgePayload>): Unsubscribe;
  onStateRecovered(cb: Callback<StateRecoveredPayload>): Unsubscribe;
  onDigestOpen(cb: Callback<DigestOpenPayload>): Unsubscribe;
  onMainError(cb: Callback<MainErrorPayload>): Unsubscribe;
}

export interface ErrorEntry {
  id: string;
  ts: number;
  source: string;
  level: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ErrorStats {
  total: number;
  byLevel: Record<string, number>;
  skipped: number;
}

export interface ErrorQueryOptions {
  since?: number;
  limit?: number;
  level?: string;
}

export interface ErrorEntriesResponse {
  ok: boolean;
  entries: ErrorEntry[];
  stats: ErrorStats;
  reason?: string;
  error?: string;
}

export interface ErrorCopyResponse {
  ok: boolean;
  text: string;
  reason?: string;
  error?: string;
}

export interface ErrorExportResponse {
  ok: boolean;
  path?: string;
  sizeBytes?: number;
  fileCount?: number;
  reason?: string;
  error?: string;
}

export interface ErrorClearResponse {
  ok: boolean;
  removed?: number;
  reason?: string;
  error?: string;
}

export interface ErrorBasicResponse {
  ok: boolean;
  reason?: string;
  error?: string;
}

export interface ErrorReportEntry {
  level?: string;
  message?: string;
  stack?: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ErrorReportResponse {
  ok: boolean;
  id?: string;
  reason?: string;
  error?: string;
}

export interface ErrorAppendedPayload {
  id: string;
  ts: number;
  level: string;
  source: string;
}

export interface DiagnosticsFetchOptions {
  sinceMs?: number;
  topN?: number;
}

export interface DiagnosticsTopFailure {
  source: string;
  message: string;
  count: number;
  firstTs: number;
  lastTs: number;
}

export interface DiagnosticsFetchResponse {
  ok: boolean;
  startup?: StartupSnapshot | null;
  metrics?: MetricsSummary;
  topFailures?: DiagnosticsTopFailure[];
  stats?: ErrorStats;
  sinceMs?: number;
  reason?: string;
  error?: string;
}

export interface DiagnosticsSamplesResponse {
  ok: boolean;
  samples?: MetricsSample[];
  reason?: string;
  error?: string;
}

export interface DiagnosticsApiContract {
  errorFetchEntries(opts: ErrorQueryOptions): Promise<ErrorEntriesResponse>;
  errorCopyAll(): Promise<ErrorCopyResponse>;
  errorExportZip(opts?: Record<string, unknown>): Promise<ErrorExportResponse>;
  errorClearOld(opts?: Record<string, unknown>): Promise<ErrorClearResponse>;
  diagnosticsFetch(opts: DiagnosticsFetchOptions): Promise<DiagnosticsFetchResponse>;
  diagnosticsFetchSamples(): Promise<DiagnosticsSamplesResponse>;
  errorOpenFolder(): Promise<ErrorBasicResponse>;
  errorReport(entry: ErrorReportEntry): Promise<ErrorReportResponse>;
  onErrorAppended(cb: Callback<ErrorAppendedPayload>): Unsubscribe;
}

export type SelfUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export interface SelfUpdateState {
  status: SelfUpdateStatus;
  available: boolean;
  version: string | null;
  releaseNotes: string | null;
  downloadPercent: number;
  readyToInstall: boolean;
  error: string | null;
  lastCheckedAt: number | null;
}

export interface SelfUpdateGetStateSuccess {
  ok: true;
  state: SelfUpdateState;
}

export interface SelfUpdateGetStateFailure extends IpcFailure {
  ok: false;
}

export type SelfUpdateGetStateResponse =
  | SelfUpdateGetStateSuccess
  | SelfUpdateGetStateFailure;

export interface SelfUpdateActionSuccess {
  ok: true;
}

export interface SelfUpdateActionFailure extends IpcFailure {
  ok: false;
}

export type SelfUpdateActionResponse =
  | SelfUpdateActionSuccess
  | SelfUpdateActionFailure;

export interface SelfUpdateApiContract {
  selfUpdateGetState(): Promise<SelfUpdateGetStateResponse>;
  selfUpdateCheck(): Promise<SelfUpdateActionResponse>;
  selfUpdateInstall(): Promise<SelfUpdateActionResponse>;
}

export interface AiPromptValue {
  system: string;
  rules: string;
  fewShot: string;
  isDefault: boolean;
}

export type AiPromptsLoadResponse = Record<string, AiPromptValue>;

export interface AiPromptDraft {
  system?: string;
  rules?: string;
  fewShot?: string;
}

export type AiPromptsSavePayload = Record<string, AiPromptDraft>;

export interface AiPromptsSaveResponse {
  ok: boolean;
  reason?: string;
  error?: string;
}

export interface AiPromptsResetResponse {
  ok: boolean;
  key?: string;
  reason?: string;
  error?: string;
}

export interface AiPromptsApiContract {
  aiPromptsLoad(): Promise<AiPromptsLoadResponse>;
  aiPromptsSave(payload: AiPromptsSavePayload): Promise<AiPromptsSaveResponse>;
  aiPromptsReset(key: string): Promise<AiPromptsResetResponse>;
  onAiPromptsUpdated(cb: () => void): Unsubscribe;
}

export type SearchSource = "news" | "ai-task" | "reminder" | "fund" | "app";

export type SearchCounts = Record<SearchSource, number>;

export interface SearchDocument {
  id: string;
  source: string;
  nativeId: string;
  title: string;
  snippet?: string;
  searchText?: string;
  payload?: Record<string, unknown>;
}

export interface SearchResult extends SearchDocument {
  matchedSnippet: string;
}

export interface SearchQueryResponse {
  results: SearchResult[];
  counts: SearchCounts;
}

export interface SearchApiContract {
  searchQuery(q: string, source?: string | null): Promise<SearchQueryResponse>;
  searchUpsert(doc: SearchDocument): Promise<void>;
}

export interface AiTaskSummary {
  title: string;
  userGoal: string;
  outcome: string;
  provider: string | null;
  model: string | null;
  generatedAt: number;
  stale: boolean;
}

export interface AiTask {
  taskKey: string;
  sessionId: string;
  appName: string;
  title: string;
  project: string;
  startedAt: number;
  endedAt: number;
  msgCount: number;
  jumpTarget: string | null;
  contentHash: string;
  summary: AiTaskSummary | null;
}

export interface AiTaskSourceStat {
  appName: string;
  installed: boolean;
  metaCount: number;
  matchedCount: number;
}

export interface AiTasksListOptions {
  dateKey?: string;
}

export interface AiTasksListSuccess {
  ok: true;
  dateKey: string;
  collectedAt: number;
  tasks: AiTask[];
  sourceStats: AiTaskSourceStat[];
}

export interface AiTasksListFailure extends IpcFailure {
  ok: false;
  tasks?: AiTask[];
  sourceStats?: AiTaskSourceStat[];
}

export type AiTasksListResponse = AiTasksListSuccess | AiTasksListFailure;

export interface AiTasksSummarizeOptions {
  dateKey?: string;
  taskKeys: string[];
}

export interface AiTaskSummaryFailure {
  taskKey: string | null;
  message: string;
}

export interface AiTasksSummarizeResponse {
  ok: boolean;
  dateKey?: string;
  results?: AiTask[];
  failures?: AiTaskSummaryFailure[];
  reason?: string;
  error?: string;
}

export type AiTaskSummaryUpdatedPayload =
  | { dateKey: string; taskKey: string; ok: true; task: AiTask }
  | { dateKey: string; taskKey: string; ok: false; error: string };

export interface AiTasksApiContract {
  listAiTasks(opts?: AiTasksListOptions): Promise<AiTasksListResponse>;
  summarizeAiTasks(
    opts: AiTasksSummarizeOptions,
  ): Promise<AiTasksSummarizeResponse>;
  onAiTaskSummaryUpdated(cb: Callback<AiTaskSummaryUpdatedPayload>): Unsubscribe;
}

export interface AiSessionsCloudConfig {
  providerId?: string;
  model?: string;
  baseUrl?: string;
  [key: string]: unknown;
}

export interface AiSessionsConfig {
  enabled?: boolean;
  provider?: string;
  cloud?: AiSessionsCloudConfig | null;
  locale?: string;
  [key: string]: unknown;
}

export interface AiSessionOpenSuccess {
  ok: true;
  mode: "external" | "openPath";
}

export interface AiSessionOpenFailure extends IpcFailure {
  ok: false;
}

export type AiSessionOpenResponse = AiSessionOpenSuccess | AiSessionOpenFailure;

export interface AiKeySetResponse {
  ok: boolean;
  reason?: string;
  error?: string;
}

export interface AiKeyClearResponse {
  ok: boolean;
  cleared?: boolean;
  reason?: string;
  error?: string;
}

export interface AiKeyStatus {
  hasKey: boolean;
  available: boolean;
  decryptOk?: boolean;
}

export interface AiKeyStatusSuccess {
  ok: true;
  hasKey: boolean;
  available: boolean;
  decryptOk?: boolean;
}

export interface AiKeyStatusFailure extends IpcFailure {
  ok: false;
  hasKey: false;
  available: false;
}

export type AiKeyStatusResponse = AiKeyStatusSuccess | AiKeyStatusFailure;

export interface AiHealthcheckOptions {
  providerId?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface AiHealthcheckResponse {
  ok: boolean;
  error?: string;
  latencyMs?: number;
  status?: number;
  [key: string]: unknown;
}

export interface AiSessionsConfigResponse {
  ok: boolean;
  config?: AiSessionsConfig | null;
  reason?: string;
  error?: string;
}

export interface AiSessionsConfigUpdatedPayload {
  config: AiSessionsConfig | null;
}

export interface AiSharedConfigResponse {
  ok: boolean;
  config?: AiSessionsConfig | null;
  ready: boolean;
  reason: string | null;
  providerId: string | null;
  model: string | null;
  error?: string;
}

export interface AiSessionsApiContract {
  openSession(target: string): Promise<AiSessionOpenResponse>;
  setAiKey(providerId: string, apiKey: string): Promise<AiKeySetResponse>;
  clearAiKey(providerId: string): Promise<AiKeyClearResponse>;
  hasAiKey(providerId: string): Promise<AiKeyStatusResponse>;
  aiHealthcheck(opts: AiHealthcheckOptions): Promise<AiHealthcheckResponse>;
  getAiSessionsConfig(): Promise<AiSessionsConfigResponse>;
  saveAiSessionsConfig(
    config: AiSessionsConfig | null,
  ): Promise<AiSessionsConfigResponse>;
  onAiSessionsConfigUpdated(
    cb: Callback<AiSessionsConfigUpdatedPayload>,
  ): Unsubscribe;
}

export interface AiSharedConfigApiContract {
  getAiSharedConfig(): Promise<AiSharedConfigResponse>;
}

export type AiFeedbackFeature = "advice" | "summary" | string;
export type AiFeedbackVote = "up" | "down";
export type AiFeedbackImplicit = "upgraded" | "snoozed" | "refreshed" | string;

export interface AiFeedbackSample {
  id: string;
  feature: AiFeedbackFeature;
  appName: string;
  version: string | null;
  rec: string | null;
  confidence: string | null;
  vote: AiFeedbackVote | null;
  implicit: AiFeedbackImplicit | null;
  ts: number;
}

export interface AiFeedbackRecordPayload {
  feature: AiFeedbackFeature;
  appName: string;
  version?: string;
  rec?: string;
  confidence?: string;
  vote?: AiFeedbackVote;
  implicit?: AiFeedbackImplicit;
  ts: number;
}

export interface AiFeedbackRecordResponse {
  ok: boolean;
  reason?: string;
  error?: string;
}

export interface AiFeedbackExportResponse {
  ok: boolean;
  samples?: AiFeedbackSample[];
  reason?: string;
  error?: string;
}

export interface AiFeedbackApiContract {
  feedbackRecord(
    payload: AiFeedbackRecordPayload,
  ): Promise<AiFeedbackRecordResponse>;
  feedbackExport(): Promise<AiFeedbackExportResponse>;
}

export type TokenBudgetMode = "warn" | "block";

export interface TokenBudgetConfig {
  dailyLimit: number;
  mode: TokenBudgetMode;
}

export interface TokenBudgetGetResponse {
  ok: boolean;
  config?: TokenBudgetConfig;
  todaySpend?: number;
  reason?: string;
  error?: string;
}

export interface TokenBudgetSetResponse {
  ok: boolean;
  reason?: string;
  error?: string;
}

export interface TokenBudgetApiContract {
  tokenBudgetGet(): Promise<TokenBudgetGetResponse>;
  tokenBudgetSet(config: TokenBudgetConfig): Promise<TokenBudgetSetResponse>;
}

export interface AiUpgradeAdviceOptions {
  appName: string;
  force?: boolean;
}

export type AiUpgradeRecommendation = "upgrade" | "wait" | "skip";
export type AiAdviceConfidence = "high" | "medium" | "low";

export interface AiUpgradeAdviceResponse {
  ok: boolean;
  cached?: boolean;
  appName?: string;
  cacheKey?: string;
  latestVersion?: string;
  contentHash?: string;
  generatedAt?: number;
  recommendation?: AiUpgradeRecommendation;
  confidence?: AiAdviceConfidence;
  summary?: string;
  reasons?: string[];
  reason?: string;
  error?: string;
}

export interface AiChangelogSummaryOptions {
  appName: string;
  force?: boolean;
}

export interface AiChangelogSummaryResponse {
  ok: boolean;
  cached?: boolean;
  appName?: string;
  cacheKey?: string;
  latestVersion?: string;
  contentHash?: string;
  generatedAt?: number;
  oneLiner?: string;
  highlights?: string[];
  reason?: string;
  error?: string;
}

export interface AiAdviceApiContract {
  upgradeAdviceFetch(
    opts: AiUpgradeAdviceOptions,
  ): Promise<AiUpgradeAdviceResponse>;
  changelogSummaryFetch(
    opts: AiChangelogSummaryOptions,
  ): Promise<AiChangelogSummaryResponse>;
}

export interface AppUpdateResult {
  name: string;
  status?: string;
  has_update?: boolean;
  installed_version?: string | null;
  latest_version?: string | null;
  source?: string;
  note?: string;
  bundle?: string;
  brew_cask?: string;
  [key: string]: unknown;
}

export interface CheckStartedPayload {
  count: number;
  appNames: string[];
  ts: number;
  jobId?: string;
}

export interface CheckProgressPayload extends AppUpdateResult {
  task?: string;
  _sessionId?: string;
  ts?: number;
}

export interface CheckDetectingPayload {
  name: string;
  _sessionId?: string;
  [key: string]: unknown;
}

export interface CheckFinishedPayload {
  count: number;
  ts: number;
  stale: string[];
  freshestTs: number;
  jobId?: string;
  cancelled?: boolean;
}

export interface TrayFocusPayload {
  tab: string;
  rowName?: string;
  action?: "upgrade" | string;
}

export interface BrewUpgradeResponse {
  success: boolean;
  output?: string;
  error?: string;
  [key: string]: unknown;
}

export interface AppIconSuccess {
  dataUrl: string;
}

export interface AppIconFailure {
  error: "not_found" | "invalid" | "threw" | string;
}

export type AppIconResponse = AppIconSuccess | AppIconFailure;

export interface UpgradeActionsApiContract {
  brewUpgrade(cask: string): Promise<BrewUpgradeResponse>;
  getAppIcon(bundlePath: string): Promise<AppIconResponse>;
}

export interface CheckAlreadyRunningResponse {
  started: false;
  reason?: string;
  error?: string;
}

export interface CheckCancelResponse {
  ok: boolean;
  jobId?: string;
  queued?: number;
  running?: number;
  reason?: string;
}

export type CheckUpdatesResponse =
  | AppUpdateResult[]
  | CheckAlreadyRunningResponse;

export interface UpdateCheckApiContract {
  checkUpdates(): Promise<CheckUpdatesResponse>;
  cancelCheck(jobId?: string): Promise<CheckCancelResponse>;
  versionsRunCheck(): Promise<CheckUpdatesResponse>;
}

export interface CommandSearchPayload {
  q?: string;
}

export type CommandSearchResultKind = "action" | "view";

export interface CommandSearchResult {
  id: string;
  label: string;
  kind: CommandSearchResultKind;
}

export interface CommandSearchResponse {
  ok: boolean;
  results: CommandSearchResult[];
  reason?: string;
  error?: string;
}

export interface VersionsApiContract {
  versionsCommandSearch(q: string): Promise<CommandSearchResponse>;
}

export interface GithubRequestPayload {
  input: string;
  token?: string;
}

export interface GithubProjectMeta {
  name: string;
  description: string;
  stars: number;
  language: string;
  homepage: string;
  htmlUrl: string;
  defaultBranch: string;
  license: string;
  topics: string[];
}

export interface GithubFetchSuccess {
  ok: true;
  owner: string;
  repo: string;
  meta: GithubProjectMeta;
  readme: string;
}

export interface GithubFetchFailure extends IpcFailure {
  ok: false;
  status?: number;
  permanent?: boolean;
}

export type GithubFetchResponse = GithubFetchSuccess | GithubFetchFailure;

export interface GithubRelease {
  version: string;
  tagName: string;
  publishedAt: number;
  notesUrl: string;
  body: string;
}

export interface GithubReleaseSuccess {
  ok: true;
  release: GithubRelease | null;
  releases: GithubRelease[];
}

export interface GithubReleaseFailure extends IpcFailure {
  ok: false;
  status?: number;
  permanent?: boolean;
  retryAfter?: number;
  rateLimitRemaining?: number;
  detail?: string;
}

export type GithubReleaseResponse = GithubReleaseSuccess | GithubReleaseFailure;

export interface AiReadmeParsePayload {
  projectName: string;
  description?: string;
  readme: string;
}

export interface AiReadmeParseResult {
  summary: string;
  usage: string;
  features: string[];
  scenarios: string[];
  tags: string[];
}

export interface AiReadmeParseSuccess {
  ok: true;
  result: AiReadmeParseResult;
}

export interface AiReadmeParseFailure extends IpcFailure {
  ok: false;
}

export type AiReadmeParseResponse =
  | AiReadmeParseSuccess
  | AiReadmeParseFailure;

export interface GithubApiContract {
  githubFetch(input: string, token?: string): Promise<GithubFetchResponse>;
  githubFetchRelease(
    input: string,
    token?: string,
  ): Promise<GithubReleaseResponse>;
  aiParseReadme(
    payload: AiReadmeParsePayload,
  ): Promise<AiReadmeParseResponse>;
}

export interface MuteEntry {
  until: number;
  reason: string;
}

export type MutesMap = Record<string, MuteEntry>;

export interface MutesResponse {
  mutes: MutesMap;
}

export interface MuteMutationResponse extends MutesResponse {
  ok: boolean;
  reason?: string;
  error?: string;
}

export interface MutesApiContract {
  getMutes(): Promise<MutesResponse>;
  setMute(name: string, durationSec: number): Promise<MuteMutationResponse>;
  clearMute(name: string): Promise<MuteMutationResponse>;
}

export type LastOpenedSource = "spotlight" | "atime" | "unknown" | string;

export interface LastOpenedEntry {
  ms: number | null;
  source: LastOpenedSource;
}

export type LastOpenedMap = Record<string, LastOpenedEntry>;

export interface LastOpenedResponse {
  lastOpened: LastOpenedMap;
}

export interface LastOpenedRefreshResponse {
  ok: boolean;
  count: number;
  reason?: string;
  error?: string;
}

export interface LastOpenedUpdatedPayload {
  lastOpened: LastOpenedMap;
}

export interface LastOpenedApiContract {
  getLastOpened(): Promise<LastOpenedResponse>;
  refreshLastOpened(): Promise<LastOpenedRefreshResponse>;
  onLastOpenedUpdated(cb: Callback<LastOpenedUpdatedPayload>): Unsubscribe;
}

export interface WindowToggleMaximizeResponse {
  maximized: boolean;
}

export interface WindowApiContract {
  windowMinimize(): Promise<void>;
  windowToggleMaximize(): Promise<WindowToggleMaximizeResponse>;
  windowClose(): Promise<void>;
}

export interface OpenUrlResponse {
  ok: boolean;
  reason?: string;
  error?: string;
}

export interface OpenUrlApiContract {
  openUrl(url: string): Promise<OpenUrlResponse>;
}

export interface BulkUpgradeItem {
  id: string;
  name?: string;
  source?: string;
  current?: string;
  latest?: string;
  cask?: string;
  bundleName?: string;
  trackId?: string;
  [key: string]: unknown;
}

export type BulkUpgradeProgressStatus =
  | "running"
  | "done"
  | "failed"
  | "skipped";

export interface BulkUpgradeProgressPayload {
  id: string;
  status: BulkUpgradeProgressStatus;
  action?: string;
  reason?: string;
  error?: string;
  output?: string;
  durationMs?: number;
}

export interface BulkUpgradeSucceeded {
  id: string;
  durationMs: number;
  action: string;
}

export interface BulkUpgradeFailed {
  id: string;
  error: string;
  output?: string;
  action?: string;
}

export interface BulkUpgradeSkipped {
  id: string;
  reason: string;
}

export interface BulkUpgradeSummary {
  succeeded: BulkUpgradeSucceeded[];
  failed: BulkUpgradeFailed[];
  skipped: BulkUpgradeSkipped[];
  cancelled: boolean;
}

export interface BulkUpgradeStartResponse {
  ok: boolean;
  count?: number;
  reason?: string;
  error?: string;
}

export interface BulkUpgradeCancelResponse {
  ok: boolean;
  reason?: string;
  error?: string;
}

export interface BulkUpgradeApiContract {
  bulkUpgradeStart(
    items: BulkUpgradeItem[],
  ): Promise<BulkUpgradeStartResponse>;
  bulkUpgradeCancel(): Promise<BulkUpgradeCancelResponse>;
  onBulkUpgradeProgress(
    cb: Callback<BulkUpgradeProgressPayload>,
  ): Unsubscribe;
  onBulkUpgradeDone(cb: Callback<BulkUpgradeSummary>): Unsubscribe;
}

export interface ActiveCategoryResponse {
  activeCategory: string;
}

export interface ActiveCategoryMutationResponse extends ActiveCategoryResponse {
  ok: boolean;
  reason?: string;
  error?: string;
}

export interface LastActiveNavResponse {
  lastActiveNav: string | null;
}

export interface LastActiveNavMutationResponse extends LastActiveNavResponse {
  ok: boolean;
  reason?: string;
  error?: string;
}

export interface NavigationPersistenceApiContract {
  getActiveCategory(): Promise<ActiveCategoryResponse>;
  saveActiveCategory(id: string): Promise<ActiveCategoryMutationResponse>;
  getLastActiveNav(): Promise<LastActiveNavResponse>;
  saveLastActiveNav(key: string): Promise<LastActiveNavMutationResponse>;
}

export interface ConfiguredApp {
  name: string;
  bundle: string;
  download_url?: string;
  detectors?: unknown[];
  [key: string]: unknown;
}

export interface AppConfig {
  check_on_launch: boolean;
  apps: ConfiguredApp[];
  [key: string]: unknown;
}

export interface CachedAppState {
  name?: string;
  [key: string]: unknown;
}

export interface CachedState {
  apps?: Record<string, CachedAppState>;
  [key: string]: unknown;
}

export interface ConfigStateApiContract {
  getConfig(): Promise<AppConfig>;
  getCachedState(): Promise<CachedState | null>;
}

export interface DigestUpdateItem {
  name: string;
  latest_version: string;
  installed_version: string;
}

export interface DigestHotItem {
  title: string;
}

export interface DigestNewsItem {
  title: string;
  url: string;
}

export interface DigestFundItem {
  code: string;
  name: string;
  today_change_pct: number;
}

export interface DigestAiUsageItem {
  provider: string;
  percent: number;
}

export type DigestSection =
  | { kind: "updates"; items: DigestUpdateItem[] }
  | { kind: "hot"; items: DigestHotItem[] }
  | { kind: "news"; items: DigestNewsItem[] }
  | { kind: "funds"; items: DigestFundItem[] }
  | { kind: "ai_usage"; items: DigestAiUsageItem[] };

export interface DigestFetchSuccess {
  ok: true;
  date: string;
  sections: DigestSection[];
  lines: string[];
}

export interface DigestFetchFailure extends IpcFailure {
  ok: false;
  sections: DigestSection[];
  lines: string[];
}

export type DigestFetchResponse = DigestFetchSuccess | DigestFetchFailure;

export interface DigestUpdateSettingsPayload {
  enabled?: boolean;
  time?: string;
}

export interface DigestUpdateSettingsResponse {
  ok: boolean;
  reason?: string;
  error?: string;
}

export interface DigestOpenPayload {
  date: string;
}

export interface DigestApiContract {
  digestFetchSections(): Promise<DigestFetchResponse>;
  digestUpdateSettings(
    payload: DigestUpdateSettingsPayload,
  ): Promise<DigestUpdateSettingsResponse>;
  onDigestOpen(cb: Callback<DigestOpenPayload>): Unsubscribe;
}

export type AiUsageProvider = "minimax" | "glm";

export interface AiUsageWindow {
  total: number | null;
  remaining: number | null;
  used: number | null;
  usedPercent: number | null;
  remainingPercent?: number | null;
  resetAt: number | null;
  resetInSec: number | null;
  label: string;
  modelName?: string | null;
  status?: number | null;
  startTime?: number | null;
  endTime?: number | null;
}

export interface AiUsageSnapshot {
  provider: string;
  region: string;
  fetchedAt: number;
  endpoint: string | null;
  windows: Record<string, AiUsageWindow | null>;
  credits?: unknown;
  weeklyBoostPermille?: number | null;
  level?: string | null;
  usageSummary?: Record<string, unknown> | null;
  toolUsageDetails?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface AiUsageHistory {
  days: Array<{ date: string; percent: number; used?: number | null }>;
}

export interface AiUsageCachedResponse {
  ok: boolean;
  providers?: Record<string, AiUsageSnapshot | null>;
  histories?: Record<string, AiUsageHistory>;
  reason?: string;
  error?: string;
}

export interface AiUsageFetchOptions {
  provider?: AiUsageProvider;
  region?: "cn" | "global";
}

export interface AiUsageFetchSuccess {
  ok: true;
  provider: string;
  snapshot?: AiUsageSnapshot;
  reason?: string;
  error?: string;
  status?: number;
}

export interface AiUsageFetchFailure {
  ok: false;
  provider?: string;
  reason?: string;
  error?: string;
  status?: number;
}

export type AiUsageFetchResponse = AiUsageFetchSuccess | AiUsageFetchFailure;

export interface AiUsageAlertPrefs {
  enabled: boolean;
  absMinPct: number;
  spikeRatio: number;
  reAlertStepPct: number;
  lastNotified: Record<string, { date: string; percent: number }>;
}

export interface AiUsageAlertPrefsResponse {
  ok: boolean;
  prefs?: AiUsageAlertPrefs;
  reason?: string;
  error?: string;
}

export interface AiUsageUpdatedPayload {
  provider: string;
  snapshot: AiUsageSnapshot;
  history: AiUsageHistory;
}

export interface AiUsageApiContract {
  aiUsageGetCached(): Promise<AiUsageCachedResponse>;
  aiUsageFetch(opts: AiUsageFetchOptions): Promise<AiUsageFetchResponse>;
  aiUsageAlertPrefsGet(): Promise<AiUsageAlertPrefsResponse>;
  aiUsageAlertPrefsSet(
    patch: Partial<AiUsageAlertPrefs>,
  ): Promise<AiUsageAlertPrefsResponse>;
  onAiUsageUpdated(cb: Callback<AiUsageUpdatedPayload>): Unsubscribe;
}

export interface TrayPrefsContract {
  version: number;
  segments: Record<string, boolean>;
}

export interface TrayPrefsResponse {
  ok: boolean;
  prefs?: TrayPrefsContract;
  reason?: string;
  error?: string;
}

export interface PulseTrayApiContract {
  openConfig(): void;
  closeConfigModal(): void;
  getPrefs(): Promise<TrayPrefsResponse>;
  savePrefs(prefs: TrayPrefsContract): Promise<TrayPrefsResponse>;
  onOpenConfig(cb: () => void): Unsubscribe;
  onCloseConfigModal(cb: () => void): Unsubscribe;
}

export type ConfigField = "watchlist" | "reminders" | "funds" | "ai_prompts";

export interface ConfigDiffEntry {
  field: ConfigField;
  status: "removed" | "added" | "same" | "changed";
  currentCount: number;
  incomingCount: number;
  summary: string;
}

export interface ConfigExportSuccess {
  ok: true;
  path: string;
  sizeBytes: number;
  reason?: string;
  error?: string;
}

export interface ConfigExportFailure {
  ok: false;
  reason?: string;
  error?: string;
}

export type ConfigExportResponse = ConfigExportSuccess | ConfigExportFailure;

export interface ConfigImportFields {
  watchlist?: unknown;
  reminders?: unknown;
  funds?: unknown;
  ai_prompts?: unknown;
}

export interface ConfigImportSuccess {
  ok: true;
  diff: ConfigDiffEntry[];
  fields: ConfigImportFields;
  filePath: string;
  reason?: string;
  error?: string;
}

export interface ConfigImportFailure {
  ok: false;
  reason?: string;
  error?: string;
  unknownFields?: string[];
}

export type ConfigImportLoadResponse = ConfigImportSuccess | ConfigImportFailure;

export interface ConfigImportApplyPayload {
  fields: ConfigImportFields;
}

export interface ConfigImportApplySuccess {
  ok: true;
  applied: ConfigField[];
  reason?: string;
  error?: string;
}

export interface ConfigImportApplyFailure {
  ok: false;
  reason?: string;
  error?: string;
  applied?: ConfigField[];
}

export type ConfigImportApplyResponse =
  | ConfigImportApplySuccess
  | ConfigImportApplyFailure;

export interface ConfigPortabilityApiContract {
  configExport(pulseVersion?: string): Promise<ConfigExportResponse | null>;
  configImportLoad(): Promise<ConfigImportLoadResponse | null>;
  configImportApply(payload: ConfigImportApplyPayload): Promise<ConfigImportApplyResponse>;
}

export type FundCategory = "stock" | "bond" | "money" | "qdii" | "other";
export type FundNavSource = "tiantian" | "sina";

export interface FundHoldingInput {
  code: string;
  name?: string;
  category?: FundCategory;
  shares: number;
  costNav: number;
  note?: string;
  id?: string;
  addedAt?: number;
  _amount?: number;
}

export type FundHoldingPatch = Partial<FundHoldingInput>;

export interface FundHistoryOptions {
  days?: number;
}

export interface FundAlertPrefsPatch {
  enabled?: boolean;
  profitPct?: number;
  lossPct?: number;
}

export interface FundsListResponse {
  ok: boolean;
  holdings: unknown[];
  deletedIds?: unknown[];
  navSource?: string;
  alertPrefs?: unknown;
  reason?: string;
  message?: string;
}

export interface FundsMutationResponse {
  ok: boolean;
  holding?: unknown;
  holdings?: unknown[];
  all?: FundsListResponse;
  reason?: string;
  error?: string;
  message?: string;
}

export interface FundsSearchResponse {
  ok: boolean;
  results: Array<{ code: string; latestNav?: number; [key: string]: any }>;
  reason?: string;
  error?: string;
}

export interface FundsNavResponse {
  ok: boolean;
  results?: Record<string, unknown>;
  errors?: Record<string, unknown>;
  fetchedAt?: number | null;
  reason?: string;
  message?: string;
}

export interface FundsNavStateResponse {
  ok: boolean;
  status: string;
  lastFetch: number | null;
  nextFetch: number | null;
  reason?: string;
}

export interface FundsNavStatePayload {
  status: string;
  lastFetch: number | null;
  nextFetch: number | null;
  ok?: boolean;
}

export interface FundsHistoryListResponse {
  ok: boolean;
  dailySnapshots: unknown[];
  reason?: string;
}

export interface FundsSeriesResponse {
  ok: boolean;
  series: unknown[];
  cached?: boolean;
  reason?: string | null;
}

export interface FundsAlertPrefsResponse {
  ok: boolean;
  alertPrefs?: unknown;
  reason?: string;
}

export interface FundsNavSourceResponse {
  ok: boolean;
  navSource?: string;
  reason?: string;
}

export interface FundsApiContract {
  fundsList(): Promise<FundsListResponse>;
  fundsAdd(input: FundHoldingInput): Promise<FundsMutationResponse>;
  fundsUpdate(id: string, patch: FundHoldingPatch): Promise<FundsMutationResponse>;
  fundsRemove(id: string): Promise<FundsMutationResponse>;
  fundsRestore(id: string): Promise<FundsMutationResponse>;
  fundsSearch(query: string): Promise<FundsSearchResponse>;
  fundsBackfill(code: string): Promise<FundsMutationResponse>;
  fundsNavFetch(): Promise<FundsNavResponse>;
  fundsNavFetchCodes(codes: string[]): Promise<FundsNavResponse>;
  fundsNavState(): Promise<FundsNavStateResponse>;
  fundsHistoryList(): Promise<FundsHistoryListResponse>;
  fundsNavHistory(code: string, opts: FundHistoryOptions): Promise<FundsSeriesResponse>;
  fundsIndexHistory(symbol: string, opts: FundHistoryOptions): Promise<FundsSeriesResponse>;
  fundsSetNavSource(source: FundNavSource): Promise<FundsNavSourceResponse>;
  fundsAlertPrefsGet(): Promise<FundsAlertPrefsResponse>;
  fundsAlertPrefsSet(patch: FundAlertPrefsPatch): Promise<FundsAlertPrefsResponse>;
  onFundsNavFetched(cb: Callback<FundsNavFetchedPayload>): Unsubscribe;
  onFundsNavState(cb: Callback<FundsNavStatePayload>): Unsubscribe;
  onFundsHistoryUpdated(cb: Callback<FundsHistoryUpdatedPayload>): Unsubscribe;
}

export interface FundsNavFetchedPayload {
  fetchedAt: number | null;
  results?: Record<string, unknown>;
  errors?: Record<string, unknown>;
}

export interface FundsHistoryUpdatedPayload {
  dailySnapshots?: unknown[];
}

export interface FinanceRefreshOptions {
  force?: boolean;
  timeoutMs?: number;
}

export type FinanceNewsSort = "time" | "popularity";

export interface FinanceGetNewsOptions {
  category?: string;
  sort?: FinanceNewsSort;
  search?: string;
}

export interface FinanceArticleIdPayload {
  id: string;
}

export interface FinanceRelatedOptions extends FinanceArticleIdPayload {
  limit?: number;
}

export interface FinanceInterpretOptions extends FinanceArticleIdPayload {
  force?: boolean;
  statePath?: string;
  llmOpts?: Record<string, unknown>;
}

export interface FinanceInterpretClearOptions extends FinanceArticleIdPayload {
  statePath?: string;
}

export interface FinanceAggregateOptions {
  category?: string;
  force?: boolean;
  statePath?: string;
  llmOpts?: Record<string, unknown>;
}

export interface FinanceAiResponse {
  ok: boolean;
  reason?: string;
  error?: string;
  cached?: boolean;
  [key: string]: unknown;
}

export interface FinanceRefreshResponse {
  ok: boolean;
  added?: number;
  total?: number;
  ts?: number;
  errorsPerSource?: Record<string, unknown>;
  reason?: string;
  message?: string;
}

export interface FinanceNewsErrorResponse extends IpcFailure {
  items: FinArticle[];
}

export type FinanceNewsResponse = FinArticle[] | FinanceNewsErrorResponse;

export interface FinanceQuoteSnapshot {
  ts: number;
  indices: Record<string, unknown>;
  fx: Record<string, unknown>;
}

export interface FinanceQuoteErrorResponse extends IpcFailure {
  indices: Record<string, unknown>;
  fx: Record<string, unknown>;
}

export type FinanceQuoteResponse = FinanceQuoteSnapshot | FinanceQuoteErrorResponse;

export interface FinanceGetArticleResponse {
  ok: boolean;
  article?: FinArticle;
  reason?: string;
  message?: string;
}

export interface FinanceMutationResponse {
  ok: boolean;
  id?: string;
  favorited?: boolean;
  reason?: string;
  message?: string;
}

export interface FinanceApiContract {
  financeRefreshNews(opts: FinanceRefreshOptions): Promise<FinanceRefreshResponse>;
  financeGetNews(args: FinanceGetNewsOptions): Promise<FinanceNewsResponse>;
  financeGetCategories(): Promise<Record<string, number>>;
  financeGetArticle(args: FinanceArticleIdPayload): Promise<FinanceGetArticleResponse>;
  financeGetRelated(args: FinanceRelatedOptions): Promise<FinArticle[]>;
  financeRefreshQuotes(opts: FinanceRefreshOptions): Promise<FinanceRefreshResponse>;
  financeGetQuotes(): Promise<FinanceQuoteResponse>;
  financeToggleFavorite(args: FinanceArticleIdPayload): Promise<FinanceMutationResponse>;
  financeMarkRead(args: FinanceArticleIdPayload): Promise<FinanceMutationResponse>;
  financeInterpret(args: FinanceInterpretOptions): Promise<FinanceAiResponse>;
  financeInterpretClear(args: FinanceInterpretClearOptions): Promise<FinanceAiResponse>;
  financeAggregate(args: FinanceAggregateOptions): Promise<FinanceAiResponse>;
  onFinanceNewsUpdated(cb: Callback<unknown>): Unsubscribe;
  onFinanceQuotesUpdated(cb: Callback<unknown>): Unsubscribe;
}

export interface MetalConfigContract {
  watchedIds: string[];
  holdings: Record<string, unknown>;
  deletedIds: string[];
  historyMap?: Record<string, unknown[]>;
  lastBackfillAt?: number;
}

export type MetalHolding = Record<string, unknown> | null;

export interface MetalConfigPatch {
  watchedIds?: string[];
  holdings?: Record<string, MetalHolding>;
  deletedIds?: string[];
  historyMap?: Record<string, unknown[]>;
  lastBackfillAt?: number;
}

export interface MetalQuoteCacheContract {
  data: Record<string, unknown>;
  errors: Record<string, unknown>;
  fetchedAt: number | null;
}

export interface MetalFxCacheContract {
  rate: number | null;
  fetchedAt: number | null;
}

export interface MetalFetchResponse {
  ok: boolean;
  quotes?: MetalQuoteCacheContract;
  fx?: MetalFxCacheContract;
  historyMap?: Record<string, unknown>;
  reason?: string;
  error?: string;
}

export interface MetalQuoteChangedPayload {
  quotes?: MetalQuoteCacheContract;
  fx?: MetalFxCacheContract;
}

export interface MetalStateResponse {
  scheduler: { status: string; lastFetch?: number | null; nextFetch?: number | null };
  quotes: MetalQuoteCacheContract;
  fx: MetalFxCacheContract;
}

export interface MetalsApiContract {
  list(): Promise<MetalConfigContract>;
  updateConfig(patch: MetalConfigPatch): Promise<MetalConfigContract>;
  upsertHolding(id: string, holding: MetalHolding): Promise<MetalConfigContract>;
  removeHolding(id: string): Promise<MetalConfigContract>;
  fetchNow(): Promise<MetalFetchResponse>;
  getState(): Promise<MetalStateResponse>;
  getHistory(): Promise<{ historyMap: Record<string, unknown>; source?: Record<string, unknown> }>;
  onQuoteChanged(cb: Callback<MetalQuoteChangedPayload>): Unsubscribe;
  onStateUpdate(cb: Callback<MetalStateResponse["scheduler"]>): Unsubscribe;
  onHistoryChanged(cb: Callback<{ historyMap?: Record<string, unknown> }>): Unsubscribe;
}

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export interface ThemeStateResponse {
  mode: ThemeMode;
  resolved: ResolvedTheme;
}

export interface ThemeChangedPayload extends ThemeStateResponse {
  source?: "tray" | "system" | "renderer" | string;
}

/** Theme methods exposed on the main renderer API namespace. */
export interface ThemeSyncApiContract {
  themeSet(mode: ThemeMode): Promise<ThemeStateResponse>;
  onThemeChanged(cb: Callback<ThemeChangedPayload>): Unsubscribe;
}

/** Theme methods kept on metalsApi for the legacy theme-manager path. */
export interface ThemeControlApiContract extends ThemeSyncApiContract {
  themeGet(): Promise<ThemeStateResponse>;
}

export interface IthomeArticleRecord {
  id: string;
  title?: string;
  link?: string;
  dateKey?: string;
  readAt?: number;
  [key: string]: any;
}

export interface IthomeNewsPayload {
  ok: boolean;
  ts: number;
  articles: Record<string, IthomeArticleRecord>;
  summaries: Record<string, any>;
  favorites: Record<string, any>;
  dayStats: Record<string, { count: number; fetchedAt: number }>;
}

export interface IthomeFetchResponse extends Omit<IpcFailure, "ok"> {
  ok: boolean;
  dateKey?: string;
  added?: number;
  total?: number;
  dayCount?: number;
  ts?: number;
  status?: number;
}

export interface IthomeArticleBodyResponse extends Omit<IpcFailure, "ok"> {
  ok: boolean;
  body: string;
  reason?: string;
  detail?: string;
}

export interface IthomeArticleIdPayload {
  id: string;
}

export interface IthomeSummarizePayload extends IthomeArticleIdPayload {
  force?: number | boolean;
}

export interface IthomeSummaryResponse extends Omit<IpcFailure, "ok"> {
  ok: boolean;
  id?: string;
  text?: string;
  abstract?: string;
  keywords?: string[];
  domain?: string;
  impact?: string;
  cached?: boolean;
  whyImportant?: string;
  risks?: string[];
  followUps?: string[];
  evidence?: string[];
  completeness?: string;
}

export interface IthomeFavoriteResponse extends Omit<IpcFailure, "ok"> {
  ok: boolean;
  id?: string;
  favorited?: boolean;
}

export interface IthomeApiContract {
  ithomeLoadNews(): Promise<IthomeNewsPayload>;
  ithomeRefreshNews(dateKey: string): Promise<IthomeFetchResponse>;
  ithomeFetchDay(dateKey: string): Promise<IthomeFetchResponse>;
  ithomeFetchArticleBody(payload: IthomeArticleIdPayload): Promise<IthomeArticleBodyResponse>;
  ithomeSummarizeArticle(payload: IthomeSummarizePayload): Promise<IthomeSummaryResponse>;
  ithomeToggleFavorite(payload: IthomeArticleIdPayload): Promise<IthomeFavoriteResponse>;
  ithomeMarkRead(id: string): Promise<{ ok: boolean; reason?: string }>;
  ithomeShareCard(id: string): Promise<any>;
}

export interface AiLeaderboardOptions {
  category?: string;
  dimension?: string;
  vendor?: string;
  sortDir?: "asc" | "desc";
  search?: string;
  force?: boolean;
  sources?: Record<string, boolean>;
}

export interface AiLeaderboardItem {
  id: string;
  name: string;
  vendor?: string;
  [key: string]: any;
}

export interface AiLeaderboardResponse {
  ok: boolean;
  category?: string;
  dimension?: string;
  vendor?: string;
  items: AiLeaderboardItem[];
  sources: Record<string, string>;
  sourceCoverage: Record<string, number>;
  attribution: any[];
  count: number;
  stale: boolean;
  fromCache: boolean;
  isSample: boolean;
  fetchedAt: string | null;
  lastUpdated: string | null;
  rateBudget?: Record<string, any>;
  errors: Array<Record<string, any>>;
  reason?: string;
  error?: string;
}

export interface AiRateBudget {
  used: number;
  limit: number;
  remaining: number;
  dayResetsAt: string | null;
  lastAcquireAt: number | null;
}

export interface AiLeaderboardExportResponse {
  ok: boolean;
  cancelled?: boolean;
  path?: string;
  error?: string;
}

export interface AiLeaderboardApiContract {
  getLeaderboard(opts: AiLeaderboardOptions): Promise<AiLeaderboardResponse>;
  refreshLeaderboard(opts: AiLeaderboardOptions): Promise<AiLeaderboardResponse>;
  rateBudget(): Promise<AiRateBudget>;
  exportLeaderboardCsv(payload: { csv: string; filenameSuggestion?: string }): Promise<AiLeaderboardExportResponse>;
}

export interface StockRow {
  code: string;
  name: string;
  price: number | null;
  changePct: number | null;
  turnover: number | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  industry: string | null;
  marketCap: number | null;
  revenueGrowthYoY: number | null;
  netIncomeGrowthYoY: number | null;
  [key: string]: any;
}

export interface StockSearchEntry {
  code: string;
  name: string;
  industry?: string | null;
  price?: number | null;
  changePct?: number | null;
  [key: string]: any;
}

export type StockMarketCapTier = "all" | "large" | "mid" | "small";
export type StockSortKey =
  | "name"
  | "price"
  | "changePct"
  | "pe"
  | "pb"
  | "roe"
  | "industry"
  | "marketCap"
  | "turnover"
  | "revenueGrowthYoY"
  | "netIncomeGrowthYoY";

export interface StockScreenerCriteria {
  peMin?: number | null;
  peMax?: number | null;
  pbMin?: number | null;
  pbMax?: number | null;
  roeMin?: number | null;
  dividendYieldMin?: number | null;
  turnoverMin?: number | null;
  turnoverMax?: number | null;
  change5dMin?: number | null;
  revenueGrowthYoYMin?: number | null;
  netIncomeGrowthYoYMin?: number | null;
  marketCapTier?: StockMarketCapTier;
  industries?: string[];
  [key: string]: unknown;
}

export interface StockSortOptions {
  key?: StockSortKey;
  dir?: "asc" | "desc";
}

export interface StockScreenPayload {
  criteria?: StockScreenerCriteria;
  sort?: StockSortOptions;
}

export interface StockAiIntentChip {
  id: string;
  label?: string;
}

export interface StockAiAdvisePayload {
  intentChip: StockAiIntentChip;
  freeText?: string;
  currentCriteria?: StockScreenerCriteria;
  statePath?: string;
}

export interface StockDetailAnglesPayload {
  code: string;
  angles: string[];
}

export interface StockDetailAnalyzePayload {
  code: string;
  angles: string[];
  perAngleData?: Record<string, unknown>;
  scores?: Record<string, unknown>;
  freeText?: string;
}

export interface StockAngleRefreshPayload {
  angleKey: string;
  perAngleData?: Record<string, unknown>;
  scores?: Record<string, unknown>;
  seed?: number;
}

export interface StockAngleReloadPayload {
  code: string;
  angleKey: string;
}

export interface StockExportDiagnosisOptions {
  defaultName?: string;
}

export interface StocksScreenResponse extends Omit<IpcFailure, "ok"> {
  ok: boolean;
  results: StockRow[];
  total: number;
  fetchedAt?: number;
  fromCache?: boolean;
  /** 实际行情提供方；cache 语义由 fromCache 单独表达。 */
  source?: "eastmoney" | "sina" | "unknown";
  /** 高命中率筛选可能只拉取前 N 条，必须显式提示调用方。 */
  truncated?: boolean;
  error?: string;
}

export interface StocksSearchResponse extends Omit<IpcFailure, "ok"> {
  ok: boolean;
  results: StockSearchEntry[];
  fromCache?: boolean;
  error?: string;
}

export interface StockAiAdviseResult {
  criteria?: Record<string, any>;
  sortConfig?: { key?: string; dir?: "asc" | "desc" } | null;
  summary?: string;
  [key: string]: any;
}

export interface StockAiAdviseResponse extends Omit<IpcFailure, "ok"> {
  ok: boolean;
  result?: StockAiAdviseResult;
  fromCache?: boolean;
  error?: string;
}

export interface StockAngleState {
  angleKey?: string;
  status: "ok" | "failed";
  data?: any;
  reason?: string;
  error?: string | null;
  fetchedAt?: number;
  lastSuccessAt?: number | null;
  failureStreakCount?: number;
}

export interface StockDetailAnglesData {
  perAngle: Record<string, StockAngleState>;
  fulfilledCount?: number;
  totalCount?: number;
}

export interface StockDetailAnglesResponse extends Omit<IpcFailure, "ok"> {
  ok: boolean;
  data?: StockDetailAnglesData;
  perAngle?: Record<string, StockAngleState>;
  fromCache?: boolean;
  error?: string;
}

export interface StockDetailAnalyzeResponse extends Omit<IpcFailure, "ok"> {
  ok: boolean;
  result?: any;
  fromCache?: boolean;
  attempts?: number;
  degraded?: boolean;
  error?: string;
}

export interface StockAngleRefreshResponse extends Omit<IpcFailure, "ok"> {
  ok: boolean;
  angleKey?: string;
  note?: any;
  error?: string;
}

export interface StockAngleReloadResponse extends Omit<IpcFailure, "ok"> {
  ok: boolean;
  perAngle?: StockAngleState;
  error?: string;
}

export interface StockExportResponse extends Omit<IpcFailure, "ok"> {
  ok: boolean;
  path?: string;
  sizeBytes?: number;
  error?: string;
}

export type DetectResultsExportFormat = "json" | "csv";

export interface DetectResultsExportOptions {
  format: DetectResultsExportFormat;
}

export interface DetectResultsExportResponse extends Omit<IpcFailure, "ok"> {
  ok: boolean;
  path?: string;
  sizeBytes?: number;
  rowCount?: number;
  format?: DetectResultsExportFormat;
}

export interface StocksApiContract {
  stocksScreen(payload: StockScreenPayload): Promise<StocksScreenResponse>;
  stocksSearch(query: string): Promise<StocksSearchResponse>;
  stocksAiAdvise(payload: StockAiAdvisePayload): Promise<StockAiAdviseResponse>;
  stocksDetailAngles(payload: StockDetailAnglesPayload): Promise<StockDetailAnglesResponse>;
  stocksDetailAnalyze(payload: StockDetailAnalyzePayload): Promise<StockDetailAnalyzeResponse>;
  stocksAngleRefresh(payload: StockAngleRefreshPayload): Promise<StockAngleRefreshResponse>;
  stocksAngleReload(payload: StockAngleReloadPayload): Promise<StockAngleReloadResponse>;
  stocksExportDiagnosisPng(payload: StockExportDiagnosisOptions): Promise<StockExportResponse>;
}

export interface WechatHotItem {
  rank: number;
  title: string;
  url: string;
  heat?: string;
  tag?: string;
}

export interface WechatHotPayload {
  ok?: true;
  items: WechatHotItem[];
  fetchedAt: number;
  source: string;
}

export interface WechatHotReadResponse {
  ok: boolean;
  readIds?: Record<string, number>;
  reason?: string;
}

export interface WechatHotApiContract {
  wechatHotLoad(): Promise<WechatHotPayload>;
  wechatHotRefresh(): Promise<WechatHotPayload | IpcFailure>;
  wechatHotLoadRead(): Promise<Record<string, number>>;
  wechatHotMarkRead(title: string): Promise<WechatHotReadResponse>;
  onWechatHotUpdated(cb: Callback<WechatHotPayload>): Unsubscribe;
}

export interface MovieItem {
  id: string;
  title: string;
  enTitle?: string;
  rating?: number;
  ratingLabel?: string;
  poster?: string;
  wish?: number;
  showInfo?: string;
  releaseDate?: string;
  comingTitle?: string;
  showState?: string;
  genres?: string[];
  durationMin?: number;
  summary?: string;
  director?: string;
  trailerUrl?: string;
  backdrop?: string;
  source: string;
  isSample?: boolean;
}

export interface MoviesPayload {
  ok?: true;
  nowPlaying: MovieItem[];
  coming: MovieItem[];
  fetchedAt: number;
  source: string;
  cityId?: number;
  degraded?: boolean;
  comingNote?: string;
}

export interface MoviesTmdbKeyInfo {
  ok: true;
  key: string;
  source: "settings" | "env" | "";
}

export interface MovieWatchlistItem {
  movieId: string;
  cityId: number;
  title: string;
  poster?: string;
  releaseDate?: string;
  createdAt: number;
  reminderId?: string;
}

export interface MovieWatchlistResponse {
  ok: boolean;
  watched?: boolean;
  items?: MovieWatchlistItem[];
  reason?: string;
}

export interface MoviesApiContract {
  moviesLoad(): Promise<MoviesPayload | null>;
  moviesRefresh(cityId?: number): Promise<MoviesPayload>;
  moviesDetail(movieId: string): Promise<MovieItem | IpcFailure>;
  moviesTmdbKeyGet(): Promise<MoviesTmdbKeyInfo>;
  moviesTmdbKeySet(key: string): Promise<{ ok: true }>;
  moviesWatchlistList(): Promise<MovieWatchlistResponse>;
  moviesWatchlistToggle(input: Omit<MovieWatchlistItem, "createdAt" | "reminderId">): Promise<MovieWatchlistResponse>;
  moviesCinemas(input: MoviesCinemasInput): Promise<MoviesCinemasResponse | IpcFailure>;
  moviesCinemaShows(input: MoviesCinemaShowsInput): Promise<MoviesCinemaShowsResponse | IpcFailure>;
  moviesCinemaFilters(input: MoviesCinemaFiltersInput): Promise<MoviesCinemaFiltersResponse | IpcFailure>;
  onMoviesUpdated(cb: Callback<MoviesPayload>): Unsubscribe;
}

export interface MoviesCinemasInput {
  movieId: string;
  cityId: number;
  day: string;
  districtId?: number;
  areaId?: number;
  offset?: number;
}

export interface MovieCinemaItem {
  id: string;
  name: string;
  address?: string;
  distance?: string;
  sellPrice?: string;
  hallTypes?: string[];
  maoyanUrl?: string;
}

export interface MoviesCinemasResponse {
  ok: true;
  movieId: string;
  cityId: number;
  day: string;
  districtId?: number;
  areaId?: number;
  cinemas: MovieCinemaItem[];
  hasMore: boolean;
  total: number;
  source: string;
}

export interface MoviesCinemaFiltersInput {
  cityId: number;
}

export interface MovieCinemaArea {
  id: number;
  name: string;
  count?: number;
}

export interface MovieCinemaDistrict {
  id: number;
  name: string;
  count?: number;
  areas?: MovieCinemaArea[];
}

export interface MoviesCinemaFiltersResponse {
  ok: true;
  cityId: number;
  districts: MovieCinemaDistrict[];
  source: string;
}

export interface MoviesCinemaShowsInput {
  movieId: string;
  cinemaId: string;
  cityId: number;
  day?: string;
}

export interface MovieShowSlot {
  time: string;
  hall?: string;
  lang?: string;
  type?: string;
  price?: string;
  seqNo?: string;
}

export interface MovieShowDay {
  date?: string;
  label?: string;
  slots: MovieShowSlot[];
}

export interface MoviesCinemaShowsResponse {
  ok: true;
  movieId: string;
  cinemaId: string;
  cinemaName?: string;
  cityId: number;
  days: MovieShowDay[];
  source: string;
}

// ─── 演出票监控（票牛 + 摩天轮国际站） ────────────────

export type ConcertPlatformId = "piaoniu" | "motianlun" | "moretickets";

export interface ConcertSession {
  id: string;
  name: string;
  time?: string;
  minPrice?: string;
  originalPrice?: string;
  currencySymbol?: string;
  /** 归一枚举：ONSALE / SOLDOUT / UPCOMING / ENDED */
  status: string;
  hasTicket: boolean;
  ticketsNumber?: number;
  /** 票牛：刷新时嵌入的票档明细（盯档差分用） */
  tiers?: Array<{
    id: string;
    name: string;
    lowPrice?: string;
    originPrice?: string;
    ticketsNum?: number;
    hasTicket: boolean;
    qtyPrices?: Array<{ qty: number; salePrice: string }>;
  }>;
}

/** 单个 watch 的最新快照；error 字段 = 本轮抓取失败但保留了旧数据 */
export interface ConcertSnapshot {
  platform: ConcertPlatformId;
  key: string;
  title: string;
  city?: string;
  venue?: string;
  posterUrl?: string;
  detailUrl: string;
  sessions: ConcertSession[];
  fetchedAt: number;
  source: string;
  error?: string;
}

export interface ConcertWatchItem {
  /** piaoniu:{activityId} | motianlun:{showId} | moretickets:{tourId}/{showId} */
  id: string;
  platform: ConcertPlatformId;
  activityId?: string;
  tourId?: string;
  showId?: string;
  sessionId?: string;
  ticketCount?: number;
  url: string;
  createdAt: number;
  /** 票牛 / 摩天轮国内：用户钉选盯价的票档 id */
  watchedTierIds?: string[];
  /** 钉选档购票张数（1–10，默认 1） */
  watchedTierQty?: Record<string, number>;
}

export interface ConcertsPayload {
  watches: ConcertWatchItem[];
  snapshots: Record<string, ConcertSnapshot>;
  fetchedAt: number;
  source: string;
}

export interface ConcertTiersResponse {
  ok: true;
  eventId: string;
  tiers: Array<{
    id: string;
    name: string;
    lowPrice?: string;
    originPrice?: string;
    ticketsNum?: number;
    hasTicket: boolean;
  }>;
}

export interface ConcertAddResponse {
  ok: boolean;
  added?: boolean;
  item?: ConcertWatchItem;
  payload?: ConcertsPayload;
  reason?: string;
}

export interface ConcertsApiContract {
  concertsLoad(): Promise<ConcertsPayload | null>;
  concertsRefresh(): Promise<ConcertsPayload>;
  concertsAdd(input: { url: string }): Promise<ConcertAddResponse>;
  concertsRemove(id: string): Promise<{ ok: boolean; reason?: string; payload?: ConcertsPayload }>;
  concertsTiers(input: { eventId: string | number }): Promise<ConcertTiersResponse | IpcFailure>;
  concertsSetWatchedTiers(input: {
    watchId: string;
    tierIds: string[];
    tierQty?: Record<string, number>;
  }): Promise<{ ok: boolean; item?: ConcertWatchItem; payload?: ConcertsPayload; reason?: string }>;
  onConcertsUpdated(cb: Callback<ConcertsPayload>): Unsubscribe;
}


export interface RecentActivityEntry {
  ts: number;
  kind: string;
  ref: string;
  label: string;
  meta?: Record<string, any>;
  count?: number;
  lastTs?: number;
}

export interface RecentListResponse {
  ok: boolean;
  entries: RecentActivityEntry[];
  reason?: string;
  msg?: string;
}

export interface RecentPushResponse {
  ok: boolean;
  deduped?: boolean;
  reason?: string;
}

export interface RecentUpdatedPayload {
  entries: RecentActivityEntry[];
  deduped?: boolean;
}

export interface RecentApiContract {
  recentList(): Promise<RecentListResponse>;
  recentPush(entry: Omit<RecentActivityEntry, "ts"> & { ts?: number }): Promise<RecentPushResponse>;
  onRecentUpdated(cb: Callback<RecentUpdatedPayload>): Unsubscribe;
}

export type ReminderRepeat = "once" | "daily" | "weekdays" | "weekly";

export type ReminderStatus = "pending" | "fired" | "dismissed";

export interface Reminder {
  id: string;
  title: string;
  triggerAt: number;
  repeat: ReminderRepeat;
  weekday?: number;
  status: ReminderStatus;
  createdAt: number;
  firedAt?: number;
  lastNotifiedAt?: number;
}

export interface ReminderCreateInput {
  title: string;
  triggerAt: number;
  repeat: ReminderRepeat;
  weekday?: number;
}

export type ReminderUpdatePatch = Partial<ReminderCreateInput> & {
  status?: ReminderStatus;
};

export interface ReminderListResponse {
  ok: boolean;
  reminders: Reminder[];
  reason?: string;
  msg?: string;
}

export interface ReminderMutationResponse {
  ok: boolean;
  reminder?: Reminder | null;
  reason?: string;
}

export interface ReminderRemoveResponse {
  ok: boolean;
  reason?: string;
}

export interface ReminderFiredPayload {
  id: string;
  reminder: Reminder;
}

export interface ReminderOpenModalPayload {
  id: string;
}

export interface RemindersApiContract {
  remindersList(): Promise<ReminderListResponse>;
  remindersCreate(input: ReminderCreateInput): Promise<ReminderMutationResponse>;
  remindersUpdate(id: string, patch: ReminderUpdatePatch): Promise<ReminderMutationResponse>;
  remindersRemove(id: string): Promise<ReminderRemoveResponse>;
  remindersMarkDone(id: string): Promise<ReminderMutationResponse>;
  remindersMarkDismissed(id: string): Promise<ReminderMutationResponse>;
  onRemindersFired(cb: Callback<ReminderFiredPayload>): Unsubscribe;
  onRemindersOpenModal(cb: Callback<ReminderOpenModalPayload>): Unsubscribe;
}

export type WatchlistType = "app" | "fund" | "keyword" | "metal";

export interface WatchlistItem {
  type?: WatchlistType;
  ref?: string;
  appName?: string;
  addedAt?: number;
  lastNotifiedVersion?: string | null;
  latestVersion?: string;
  lastNotifiedNav?: number | null;
  latestNav?: number;
  lastNotifiedPrice?: number | null;
  latestPrice?: number;
  lastMatchKey?: string | null;
  [key: string]: unknown;
}

export interface WatchlistMutationInput {
  type?: WatchlistType;
  ref?: string;
  appName?: string;
}

export interface WatchlistSuccessResponse {
  ok: true;
  items: WatchlistItem[];
}

export interface WatchlistFailureResponse extends IpcFailure {
  ok: false;
  items?: WatchlistItem[];
}

export type WatchlistResponse =
  | WatchlistSuccessResponse
  | WatchlistFailureResponse;

export interface WatchlistApiContract {
  watchlistList(): Promise<WatchlistResponse>;
  watchlistAdd(payload: WatchlistMutationInput | string): Promise<WatchlistResponse>;
  watchlistRemove(payload: WatchlistMutationInput | string): Promise<WatchlistResponse>;
}

export interface ReleaseNotesSlide {
  title?: string;
  subtitle?: string;
  body?: string;
  [key: string]: unknown;
}

export interface ReleaseNotesSlides {
  version: string;
  slides: ReleaseNotesSlide[];
}

export interface ReleaseNotesPayload {
  version: string;
  changelogMd: string | null;
  slides: ReleaseNotesSlides | null;
  alreadySeen?: boolean;
}

export interface ReleaseNotesMarkSeenResponse {
  ok: boolean;
  version: string;
}

export interface ReleaseNotesApiContract {
  releaseNotes: {
    getCurrent(): Promise<ReleaseNotesPayload | null>;
    getVersion(version: string): Promise<ReleaseNotesPayload | null>;
    markSeen(version: string): Promise<ReleaseNotesMarkSeenResponse>;
  };
}

/** Invoke-side channel map for the migrated domains. */
export interface IpcChannelMap {
  "get-config": { args: []; result: AppConfig };
  "get-cached-state": { args: []; result: CachedState | null };
  "brew-upgrade": { args: [cask: string]; result: BrewUpgradeResponse };
  "get-app-icon": { args: [bundlePath: string]; result: AppIconResponse };
  "funds:list": { args: []; result: FundsListResponse };
  "funds:add": { args: [input: FundHoldingInput]; result: FundsMutationResponse };
  "funds:update": { args: [id: string, patch: FundHoldingPatch]; result: FundsMutationResponse };
  "funds:remove": { args: [id: string]; result: FundsMutationResponse };
  "funds:restore": { args: [id: string]; result: FundsMutationResponse };
  "funds:search": { args: [query: string]; result: FundsSearchResponse };
  "funds:backfill": { args: [code: string]; result: FundsMutationResponse };
  "funds:nav:fetch": { args: []; result: FundsNavResponse };
  "funds:nav:fetch-codes": { args: [codes: string[]]; result: FundsNavResponse };
  "funds:nav:state": { args: []; result: FundsNavStateResponse };
  "funds:history:list": { args: []; result: FundsHistoryListResponse };
  "funds:nav:history": { args: [code: string, opts: FundHistoryOptions]; result: FundsSeriesResponse };
  "funds:index:history": { args: [symbol: string, opts: FundHistoryOptions]; result: FundsSeriesResponse };
  "funds:set-nav-source": { args: [source: FundNavSource]; result: FundsNavSourceResponse };
  "funds:alert-prefs:get": { args: []; result: FundsAlertPrefsResponse };
  "funds:alert-prefs:set": { args: [patch: FundAlertPrefsPatch]; result: FundsAlertPrefsResponse };
  "finance:refresh-news": { args: [opts: FinanceRefreshOptions]; result: FinanceRefreshResponse };
  "finance:get-news": { args: [args: FinanceGetNewsOptions]; result: FinanceNewsResponse };
  "finance:categories": { args: []; result: Record<string, number> };
  "finance:get-article": { args: [args: FinanceArticleIdPayload]; result: FinanceGetArticleResponse };
  "finance:get-related": { args: [args: FinanceRelatedOptions]; result: FinArticle[] };
  "finance:refresh-quotes": { args: [opts: FinanceRefreshOptions]; result: FinanceRefreshResponse };
  "finance:get-quotes": { args: []; result: FinanceQuoteResponse };
  "finance:toggle-favorite": { args: [args: FinanceArticleIdPayload]; result: FinanceMutationResponse };
  "finance:mark-read": { args: [args: FinanceArticleIdPayload]; result: FinanceMutationResponse };
  "finance:interpret": { args: [args: FinanceInterpretOptions]; result: FinanceAiResponse };
  "finance:interpret-clear": { args: [args: FinanceInterpretClearOptions]; result: FinanceAiResponse };
  "finance:aggregate": { args: [args: FinanceAggregateOptions]; result: FinanceAiResponse };
  "metals:list": { args: []; result: MetalConfigContract };
  "metals:config:update": { args: [payload: { patch: MetalConfigPatch }]; result: MetalConfigContract };
  "metals:holding:upsert": { args: [payload: { id: string; holding: MetalHolding }]; result: MetalConfigContract };
  "metals:holding:remove": { args: [payload: { id: string }]; result: MetalConfigContract };
  "metals:quote:fetch": { args: []; result: MetalFetchResponse };
  "metals:quote:state": { args: []; result: MetalStateResponse };
  "metals:history:get": { args: []; result: { historyMap: Record<string, unknown> } };
  "theme:get": { args: []; result: ThemeStateResponse };
  "theme:set": { args: [mode: ThemeMode]; result: ThemeStateResponse };
  "ai-usage:get-cached": { args: []; result: AiUsageCachedResponse };
  "ai-usage:fetch": { args: [opts: AiUsageFetchOptions]; result: AiUsageFetchResponse };
  "ai-usage:alert-prefs:get": { args: []; result: AiUsageAlertPrefsResponse };
  "ai-usage:alert-prefs:set": { args: [patch: Partial<AiUsageAlertPrefs>]; result: AiUsageAlertPrefsResponse };
  "self-update:get-state": { args: []; result: SelfUpdateGetStateResponse };
  "self-update:check": { args: []; result: SelfUpdateActionResponse };
  "self-update:install": { args: []; result: SelfUpdateActionResponse };
  "ai-prompts:load": { args: []; result: AiPromptsLoadResponse };
  "ai-prompts:save": { args: [payload: AiPromptsSavePayload]; result: AiPromptsSaveResponse };
  "ai-prompts:reset": { args: [key: string]; result: AiPromptsResetResponse };
  "ai-tasks:list": { args: [opts?: AiTasksListOptions]; result: AiTasksListResponse };
  "ai-tasks:summarize": { args: [opts: AiTasksSummarizeOptions]; result: AiTasksSummarizeResponse };
  "ai-sessions:open-session": { args: [target: string]; result: AiSessionOpenResponse };
  "ai-sessions:set-key": { args: [providerId: string, apiKey: string]; result: AiKeySetResponse };
  "ai-sessions:clear-key": { args: [providerId: string]; result: AiKeyClearResponse };
  "ai-sessions:has-key": { args: [providerId: string]; result: AiKeyStatusResponse };
  "ai-sessions:healthcheck": { args: [opts: AiHealthcheckOptions]; result: AiHealthcheckResponse };
  "ai-sessions:get-config": { args: []; result: AiSessionsConfigResponse };
  "ai-sessions:save-config": { args: [config: AiSessionsConfig | null]; result: AiSessionsConfigResponse };
  "ai:get-shared-config": { args: []; result: AiSharedConfigResponse };
  "feedback:record": { args: [payload: AiFeedbackRecordPayload]; result: AiFeedbackRecordResponse };
  "feedback:export": { args: []; result: AiFeedbackExportResponse };
  "token-budget:get": { args: []; result: TokenBudgetGetResponse };
  "token-budget:set": { args: [config: TokenBudgetConfig]; result: TokenBudgetSetResponse };
  "upgrade-advice:fetch": { args: [opts: AiUpgradeAdviceOptions]; result: AiUpgradeAdviceResponse };
  "changelog-summary:fetch": { args: [opts: AiChangelogSummaryOptions]; result: AiChangelogSummaryResponse };
  "check-updates": { args: []; result: CheckUpdatesResponse };
  "check-updates:cancel": { args: [jobId?: string]; result: CheckCancelResponse };
  "window:minimize": { args: []; result: void };
  "window:toggle-maximize": { args: []; result: WindowToggleMaximizeResponse };
  "window:close": { args: []; result: void };
  "open-url:open": { args: [url: string]; result: OpenUrlResponse };
  "get-mutes": { args: []; result: MutesResponse };
  "set-mute": { args: [name: string, durationSec: number]; result: MuteMutationResponse };
  "clear-mute": { args: [name: string]; result: MuteMutationResponse };
  "get-last-opened": { args: []; result: LastOpenedResponse };
  "refresh-last-opened": { args: []; result: LastOpenedRefreshResponse };
  "bulk-upgrade:start": { args: [items: BulkUpgradeItem[]]; result: BulkUpgradeStartResponse };
  "bulk-upgrade:cancel": { args: []; result: BulkUpgradeCancelResponse };
  "get-active-category": { args: []; result: ActiveCategoryResponse };
  "save-active-category": { args: [id: string]; result: ActiveCategoryMutationResponse };
  "get-last-active-nav": { args: []; result: LastActiveNavResponse };
  "save-last-active-nav": { args: [key: string]; result: LastActiveNavMutationResponse };
  "versions:command-search": { args: [payload: CommandSearchPayload]; result: CommandSearchResponse };
  "github:fetch": { args: [payload: GithubRequestPayload]; result: GithubFetchResponse };
  "github:fetch-release": { args: [payload: GithubRequestPayload]; result: GithubReleaseResponse };
  "ai:parse-readme": { args: [payload: AiReadmeParsePayload]; result: AiReadmeParseResponse };
  "search:query": { args: [payload: { q?: string; source?: string | null }]; result: SearchQueryResponse };
  "search:upsert": { args: [doc: SearchDocument]; result: void };
  "digest:fetch-sections": { args: []; result: DigestFetchResponse };
  "digest:update-settings": { args: [payload: DigestUpdateSettingsPayload]; result: DigestUpdateSettingsResponse };
  "ithome:load-news": { args: []; result: IthomeNewsPayload };
  "ithome:refresh-news": { args: [dateKey: string]; result: IthomeFetchResponse };
  "ithome:fetch-day": { args: [dateKey: string]; result: IthomeFetchResponse };
  "ithome:fetch-article-body": { args: [payload: IthomeArticleIdPayload]; result: IthomeArticleBodyResponse };
  "ithome:summarize-article": { args: [payload: IthomeSummarizePayload]; result: IthomeSummaryResponse };
  "ithome:toggle-favorite": { args: [payload: IthomeArticleIdPayload]; result: IthomeFavoriteResponse };
  "ithome:mark-read": { args: [id: string]; result: { ok: boolean; reason?: string } };
  "ithome:share-card": { args: [payload: { id: string }]; result: any };
  "leaderboard:get": { args: [opts: AiLeaderboardOptions]; result: AiLeaderboardResponse };
  "leaderboard:refresh": { args: [opts: AiLeaderboardOptions]; result: AiLeaderboardResponse };
  "leaderboard:rate-budget": { args: []; result: AiRateBudget };
  "leaderboard:export-csv": { args: [payload: { csv: string; filenameSuggestion?: string }]; result: AiLeaderboardExportResponse };
  "stocks:screen": { args: [payload: StockScreenPayload]; result: StocksScreenResponse };
  "stocks:search": { args: [query: string]; result: StocksSearchResponse };
  "stocks:ai-advise": { args: [payload: StockAiAdvisePayload]; result: StockAiAdviseResponse };
  "stocks:detail-angles": { args: [payload: StockDetailAnglesPayload]; result: StockDetailAnglesResponse };
  "stocks:detail-analyze": { args: [payload: StockDetailAnalyzePayload]; result: StockDetailAnalyzeResponse };
  "stocks:angle-refresh": { args: [payload: StockAngleRefreshPayload]; result: StockAngleRefreshResponse };
  "stocks:angle-reload": { args: [payload: StockAngleReloadPayload]; result: StockAngleReloadResponse };
  "stocks:export-diagnosis-png": { args: [payload: StockExportDiagnosisOptions]; result: StockExportResponse };
  "detect-results:export": { args: [opts: DetectResultsExportOptions]; result: DetectResultsExportResponse };
  "wechat-hot:load": { args: []; result: WechatHotPayload };
  "wechat-hot:refresh": { args: []; result: WechatHotPayload | IpcFailure };
  "wechat-hot:load-read": { args: []; result: Record<string, number> };
  "wechat-hot:mark-read": { args: [title: string]; result: WechatHotReadResponse };
  "movies:load": { args: []; result: MoviesPayload | null };
  "movies:refresh": { args: [cityId?: number]; result: MoviesPayload };
  "movies:detail": { args: [movieId: string]; result: MovieItem | IpcFailure };
  "movies:tmdb-key-get": { args: []; result: { ok: true; key: string; source: "settings" | "env" | "" } };
  "movies:tmdb-key-set": { args: [key: string]; result: { ok: true } };
  "movies:watchlist-list": { args: []; result: MovieWatchlistResponse };
  "movies:watchlist-toggle": { args: [input: Omit<MovieWatchlistItem, "createdAt" | "reminderId">]; result: MovieWatchlistResponse };
  "movies:cinemas": { args: [input: MoviesCinemasInput]; result: MoviesCinemasResponse | IpcFailure };
  "movies:cinema-shows": { args: [input: MoviesCinemaShowsInput]; result: MoviesCinemaShowsResponse | IpcFailure };
  "movies:cinema-filters": { args: [input: MoviesCinemaFiltersInput]; result: MoviesCinemaFiltersResponse | IpcFailure };
  "concerts:load": { args: []; result: ConcertsPayload | null };
  "concerts:refresh": { args: []; result: ConcertsPayload };
  "concerts:add": { args: [input: { url: string }]; result: ConcertAddResponse };
  "concerts:remove": { args: [id: string]; result: { ok: boolean; reason?: string; payload?: ConcertsPayload } };
  "concerts:tiers": { args: [input: { eventId: string | number }]; result: ConcertTiersResponse | IpcFailure };
  "concerts:setWatchedTiers": {
    args: [input: { watchId: string; tierIds: string[]; tierQty?: Record<string, number> }];
    result: { ok: boolean; item?: ConcertWatchItem; payload?: ConcertsPayload; reason?: string };
  };
  "recent:list": { args: []; result: RecentListResponse };
  "recent:push": { args: [entry: Omit<RecentActivityEntry, "ts"> & { ts?: number }]; result: RecentPushResponse };
  "tray:get-prefs": { args: []; result: TrayPrefsResponse };
  "tray:save-prefs": { args: [prefs: TrayPrefsContract]; result: TrayPrefsResponse };
  "config:export": { args: [pulseVersion?: string]; result: ConfigExportResponse | null };
  "config:import-load": { args: []; result: ConfigImportLoadResponse | null };
  "config:import-apply": { args: [payload: ConfigImportApplyPayload]; result: ConfigImportApplyResponse };
  "error:fetch-entries": { args: [opts: ErrorQueryOptions]; result: ErrorEntriesResponse };
  "error:copy-all": { args: []; result: ErrorCopyResponse };
  "error:export-zip": { args: [opts?: Record<string, unknown>]; result: ErrorExportResponse };
  "error:clear-old": { args: [opts?: Record<string, unknown>]; result: ErrorClearResponse };
  "error:open-folder": { args: []; result: ErrorBasicResponse };
  "error:report": { args: [entry: ErrorReportEntry]; result: ErrorReportResponse };
  "diagnostics:fetch": { args: [opts: DiagnosticsFetchOptions]; result: DiagnosticsFetchResponse };
  "diagnostics:fetch-samples": { args: []; result: DiagnosticsSamplesResponse };
  "reminders:list": { args: []; result: ReminderListResponse };
  "reminders:create": { args: [input: ReminderCreateInput]; result: ReminderMutationResponse };
  "reminders:update": { args: [payload: { id: string; patch: ReminderUpdatePatch }]; result: ReminderMutationResponse };
  "reminders:remove": { args: [id: string]; result: ReminderRemoveResponse };
  "reminders:mark-done": { args: [id: string]; result: ReminderMutationResponse };
  "reminders:mark-dismissed": { args: [id: string]; result: ReminderMutationResponse };
  "watchlist:list": { args: []; result: WatchlistResponse };
  "watchlist:add": { args: [payload: WatchlistMutationInput]; result: WatchlistResponse };
  "watchlist:remove": { args: [payload: WatchlistMutationInput]; result: WatchlistResponse };
  "release-notes:get-current": { args: []; result: ReleaseNotesPayload | null };
  "release-notes:get-version": { args: [version: string]; result: ReleaseNotesPayload | null };
  "release-notes:mark-seen": { args: [version: string]; result: ReleaseNotesMarkSeenResponse };
}

export type IpcChannel = keyof IpcChannelMap;
