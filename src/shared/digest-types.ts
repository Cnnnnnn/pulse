/**
 * src/shared/digest-types.ts
 *
 * v3.0 alpha: 早报 (digest) 扩展类型.
 *
 * 关键变化:
 *   - DailyDigestConfig 增加 subscribed_sections + llm_rewrite_enabled
 *   - 新增 BriefingSnapshot 给 drawer 离线打开用
 *
 * 与 aggregate.ts SECTION_ORDER 同步: updates / hot / news / funds / ai_usage
 *   + v3.1: ai_movers (AI 榜单异动) / github_releases (GitHub 收录更新)
 */

export type DigestKind =
  | "updates"
  | "hot"
  | "news"
  | "funds"
  | "ai_usage"
  | "ai_movers"
  | "github_releases";

export const DIGEST_KIND_ORDER: DigestKind[] = [
  "updates",
  "hot",
  "news",
  "funds",
  "ai_usage",
  "ai_movers",
  "github_releases",
];

export const DIGEST_KIND_LABEL: Record<DigestKind, string> = {
  updates: "可升级应用",
  hot: "微博热搜",
  news: "IT 新闻",
  funds: "基金变动",
  ai_usage: "AI 用量预警",
  ai_movers: "AI 榜单异动",
  github_releases: "GitHub 收录更新",
};

export type DailyDigestConfig = {
  enabled: boolean;
  time: string; // 'HH:MM'
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  subscribed_sections: DigestKind[];
  llm_rewrite_enabled: boolean;
  last_push_date?: string | null;
};

export type BriefingSnapshot = {
  date: string;
  generatedAt: number;
  sections: Array<{ kind: DigestKind; items: Array<Record<string, unknown>> }>;
  lines: string[];
  rewritten: boolean;
};

// 默认 — 全部订阅, LLM 改写默认关 (alpha 保守)
export function defaultDigestConfig(): DailyDigestConfig {
  return {
    enabled: true,
    time: "08:30",
    quiet_hours_start: null,
    quiet_hours_end: null,
    subscribed_sections: [...DIGEST_KIND_ORDER],
    llm_rewrite_enabled: false,
    last_push_date: null,
  };
}

export type DigestConfigResponse = {
  ok: boolean;
  config?: DailyDigestConfig;
  reason?: string;
  error?: string;
};

export type DigestPreviewResponse = {
  ok: boolean;
  date?: string;
  sections?: BriefingSnapshot["sections"];
  lines?: string[];
  reason?: string;
  error?: string;
};
