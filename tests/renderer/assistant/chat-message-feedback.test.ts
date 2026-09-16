import { describe, expect, it } from "vitest";
import {
  FEEDBACK_REASON_LABELS,
  FEEDBACK_REASONS,
  feedbackReasonTag,
  formatFeedbackSummary,
  isFeedbackReason,
  summarizeMessageFeedback,
} from "../../../src/renderer/assistant/chat-message-feedback";

describe("chat-message-feedback — 点踩原因", () => {
  it("四种原因定义与标签一一对应", () => {
    expect(FEEDBACK_REASONS).toEqual(["wrong", "no_tool", "off_topic", "verbose"]);
    for (const r of FEEDBACK_REASONS) {
      expect(FEEDBACK_REASON_LABELS[r].length).toBeGreaterThan(0);
    }
  });

  it("isFeedbackReason 只认白名单", () => {
    expect(isFeedbackReason("wrong")).toBe(true);
    expect(isFeedbackReason("nope")).toBe(false);
    expect(isFeedbackReason(undefined)).toBe(false);
    expect(isFeedbackReason(42)).toBe(false);
  });

  it("feedbackReasonTag 生成 reason: 前缀的 tag", () => {
    expect(feedbackReasonTag("no_tool")).toBe("reason:no_tool");
  });

  it("summarizeMessageFeedback 按原因统计点踩分布", () => {
    const stats = summarizeMessageFeedback([
      { role: "assistant", feedback: "up" },
      { role: "assistant", feedback: "down", feedbackReason: "wrong" },
      { role: "assistant", feedback: "down", feedbackReason: "wrong" },
      { role: "assistant", feedback: "down", feedbackReason: "no_tool" },
      { role: "assistant", feedback: "down" }, // 未标注原因 → 不进 byReason
    ] as any);
    expect(stats).toEqual({ up: 1, down: 4, byReason: { wrong: 2, no_tool: 1 } });
  });

  it("formatFeedbackSummary 展示原因分布", () => {
    expect(
      formatFeedbackSummary({ up: 2, down: 3, byReason: { wrong: 2, no_tool: 1 } }),
    ).toBe("赞 2 · 踩 3（答错了 2 / 该调工具没调 1）");
    expect(formatFeedbackSummary({ up: 0, down: 2 })).toBe("踩 2");
    expect(formatFeedbackSummary({ up: 0, down: 0 })).toBe("");
  });
});
