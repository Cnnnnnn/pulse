/**
 * src/main/state-store-schema.ts
 *
 * Lightweight, hand-rolled state.json schema. No zod — just a small
 * declarative spec + pure validator. Forward-compat: unknown top-level
 * fields are allowed (so PRESERVE_FIELDS additions don't break old builds).
 *
 * This module must stay dependency-free (require only Node built-ins).
 */
"use strict";

const STATE_SCHEMA_VERSION = 1;

// Per-field type spec. Each entry is a predicate function.
// If a field is absent it's "ok" (optional). If present, must match.
const FIELD_SPECS: Record<string, { kind: string; required?: boolean }> = {
  v:                 { kind: 'number', required: true },
  ts:                { kind: 'number' },
  apps:              { kind: 'object', required: true },
  mutes:             { kind: 'object' },
  last_opened:       { kind: 'object' },
  active_category:   { kind: 'string' },
  last_active_nav:   { kind: 'string' },  // P-N: HomeGrid 落点 ('funds'|'metals'|'invest'|...)
  ai_sessions_config: { kind: 'object' },
  classify_llm_cache: { kind: 'object' },
  task_summaries:    { kind: 'object' },
  funds:             { kind: 'object' },
  ithome_news:       { kind: 'object' },
  reminders:         { kind: 'array' },
  recentActivity:    { kind: 'array' },
  ai_usage:          { kind: 'object' },
  ai_usage_history:  { kind: 'object' },
  ai_usage_alert_prefs: { kind: 'object' },
  circuitBreakers:   { kind: 'object' },
  daily_digest:       { kind: 'object' },
  tray_menu_prefs:    { kind: 'object' },
  startup_samples:    { kind: 'array' },
  watchlist:          { kind: 'array' },
  last_seen_release:  { kind: 'object' },
  wechat_hot:         { kind: 'object' },
  ai_prompts:         { kind: 'object' },
  upgrade_advice_cache: { kind: 'object' },
  changelog_summary_cache: { kind: 'object' },
  aiFeedback:         { kind: 'array' },   // A8: AI 反馈样本 cap-500
  assistantMemory:    { kind: 'array' },   // P3-14: 助手长期记忆 [{ id, text, createdAt }]
  assistantThreads:   { kind: 'object' },  // P3-12: 助手会话持久化备份 { activeId, threads }
  tokenSpend:         { kind: 'object' },  // P71: 每日 token 消耗 {"YYYY-MM-DD": number}
  tokenBudgetConfig:  { kind: 'object' },  // P71: { dailyLimit, mode }
  stockScreener:      { kind: 'object' },
  aiStockAdviseCache: { kind: 'object' },
  stockDetailCache:   { kind: 'object' },
  overviewCache:      { kind: 'object' },
  metals:             { kind: 'object' },
};

function isObject(v: any): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isArray(v: any): boolean {
  return Array.isArray(v);
}

function fieldMatches(value: any, spec: { kind: string }): boolean {
  if (value === undefined) return true; // optional, absent is fine
  if (spec.kind === 'object') return isObject(value);
  if (spec.kind === 'array') return isArray(value);
  if (spec.kind === 'string') return typeof value === 'string';
  if (spec.kind === 'number') return typeof value === 'number' && Number.isFinite(value);
  return false;
}

/**
 * @param {*} obj
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateState(obj: any): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isObject(obj)) {
    return { ok: false, errors: ['state is not an object'] };
  }
  for (const [field, spec] of Object.entries(FIELD_SPECS)) {
    if (spec.required && !(field in obj)) {
      errors.push(`missing required field: ${field}`);
      continue;
    }
    if (field in obj && !fieldMatches(obj[field], spec)) {
      errors.push(`field ${field} has wrong type (expected ${spec.kind})`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function isStateValid(obj: any): boolean {
  return validateState(obj).ok;
}

export interface StateMigrationResult {
  state: any;
  migrated: boolean;
  fromVersion: number;
  toVersion: number;
}

/**
 * Upgrade state files created before the explicit v1 envelope existed.
 *
 * Only an absent/zero version with a valid apps object is eligible. We do not
 * repair malformed known fields here; those must still fail validation and go
 * through the normal corrupt-state backup path.
 */
export function migrateState(obj: any): StateMigrationResult {
  if (!isObject(obj)) {
    return {
      state: obj,
      migrated: false,
      fromVersion: 0,
      toVersion: STATE_SCHEMA_VERSION,
    };
  }

  const rawVersion = obj.v;
  const fromVersion = rawVersion === undefined ? 0 : rawVersion;
  if (
    typeof fromVersion !== "number" ||
    !Number.isInteger(fromVersion) ||
    fromVersion >= STATE_SCHEMA_VERSION ||
    !isObject(obj.apps)
  ) {
    return {
      state: obj,
      migrated: false,
      fromVersion: typeof fromVersion === "number" ? fromVersion : 0,
      toVersion: STATE_SCHEMA_VERSION,
    };
  }

  const state = { ...obj, v: STATE_SCHEMA_VERSION };
  if (!("ts" in state)) state.ts = 0;
  if (!("mutes" in state)) state.mutes = {};
  if (!("last_opened" in state)) state.last_opened = {};
  if (!("active_category" in state)) state.active_category = "all";

  return {
    state,
    migrated: true,
    fromVersion,
    toVersion: STATE_SCHEMA_VERSION,
  };
}

module.exports = {
  STATE_SCHEMA_VERSION,
  validateState,
  isStateValid,
  migrateState,
  FIELD_SPECS,
};
