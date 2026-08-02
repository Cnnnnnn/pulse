/**
 * 足球球员身价榜共享类型 — main parser/index/IPC + renderer store/page 单一形状。
 *
 * 对齐 src/shared/finance-types.ts 模式：业务类型放 shared，main/renderer 都从此 import，
 * 避免手抄 mirror 漂移（历史教训：renderer mirror types.ts 字段曾和 main 不同步）。
 *
 * main 流水线（parser → index.boardPayload → IPC）严格用此类型；
 * renderer store 信号 + page 解构消费同形状。
 */

/** 标准位置四类（对齐 POSITION_META 键）。 */
export type Position = "GK" | "DF" | "MF" | "FW";

/** 数据来源标记。 */
export type SourceKind = "live" | "cache" | "sample";

/** 规范化的球员记录（parser.toPlayer 产出，renderer 消费）。 */
export interface Player {
  id: string;
  name: string;
  /** 归一化位置（GK/DF/MF/FW）；未知兜底 MF，避免筛选全空。 */
  position: Position;
  /** 年龄（整数岁）；缺/异常为 null。 */
  age: number | null;
  club: string;
  /** 联赛名（dcaribou 当前不直接提供，预留 null）。 */
  league: string | null;
  nationality: string;
  /** 身价（整数欧元）。 */
  valueEur: number;
  /** 身价展示标签（"€180m" / "€1.5bn"）；缺省由 formatValueEur 派生。 */
  valueLabel: string;
  /** dcaribou 榜单排名（按身价降序）；sample 兜底为 0。 */
  rank: number;
  /** 头像 URL；缺省 null（UI 用首字母 fallback）。 */
  portraitUrl: string | null;
  /** 是否示例数据（sample 兜底时 true）。 */
  isSample: boolean;
}

/** 归属说明（信任条 / 脚注展示）。 */
export interface Attribution {
  id: string;
  text: string;
  url: string | null;
  required: boolean;
}

/**
 * getFootballValueBoard 对外稳定契约（main → IPC → renderer store）。
 * normalizeBoardResult（renderer）按此形状容错归一。
 */
export interface BoardResult {
  ok: boolean;
  players: Player[];
  count: number;
  source: SourceKind;
  fetchedAt: string;
  /** 是否过期缓存（TTL 外回退时 true）。 */
  stale: boolean;
  /** 是否示例数据。 */
  isSample: boolean;
  /** 部分源失败明细（norm.ok 但 errors.length>0 → 部分态）。 */
  errors: string[];
  attribution: Attribution[];
  /** IPC 层附加：是否命中请求级缓存（仅 register-football-value 注入）。 */
  fromCache?: boolean;
  /** IPC 层附加：全量失败原因（ok=false 时）。 */
  reason?: string;
  error?: string;
}

/** parser.parseTopPlayers 返回形状。 */
export interface ParseResult {
  players: Player[];
  ok: boolean;
  count: number;
  errors?: string[];
}

/** HttpClient.get 注入依赖（fetcher 唯一 IO 边界）。 */
export interface HttpClientLike {
  get(
    url: string,
    opts?: {
      headers?: Record<string, string>;
      timeout?: number;
      binary?: boolean;
      maxBodyBytes?: number;
    },
  ): Promise<{ status: number; body: string | Buffer; headers?: Record<string, string>; error?: string }>;
}
