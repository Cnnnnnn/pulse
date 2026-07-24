/**
 * src/renderer/components/appTypes.ts
 *
 * App / Result / Section 共享的最小模型 — 减少子组件里 `any` 的同时,
 * 不试图做完整 schema (主进程那边 `src/main/types/result.ts` 是权威).
 *
 * ponytail: 这里只列 Phase 4 components 叶子层实际读到的字段. 后续
 * Batch 切到完整 schema 时再扩, 不要一次贪全.
 */

export type ResultLike = {
  name: string;
  bundle?: string;
  status?: string;
  source?: string;
  note?: string;
  current_version?: string;
  installed_version?: string;
  latest_version?: string;
  has_update?: boolean;
  brew_cask?: string;
  ts?: number;
  error_message?: string;
  authoritative_last_success_at?: number;
  changelog?: string;
  changelog_source_version?: string;
  changelog_url?: string;
  release_notes_url?: string;
};

export type Section = {
  key: string;
  label: string;
  color: string;
  dotColor: string;
  items: string[];
};