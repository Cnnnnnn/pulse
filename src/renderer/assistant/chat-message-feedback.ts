/**
 * 助手消息点赞/点踩切换与统计 + 点踩原因。
 *
 * 点踩原因是把二值反馈变成「可用于迭代 prompt 的结构化信号」的关键 ——
 * 只知「踩了」无法判断该改什么；知道「该调工具没调」就能直接补 CORE_RULES。
 * 原因最终经 eval 候选导出（见 assistant-eval-export 的 tag）。
 */
import type { AiChatMessage } from "../../shared/ipc-contracts";

export type MessageFeedback = "up" | "down";

/** 点踩原因（仅 down 时有意义） */
export type FeedbackReason = "wrong" | "no_tool" | "off_topic" | "verbose";

/** 原因展示顺序 = UI chip 顺序 */
export const FEEDBACK_REASONS: readonly FeedbackReason[] = [
  "wrong",
  "no_tool",
  "off_topic",
  "verbose",
];

export const FEEDBACK_REASON_LABELS: Record<FeedbackReason, string> = {
  wrong: "答错了",
  no_tool: "该调工具没调",
  off_topic: "答非所问",
  verbose: "太啰嗦",
};

export function isFeedbackReason(v: unknown): v is FeedbackReason {
  return typeof v === "string" && (FEEDBACK_REASONS as readonly string[]).includes(v);
}

/** eval 候选 tag（形如 `reason:no_tool`） */
export function feedbackReasonTag(reason: FeedbackReason): string {
  return `reason:${reason}`;
}

export type FeedbackStats = {
  up: number;
  down: number;
  /** 按原因计数的点踩分布（未标注原因的不计入） */
  byReason?: Partial<Record<FeedbackReason, number>>;
};

export function nextMessageFeedback(
  current: MessageFeedback | undefined,
  vote: MessageFeedback,
): MessageFeedback | undefined {
  return current === vote ? undefined : vote;
}

export function summarizeMessageFeedback(
  messages: AiChatMessage[],
): FeedbackStats {
  let up = 0;
  let down = 0;
  const byReason: Partial<Record<FeedbackReason, number>> = {};
  for (const m of messages) {
    if (m.feedback === "up") up++;
    else if (m.feedback === "down") {
      down++;
      const r = (m as { feedbackReason?: unknown }).feedbackReason;
      if (isFeedbackReason(r)) byReason[r] = (byReason[r] ?? 0) + 1;
    }
  }
  return {
    up,
    down,
    // 无任何原因标注时不输出 byReason —— 保持旧调用方的深度相等断言兼容
    ...(Object.keys(byReason).length > 0 ? { byReason } : {}),
  };
}

export function formatFeedbackSummary(stats: FeedbackStats): string {
  if (stats.up === 0 && stats.down === 0) return "";
  const parts: string[] = [];
  if (stats.up > 0) parts.push(`赞 ${stats.up}`);
  if (stats.down > 0) {
    const reasonStr = FEEDBACK_REASONS.filter((r) => (stats.byReason?.[r] ?? 0) > 0)
      .map((r) => `${FEEDBACK_REASON_LABELS[r]} ${stats.byReason![r]}`)
      .join(" / ");
    parts.push(reasonStr ? `踩 ${stats.down}（${reasonStr}）` : `踩 ${stats.down}`);
  }
  return parts.join(" · ");
}

export function countEmptyThreads(
  threads: { messages: AiChatMessage[] }[],
): number {
  return threads.filter((t) => t.messages.length === 0).length;
}
